// ============================================
// _shared.js — Shared utilities for all API endpoints
// Ported from Cloudflare Pages Functions (Request/Response) to Vercel's
// Node.js serverless function convention (req, res). Everything that
// talks to Firebase (getToken/fbGet/fbPush/fbSet/fbUpdate/fbDelete) is
// unchanged — it only ever used standard fetch()/crypto.subtle, which
// work the same way on Vercel's Node.js runtime.
// ============================================

// ─── CORS ──────────────────────────────────
// Restricted to ALLOWED_ORIGIN (set this to your deployed app's exact
// origin, e.g. "https://smt-engineer-report.vercel.app") rather than '*'.
// Auth here is a Bearer token, not a cookie, so a wildcard origin was never
// a CSRF hole — but it did let any page on the internet relay requests
// using a stolen token. Falls back to '*' only if ALLOWED_ORIGIN isn't set,
// so this doesn't break local dev before you configure it.
export function setCors(res) {
    const allowedOrigin = (process.env.ALLOWED_ORIGIN || '').trim();
    const production = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    // Same-origin deployments do not need CORS. In production, never silently
    // fall back to '*' when the allow-list is misconfigured. Keep '*' only for
    // local development convenience.
    if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    else if (!production) res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function jsonResponse(res, data, status = 200) {
    setCors(res);
    res.status(status).json(data);
}

export function errorResponse(res, message, status = 400) {
    setCors(res);
    res.status(status).json({ ok: false, error: message });
}

export function handleOptions(res) {
    setCors(res);
    res.status(204).end();
}

// ─── SANITIZE ──────────────────────────────
export function sanitize(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.replace(/[#$[\]/]/g, '').trim().slice(0, maxLen);
}

// Like sanitize(), but for date/time strings such as "MM/DD/YYYY HH:MM:SS".
// sanitize() strips '/' because that character is illegal in Firebase *keys*
// — but dtStr is only ever stored as a *value*, and its '/' separators are
// required by the client's date parser (parseDT). Stripping them silently
// corrupted every date on import, which made every defect row unparseable
// once read back (rawDef ended up empty, breaking Yield/DPPM entirely).
// This keeps '/' and ':' but still strips genuinely Firebase-illegal chars
// as defense in depth.
export function sanitizeDate(str, maxLen = 30) {
    if (typeof str !== 'string') return '';
    return str.replace(/[#$[\]]/g, '').trim().slice(0, maxLen);
}

// Stricter sanitizer for values used as Firebase *path segments* (e.g. record IDs).
// Unlike sanitize(), this also strips '.' since periods are illegal in Firebase keys.

// Strict validation for defect timestamps. Values are stored as data, not keys,
// so sanitizeDate() preserves their separators; this helper additionally rejects
// impossible calendar/clock values and trailing junk.
export function isValidDateTime(str) {
    const s = String(str || '').trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return false;
    const [, mm, dd, yyyy, hh, min, ss] = m;
    const month = Number(mm);
    const day = Number(dd);
    const year = Number(yyyy);
    const hour = Number(hh);
    const minute = Number(min);
    const second = Number(ss || 0);
    if (month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
    const dt = new Date(year, month - 1, day, hour, minute, second);
    return dt.getFullYear() === year &&
        dt.getMonth() === month - 1 &&
        dt.getDate() === day &&
        dt.getHours() === hour &&
        dt.getMinutes() === minute &&
        dt.getSeconds() === second;
}

// Matches the "YYYY-Www" week labels isoWeek() in datetime.js produces
// (e.g. "2026-W33"), weeks 01-53. Used to reject free-text garbage in any
// field that's supposed to be one of these labels (CAPA history keys,
// production-volume import rows) instead of silently accepting it as a
// Firebase key/value the way sanitizeKey()/sanitizeText() alone would.
const ISO_WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
export function isValidIsoWeek(str) {
    return typeof str === 'string' && ISO_WEEK_RE.test(str);
}

export function sanitizeKey(str, maxLen = 20) {
    if (typeof str !== 'string') return '';
    return str.replace(/[.#$[\]/]/g, '').trim().slice(0, maxLen);
}

// Looser sanitizer for free-text VALUES that are never used as Firebase
// key/path segments — customer/model/defect names, part names, notes, root
// cause, corrective action, PIC, etc. Firebase VALUES don't have the
// character restrictions that KEYS do, so there's no reason to strip
// '#', '$', '[', ']', or '/' from them — doing so silently corrupted
// legitimate input like "Mounter #3" or model "RK3399/V2". This is the
// same class of bug sanitizeDate() above was already created to fix for
// dtStr; this generalizes that fix to every other free-text value field.
// Anything that DOES get used as a path segment should still go through
// sanitize() or sanitizeKey() instead.
export function sanitizeText(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
}

// ─── JWT AUTH ──────────────────────────────
function pemToArrayBuffer(pem) {
    const base64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    return buffer.buffer;
}

async function makeJWT(payload, privateKeyPem) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encode = obj => btoa(JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signingInput = `${encode(header)}.${encode(payload)}`;
    const keyData = pemToArrayBuffer(privateKeyPem);
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(signingInput)
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${signingInput}.${sig}`;
}

// Module-scope cache: on Vercel, a "warm" serverless instance is reused
// across consecutive requests, so this survives between calls (though not
// across cold starts). Without it, every single API call — even two fired
// a second apart during a batched import — re-signed a JWT and did a full
// round trip to Google's OAuth endpoint for a token that's valid for an
// hour. Refreshed 60s before actual expiry to leave margin for in-flight
// requests.
let cachedToken = null; // { token, expiresAt } (expiresAt in epoch seconds)

export async function getToken(env) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.expiresAt - 60 > now) {
        return cachedToken.token;
    }

    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const jwt = await makeJWT({
        iss: env.FIREBASE_CLIENT_EMAIL,
        sub: env.FIREBASE_CLIENT_EMAIL,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'
    }, privateKey);
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));

    cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
    return data.access_token;
}

// ─── DATABASE URL ──────────────────────────
function dbURL(env) {
    return `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
}

// ─── FIREBASE REST HELPERS ─────────────────
export async function fbGet(env, token, path) {
    const res = await fetch(`${dbURL(env)}/${path}.json`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
}

export async function fbGetWithEtag(env, token, path) {
    const res = await fetch(`${dbURL(env)}/${path}.json`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return { data: await res.json(), etag: res.headers.get('ETag') };
}

/**
 * Atomically transforms one RTDB value using its ETag. A concurrent writer
 * causes HTTP 412, in which case the latest value is re-read and the transform
 * is retried. This is the REST equivalent of a Firebase transaction.
 */
export async function fbTransaction(env, token, path, transform, maxRetries = 6) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const { data, etag } = await fbGetWithEtag(env, token, path);
        const next = await transform(data);
        const res = await fetch(`${dbURL(env)}/${path}.json`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(etag ? { 'If-Match': etag } : {})
            },
            body: JSON.stringify(next === undefined ? null : next)
        });
        if (res.ok) return res.json();
        if (res.status !== 412) throw new Error(`TRANSACTION ${path} failed: ${res.status}`);
    }
    throw new Error(`TRANSACTION ${path} conflicted too many times; retry the operation.`);
}

export async function fbPush(env, token, path, data) {
    const res = await fetch(`${dbURL(env)}/${path}.json`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PUSH ${path} failed: ${res.status}`);
    return res.json();
}

export async function fbSet(env, token, path, data) {
    const res = await fetch(`${dbURL(env)}/${path}.json`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`SET ${path} failed: ${res.status}`);
    return res.json();
}

export async function fbUpdate(env, token, path, data) {
    const res = await fetch(`${dbURL(env)}/${path}.json`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`UPDATE ${path} failed: ${res.status}`);
    return res.json();
}

export async function fbDelete(env, token, path) {
    const res = await fetch(`${dbURL(env)}/${path}.json`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
    return res.json();
}

// ─── VERIFIED FIREBASE AUTH ─────────────────────────────────────────────
// The v3 API accepts only Firebase ID tokens. The token is validated through
// Firebase's identity toolkit endpoint, then the resulting email is checked
// against OWNER_EMAIL. The old X-User-Email trust model is intentionally removed.

function bearerToken(value) {
    const match = String(value || '').match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

export function isOwnerEmail(env, email) {
    const allowed = (env.OWNER_EMAIL || '').trim().toLowerCase();
    if (!allowed) return false;
    return sanitize(email || '', 200).toLowerCase() === allowed;
}

export async function verifyFirebaseIdToken(env, idToken) {
    if (!(env.FIREBASE_WEB_API_KEY || '').trim()) {
        throw new Error('Server not configured: FIREBASE_WEB_API_KEY is missing');
    }
    if (!idToken) throw new Error('Missing authorization token');

    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.users?.[0]) throw new Error('Invalid or expired authentication token');

    const user = data.users[0];
    const email = sanitize(user.email || '', 200).toLowerCase();
    const verified = user.emailVerified === true || user.emailVerified === 'true';
    if (!email || !verified) throw new Error('A verified email account is required');
    return { uid: user.localId || '', email };
}

export async function requireOwner(env, res, authorizationHeader) {
    if (!(env.OWNER_EMAIL || '').trim()) {
        errorResponse(res, 'Server not configured: OWNER_EMAIL is missing', 500);
        return null;
    }
    try {
        const identity = await verifyFirebaseIdToken(env, bearerToken(authorizationHeader));
        if (!isOwnerEmail(env, identity.email)) {
            errorResponse(res, 'Unauthorized', 401);
            return null;
        }
        return identity;
    } catch (err) {
        console.error('auth verification failed:', err.message);
        errorResponse(res, err.message === 'Missing authorization token' ? err.message : 'Unauthorized', 401);
        return null;
    }
}

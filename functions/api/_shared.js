// ============================================
// _shared.js — Shared utilities for all API endpoints
// ============================================

// ─── CORS ──────────────────────────────────
export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Badge',
    'Content-Type': 'application/json'
};

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

export function errorResponse(message, status = 400) {
    return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: CORS_HEADERS });
}

// ─── SANITIZE ──────────────────────────────
export function sanitize(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.replace(/[#$[\]/]/g, '').trim().slice(0, maxLen);
}

// Stricter sanitizer for values used as Firebase *path segments* (e.g. badge IDs).
// Unlike sanitize(), this also strips '.' since periods are illegal in Firebase keys.
export function sanitizeKey(str, maxLen = 20) {
    if (typeof str !== 'string') return '';
    return str.replace(/[.#$[\]/]/g, '').trim().slice(0, maxLen);
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

export async function getToken(env) {
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
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

// ─── VALIDATION CONSTANTS ──────────────────
export const VALID_LINES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
// Catch-all line value for issues that aren't tied to one of the 6 physical
// SMT lines (warehouse, tooling room, facility/cross-line problems, etc).
// Used only for issue submission (submit.js) — line reports (linereport.js)
// still require a real line, since CT/quality data only makes sense per-line.
export const OTHER_LINE = 'Other';
export const VALID_ISSUE_LINES = [...VALID_LINES, OTHER_LINE];
export const VALID_SHIFTS = ['Shift 1 (7AM-3PM)', 'Shift 2 (3PM-11PM)', 'Shift 3 (11PM-7AM)'];
export const VALID_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const VALID_ROLES = ['admin', 'engineer', 'leader', 'technician'];
export const EDIT_LIMIT = 7;

// ─── ROLE PERMISSIONS ──────────────────────
const ROLE_PERMS = {
    admin: ['status', 'remark', 'archive', 'restore', 'delete'],
    engineer: ['status', 'remark', 'archive', 'restore'],
    leader: ['status', 'remark', 'archive'],
    technician: ['status', 'remark']
};

export function can(role, action) {
    return (ROLE_PERMS[role] || []).includes(action);
}

// ─── AUTH HELPER ───────────────────────────
export async function authenticate(env, badge) {
    const token = await getToken(env);
    const user = await fbGet(env, token, `users/${badge}`);
    if (!user) throw new Error('Unauthorized');
    return { token, user, role: user.role || 'technician' };
}

// Verifies the caller (identified by the X-Badge header) exists and has
// the admin role. Returns { error: Response } on failure — check that
// first — or { badge, requester } on success.
export async function requireAdmin(env, token, headerBadge) {
    const badge = sanitizeKey(headerBadge || '');
    if (!badge) return { error: errorResponse('Missing badge', 401) };
    const requester = await fbGet(env, token, `users/${badge}`);
    if (!requester) return { error: errorResponse('Unauthorized', 401) };
    if ((requester.role || 'technician') !== 'admin') {
        return { error: errorResponse('Admin only', 403) };
    }
    return { badge, requester };
}

// ─── OPTIONS HANDLER ───────────────────────
export function handleOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

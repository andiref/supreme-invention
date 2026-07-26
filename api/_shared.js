// ============================================
// _shared.js — Shared utilities for all API endpoints
// Ported from Cloudflare Pages Functions (Request/Response) to Vercel's
// Node.js serverless function convention (req, res). Everything that
// talks to Firebase (getToken/fbGet/fbPush/fbSet/fbUpdate/fbDelete) is
// unchanged — it only ever used standard fetch()/crypto.subtle, which
// work the same way on Vercel's Node.js runtime.
// ============================================

// ─── CORS ──────────────────────────────────
export function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
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

// Stricter sanitizer for values used as Firebase *path segments* (e.g. record IDs).
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

// ─── SOLO-USER AUTH ─────────────────────────
// This app has exactly one user (you). Instead of a Firebase-backed user
// table with roles/permissions, the caller's email — sent via the
// X-User-Email header — is compared against the OWNER_EMAIL environment
// variable (set this in your Vercel project settings). No passwords, no
// user management, no roles: if the email matches, the request is yours.

export function isOwnerEmail(env, email) {
    const allowed = (env.OWNER_EMAIL || '').trim().toLowerCase();
    if (!allowed) return false;
    return sanitize(email || '', 200).toLowerCase() === allowed;
}

// Checks the X-User-Email header against OWNER_EMAIL. On failure, writes
// the error response itself and returns null — check for that. On
// success, returns the (lowercased) email.
export function requireOwner(env, res, headerEmail) {
    if (!(env.OWNER_EMAIL || '').trim()) {
        errorResponse(res, 'Server not configured: OWNER_EMAIL is missing', 500);
        return null;
    }
    const email = sanitize(headerEmail || '', 200).toLowerCase();
    if (!isOwnerEmail(env, email)) {
        errorResponse(res, 'Unauthorized', 401);
        return null;
    }
    return email;
}


// ============================================
// users.js — Login for a single-owner app
//
// There's exactly one user (you). No accounts, no roles, no Firebase
// lookups here — the submitted email is compared directly against the
// OWNER_EMAIL environment variable (set this in Vercel's project
// settings). Matches -> logged in. This endpoint doesn't need Firebase
// credentials at all, since it never touches the database.
// ============================================

import { jsonResponse, errorResponse, handleOptions, sanitize, isOwnerEmail } from './_shared.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return handleOptions(res);
    if (req.method !== 'POST') return errorResponse(res, 'Method not allowed', 405);

    try {
        const env = process.env;
        if (!(env.OWNER_EMAIL || '').trim()) {
            return errorResponse(res, 'Server not configured: OWNER_EMAIL is missing', 500);
        }

        const body = req.body || {};
        if (body.action !== 'login') return errorResponse(res, 'Unknown action');

        const email = sanitize(body.email || '', 200).toLowerCase();
        if (!email || !isOwnerEmail(env, email)) {
            return errorResponse(res, 'Invalid email', 401);
        }

        return jsonResponse(res, { ok: true, user: { email } });

    } catch (err) {
        console.error('users.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

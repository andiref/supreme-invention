// Verified login/session bootstrap for the owner account.
import { jsonResponse, errorResponse, handleOptions, requireOwner } from './_shared.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return handleOptions(res);
    if (req.method !== 'POST') return errorResponse(res, 'Method not allowed', 405);
    try {
        const body = req.body || {};
        if (body.action !== 'login') return errorResponse(res, 'Unknown action');
        const identity = await requireOwner(process.env, res, req.headers.authorization);
        if (!identity) return;
        return jsonResponse(res, { ok: true, user: { email: identity.email, uid: identity.uid, role: 'Owner' } });
    } catch (err) {
        console.error('users.js error:', err.message);
        return errorResponse(res, 'Server error', 500);
    }
}

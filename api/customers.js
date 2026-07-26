// ============================================
// customers.js — Create customers and models
// Solo-user app: no role gating — the one owner does everything.
// ============================================

import {
    jsonResponse, errorResponse, handleOptions,
    sanitize, sanitizeKey, getToken, fbGet, fbPush, fbUpdate, requireOwner
} from './_shared.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return handleOptions(res);
    if (req.method !== 'POST') return errorResponse(res, 'Method not allowed', 405);

    try {
        const env = process.env;
        if (!env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL) {
            return errorResponse(res, 'Missing Firebase credentials', 500);
        }

        const body = req.body || {};
        const email = requireOwner(env, res, req.headers['x-user-email']);
        if (!email) return;

        const token = await getToken(env);

        const action = body.action;
        const now = Date.now();

        // ── ADD CUSTOMER ──────────────────────────────────────────────────
        if (action === 'addCustomer') {
            const name = sanitize(body.name || '', 100);
            if (!name) return errorResponse(res, 'Customer name is required');

            const result = await fbPush(env, token, 'smt_customers', {
                name, created: now, createdBy: email
            });
            return jsonResponse(res, { ok: true, id: result.name });
        }

        // ── ADD MODEL ──────────────────────────────────────────────────────
        if (action === 'addModel') {
            const customerId = sanitizeKey(body.customerId || '', 40);
            const code = sanitize(body.code || '', 60);
            if (!customerId) return errorResponse(res, 'Customer is required');
            if (!code) return errorResponse(res, 'Model code is required');

            const customer = await fbGet(env, token, `smt_customers/${customerId}`);
            if (!customer) return errorResponse(res, 'Customer not found', 404);

            const result = await fbPush(env, token, 'smt_models', {
                customerId, code, status: 'Active', created: now, createdBy: email
            });
            return jsonResponse(res, { ok: true, id: result.name });
        }

        // ── SET MODEL STATUS (Active / EOL) ─────────────────────────────────
        if (action === 'setModelStatus') {
            const modelId = sanitizeKey(body.modelId || '', 40);
            const status = body.status;
            if (!['Active', 'EOL'].includes(status)) return errorResponse(res, 'Invalid status');

            const model = await fbGet(env, token, `smt_models/${modelId}`);
            if (!model) return errorResponse(res, 'Model not found', 404);

            await fbUpdate(env, token, `smt_models/${modelId}`, { status });
            return jsonResponse(res, { ok: true, msg: 'Model updated \u2713' });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('customers.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

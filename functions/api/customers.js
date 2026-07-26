// ============================================
// customers.js — Create customers and models
// Solo-engineer app: any logged-in badge may write here (no role gating,
// unlike the removed status.js/users.js which checked can(role, action)).
// ============================================

import {
    CORS_HEADERS, jsonResponse, errorResponse,
    sanitize, sanitizeKey, getToken, fbGet, fbPush, fbUpdate
} from './_shared.js';

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        if (!env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL) {
            return errorResponse('Missing Firebase credentials', 500);
        }

        const body = await request.json();
        const badge = sanitize(request.headers.get('X-Badge') || '', 20);
        if (!badge) return errorResponse('Missing badge', 401);

        const token = await getToken(env);
        const user = await fbGet(env, token, `users/${badge}`);
        if (!user) return errorResponse('Unauthorized', 401);

        const action = body.action;
        const now = Date.now();

        // ── ADD CUSTOMER ──────────────────────────────────────────────────
        if (action === 'addCustomer') {
            const name = sanitize(body.name || '', 100);
            if (!name) return errorResponse('Customer name is required');

            const result = await fbPush(env, token, 'smt_customers', {
                name, created: now, createdBy: badge
            });
            return jsonResponse({ ok: true, id: result.name });
        }

        // ── ADD MODEL ──────────────────────────────────────────────────────
        if (action === 'addModel') {
            const customerId = sanitizeKey(body.customerId || '', 40);
            const code = sanitize(body.code || '', 60);
            if (!customerId) return errorResponse('Customer is required');
            if (!code) return errorResponse('Model code is required');

            const customer = await fbGet(env, token, `smt_customers/${customerId}`);
            if (!customer) return errorResponse('Customer not found', 404);

            const result = await fbPush(env, token, 'smt_models', {
                customerId, code, status: 'Active', created: now, createdBy: badge
            });
            return jsonResponse({ ok: true, id: result.name });
        }

        // ── SET MODEL STATUS (Active / EOL) ─────────────────────────────────
        if (action === 'setModelStatus') {
            const modelId = sanitizeKey(body.modelId || '', 40);
            const status = body.status;
            if (!['Active', 'EOL'].includes(status)) return errorResponse('Invalid status');

            const model = await fbGet(env, token, `smt_models/${modelId}`);
            if (!model) return errorResponse('Model not found', 404);

            await fbUpdate(env, token, `smt_models/${modelId}`, { status });
            return jsonResponse({ ok: true, msg: 'Model updated \u2713' });
        }

        return errorResponse('Unknown action');

    } catch (err) {
        console.error('customers.js error:', err.message);
        return errorResponse('Server error: ' + err.message, 500);
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

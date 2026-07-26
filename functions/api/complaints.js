// ============================================
// complaints.js — Log and update customer complaints
// Every complaint requires a customer + model (unlike smt_tasks used to —
// a complaint is by definition about a specific customer's model).
// Solo-engineer app: no role gating.
//
// Note: complaints no longer link to a task/issue — the Task board was
// removed, so there's nothing left to link to.
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

        const action = body.action || 'add';

        // ── ADD COMPLAINT ─────────────────────────────────────────────────
        if (action === 'add') {
            const customerId = sanitizeKey(body.customerId || '', 40);
            const modelId = sanitizeKey(body.modelId || '', 40);
            const description = sanitize(body.description || '', 1000);

            if (!customerId) return errorResponse('Customer is required');
            if (!modelId) return errorResponse('Model is required');
            if (!description) return errorResponse('Description is required');

            const customer = await fbGet(env, token, `smt_customers/${customerId}`);
            if (!customer) return errorResponse('Customer not found', 404);
            const model = await fbGet(env, token, `smt_models/${modelId}`);
            if (!model) return errorResponse('Model not found', 404);

            const complaint = {
                customerId, modelId, description,
                status: 'Open', badge, created: Date.now()
            };
            const result = await fbPush(env, token, 'smt_complaints', complaint);
            return jsonResponse({ ok: true, id: result.name });
        }

        // ── UPDATE STATUS ─────────────────────────────────────────────────
        if (action === 'update') {
            const complaintId = sanitizeKey(body.complaintId || '', 40);
            if (!complaintId) return errorResponse('Missing complaint id');

            const complaint = await fbGet(env, token, `smt_complaints/${complaintId}`);
            if (!complaint) return errorResponse('Complaint not found', 404);

            if (!['Open', 'Closed'].includes(body.status)) return errorResponse('Invalid status');
            await fbUpdate(env, token, `smt_complaints/${complaintId}`, { status: body.status });
            return jsonResponse({ ok: true, msg: 'Complaint updated \u2713' });
        }

        return errorResponse('Unknown action');

    } catch (err) {
        console.error('complaints.js error:', err.message);
        return errorResponse('Server error: ' + err.message, 500);
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

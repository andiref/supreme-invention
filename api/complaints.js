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

        const action = body.action || 'add';

        // ── ADD COMPLAINT ─────────────────────────────────────────────────
        if (action === 'add') {
            const customerId = sanitizeKey(body.customerId || '', 40);
            const modelId = sanitizeKey(body.modelId || '', 40);
            const description = sanitize(body.description || '', 1000);

            if (!customerId) return errorResponse(res, 'Customer is required');
            if (!modelId) return errorResponse(res, 'Model is required');
            if (!description) return errorResponse(res, 'Description is required');

            const customer = await fbGet(env, token, `smt_customers/${customerId}`);
            if (!customer) return errorResponse(res, 'Customer not found', 404);
            const model = await fbGet(env, token, `smt_models/${modelId}`);
            if (!model) return errorResponse(res, 'Model not found', 404);

            const complaint = {
                customerId, modelId, description,
                status: 'Open', loggedBy: email, created: Date.now()
            };
            const result = await fbPush(env, token, 'smt_complaints', complaint);
            return jsonResponse(res, { ok: true, id: result.name });
        }

        // ── UPDATE STATUS ─────────────────────────────────────────────────
        if (action === 'update') {
            const complaintId = sanitizeKey(body.complaintId || '', 40);
            if (!complaintId) return errorResponse(res, 'Missing complaint id');

            const complaint = await fbGet(env, token, `smt_complaints/${complaintId}`);
            if (!complaint) return errorResponse(res, 'Complaint not found', 404);

            if (!['Open', 'Closed'].includes(body.status)) return errorResponse(res, 'Invalid status');
            await fbUpdate(env, token, `smt_complaints/${complaintId}`, { status: body.status });
            return jsonResponse(res, { ok: true, msg: 'Complaint updated \u2713' });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('complaints.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

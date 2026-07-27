// ============================================
// complaints.js — Log and update customer complaints
// Every complaint requires a customer + model (unlike smt_tasks used to —
// a complaint is by definition about a specific customer's model).
// Solo-user app: no role gating.
//
// 8D-style fields: only `finding` is required at creation time — location,
// root cause (occurrence/escapee), and corrective action are usually not
// known yet when a complaint first comes in, so they're optional here and
// can be filled in later via `action: 'update'` once the investigation is
// done.
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
            const finding = sanitize(body.finding || '', 1000);
            const location = sanitize(body.location || '', 300);
            const rcOccurrence = sanitize(body.rcOccurrence || '', 1000);
            const rcEscapee = sanitize(body.rcEscapee || '', 1000);
            const correctiveAction = sanitize(body.correctiveAction || '', 1000);

            if (!customerId) return errorResponse(res, 'Customer is required');
            if (!modelId) return errorResponse(res, 'Model is required');
            if (!finding) return errorResponse(res, 'Finding is required');

            const customer = await fbGet(env, token, `smt_customers/${customerId}`);
            if (!customer) return errorResponse(res, 'Customer not found', 404);
            const model = await fbGet(env, token, `smt_models/${modelId}`);
            if (!model) return errorResponse(res, 'Model not found', 404);

            const complaint = {
                customerId, modelId,
                finding, location, rcOccurrence, rcEscapee, correctiveAction,
                status: 'Open', loggedBy: email, created: Date.now()
            };
            const result = await fbPush(env, token, 'smt_complaints', complaint);
            return jsonResponse(res, { ok: true, id: result.name });
        }

        // ── UPDATE (status and/or 8D detail fields) ─────────────────────────
        // Send only the fields you want changed — e.g. { status: 'Closed' }
        // to just toggle status, or { finding, location, rcOccurrence,
        // rcEscapee, correctiveAction } to save an edit to the details.
        if (action === 'update') {
            const complaintId = sanitizeKey(body.complaintId || '', 40);
            if (!complaintId) return errorResponse(res, 'Missing complaint id');

            const complaint = await fbGet(env, token, `smt_complaints/${complaintId}`);
            if (!complaint) return errorResponse(res, 'Complaint not found', 404);

            const patch = {};

            if (body.status !== undefined) {
                if (!['Open', 'Closed'].includes(body.status)) return errorResponse(res, 'Invalid status');
                patch.status = body.status;
            }
            if (body.finding !== undefined) {
                const finding = sanitize(body.finding, 1000);
                if (!finding) return errorResponse(res, 'Finding cannot be empty');
                patch.finding = finding;
            }
            if (body.location !== undefined) patch.location = sanitize(body.location, 300);
            if (body.rcOccurrence !== undefined) patch.rcOccurrence = sanitize(body.rcOccurrence, 1000);
            if (body.rcEscapee !== undefined) patch.rcEscapee = sanitize(body.rcEscapee, 1000);
            if (body.correctiveAction !== undefined) patch.correctiveAction = sanitize(body.correctiveAction, 1000);

            if (!Object.keys(patch).length) return errorResponse(res, 'Nothing to update');

            await fbUpdate(env, token, `smt_complaints/${complaintId}`, patch);
            return jsonResponse(res, { ok: true, msg: 'Complaint updated \u2713' });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('complaints.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

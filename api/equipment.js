// ============================================
// equipment.js — Equipment part follow-up tracker
// Replaces the old Customers/Complaints/Tiers tabs. Tracks parts that need
// to be followed up on (ordered, shipped, received, installed) per machine.
// Same solo-engineer pattern as the rest of the API: no role gating, the
// one owner (OWNER_EMAIL) can do everything.
//
// Paths:
//   smt_equipment/{id} — one row per part follow-up item
//
// Status lifecycle (oldest → newest): Requested → Ordered → In Transit →
// Received → Installed. 'Cancelled' is a side-exit for items that turn out
// not to be needed.
// ============================================

import {
    jsonResponse, errorResponse, handleOptions,
    sanitize, sanitizeKey, getToken, fbGet, fbPush, fbUpdate, fbDelete, requireOwner
} from './_shared.js';

const STATUSES = ['Requested', 'Ordered', 'In Transit', 'Received', 'Installed', 'Cancelled'];
const PRIORITIES = ['Low', 'Medium', 'High'];

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return handleOptions(res);
    if (req.method !== 'POST') return errorResponse(res, 'Method not allowed', 405);

    try {
        const env = process.env;
        if (!env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL) {
            return errorResponse(res, 'Missing Firebase credentials', 500);
        }

        const body = req.body || {};
        const identity = await requireOwner(env, res, req.headers.authorization);
        if (!identity) return;
        const email = identity.email;

        const token = await getToken(env);

        const action = body.action || 'add';

        // ── ADD PART FOLLOW-UP ──────────────────────────────────────────────
        if (action === 'add') {
            const partName = sanitize(body.partName || '', 150);
            const equipment = sanitize(body.equipment || '', 150);
            const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Medium';
            const notes = sanitize(body.notes || '', 1000);

            if (!partName) return errorResponse(res, 'Part name is required');
            if (!equipment) return errorResponse(res, 'Equipment/machine is required');

            const item = {
                partName, equipment, priority, notes,
                status: 'Requested', requestedBy: email,
                created: Date.now(), updated: Date.now()
            };
            const result = await fbPush(env, token, 'smt_equipment', item);
            return jsonResponse(res, { ok: true, id: result.name });
        }

        // ── UPDATE (status and/or details) ──────────────────────────────────
        // Send only the fields you want changed — e.g. { status: 'Ordered' }
        // to just advance the status, or { partName, equipment, priority,
        // notes } to save an edit to the details.
        if (action === 'update') {
            const id = sanitizeKey(body.id || '', 40);
            if (!id) return errorResponse(res, 'Missing item id');

            const existing = await fbGet(env, token, `smt_equipment/${id}`);
            if (!existing) return errorResponse(res, 'Item not found', 404);

            const patch = {};

            if (body.status !== undefined) {
                if (!STATUSES.includes(body.status)) return errorResponse(res, 'Invalid status');
                patch.status = body.status;
            }
            if (body.partName !== undefined) {
                const partName = sanitize(body.partName, 150);
                if (!partName) return errorResponse(res, 'Part name cannot be empty');
                patch.partName = partName;
            }
            if (body.equipment !== undefined) {
                const equipment = sanitize(body.equipment, 150);
                if (!equipment) return errorResponse(res, 'Equipment/machine cannot be empty');
                patch.equipment = equipment;
            }
            if (body.priority !== undefined) {
                if (!PRIORITIES.includes(body.priority)) return errorResponse(res, 'Invalid priority');
                patch.priority = body.priority;
            }
            if (body.notes !== undefined) patch.notes = sanitize(body.notes, 1000);

            if (!Object.keys(patch).length) return errorResponse(res, 'Nothing to update');
            patch.updated = Date.now();

            await fbUpdate(env, token, `smt_equipment/${id}`, patch);
            return jsonResponse(res, { ok: true, msg: 'Updated \u2713' });
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        if (action === 'delete') {
            const id = sanitizeKey(body.id || '', 40);
            if (!id) return errorResponse(res, 'Missing item id');
            await fbDelete(env, token, `smt_equipment/${id}`);
            return jsonResponse(res, { ok: true });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('equipment.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

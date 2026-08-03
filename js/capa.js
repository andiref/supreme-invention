// ============================================
// capa.js — CAPA report entries for the Report tab's defect tracker
// One entry per (customer, defect) pair — deterministic key so the record
// is created on first save and re-used (upserted) every time that same
// defect resurfaces for that customer, instead of spawning duplicates.
// This is what makes it "persistent": fill it in once, then just update
// status/notes as you monitor it, week after week, until you close it out.
//
// Paths:
//   smt_capa/{customerKey}__{defectKey} — one row per customer+defect CAPA
//
// Same solo-engineer auth pattern as the rest of the API: no role gating,
// the one owner (OWNER_EMAIL) can do everything.
// ============================================

import {
    jsonResponse, errorResponse, handleOptions,
    sanitize, sanitizeDate, sanitizeKey, getToken, fbGet, fbSet, fbDelete, requireOwner
} from './_shared.js';

const MONITORING_STATUSES = ['Open', 'Monitoring', 'Effective', 'Closed'];

// Builds the same deterministic key the client uses to look records up
// (see capaKey() in js/yield.js) — MUST stay in sync with that function.
function capaKey(customer, defect) {
    const c = sanitizeKey(customer, 60);
    const d = sanitizeKey(defect, 80);
    if (!c || !d) return '';
    return `${c}__${d}`;
}

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

        const action = body.action || 'save';

        // ── SAVE (create or update — full form or a single-field patch) ────
        // Send whichever fields changed: { customer, defect, monitoring }
        // alone just flips the status pill; a full save includes rootCause,
        // correctiveAction, dueDate, pic, monitoring too. Unset fields keep
        // their previous value (or default to '' / 'Open' on first save).
        if (action === 'save') {
            const customer = sanitize(body.customer || '', 150);
            const defect = sanitize(body.defect || '', 150);
            if (!customer) return errorResponse(res, 'Missing customer');
            if (!defect) return errorResponse(res, 'Missing defect');

            const key = capaKey(customer, defect);
            if (!key) return errorResponse(res, 'Invalid customer/defect');

            const existing = (await fbGet(env, token, `smt_capa/${key}`)) || {};

            const patch = { customer, defect };
            if (body.rootCause !== undefined) patch.rootCause = sanitize(body.rootCause, 1500);
            if (body.correctiveAction !== undefined) patch.correctiveAction = sanitize(body.correctiveAction, 1500);
            if (body.dueDate !== undefined) patch.dueDate = sanitizeDate(body.dueDate, 20);
            if (body.pic !== undefined) patch.pic = sanitize(body.pic, 100);
            if (body.monitoring !== undefined) {
                if (!MONITORING_STATUSES.includes(body.monitoring)) return errorResponse(res, 'Invalid monitoring status');
                patch.monitoring = body.monitoring;
            }

            const record = Object.assign(
                { rootCause: '', correctiveAction: '', dueDate: '', pic: '', monitoring: 'Open', created: Date.now() },
                existing,
                patch,
                { updated: Date.now(), updatedBy: email }
            );

            await fbSet(env, token, `smt_capa/${key}`, record);
            return jsonResponse(res, { ok: true, id: key });
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        if (action === 'delete') {
            const customer = sanitize(body.customer || '', 150);
            const defect = sanitize(body.defect || '', 150);
            if (!customer) return errorResponse(res, 'Missing customer');
            if (!defect) return errorResponse(res, 'Missing defect');
            const key = capaKey(customer, defect);
            if (!key) return errorResponse(res, 'Invalid customer/defect');
            await fbDelete(env, token, `smt_capa/${key}`);
            return jsonResponse(res, { ok: true });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('capa.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

// ============================================
// capa.js — CAPA report entries for the Report tab's defect tracker
//
// One RECORD per (customer, defect) pair, same deterministic key as before
// — but the record no longer holds a single overwritten snapshot. It holds
// a `history` map keyed by week ("2025-W01", …), one entry per week that
// defect got a save. Saving a week that already has an entry updates it
// in place; saving a NEW week adds a new entry next to the old ones. That
// is what turns this into a followable chain (same customer+defect =
// same record = same linked history) instead of a value that just gets
// clobbered every time you touch it.
//
// The record also keeps mirror fields (rootCause, correctiveAction,
// dueDate, pic, monitoring, updated, updatedBy) at the top level, always
// equal to the chronologically-latest history entry. Nothing else in this
// codebase has to know history exists — anything reading the old flat
// shape keeps working unchanged.
//
// Paths:
//   smt_capa/{customerKey}__{defectKey} — one row per customer+defect CAPA
//     .history/{week} — one entry per week
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

// Week labels are ISO "YYYY-Www" (zero-padded, see isoWeek() in yield.js),
// so a plain string sort is also a chronological sort — no date parsing
// needed. The one exception is the synthetic "0000-legacy" key used below
// for pre-history data, which is built to always sort first.
function latestOf(history) {
    const weeks = Object.keys(history || {}).sort();
    if (!weeks.length) return null;
    const week = weeks[weeks.length - 1];
    return { week, entry: history[week] };
}

function clampInt(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, Math.round(n)));
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

        // ── SAVE (create/update ONE WEEK's entry in a defect's history) ───
        // Send whichever fields changed for that week — a full save
        // includes rootCause, correctiveAction, dueDate, pic, monitoring;
        // a quick status flip sends monitoring alone. Unset fields keep
        // their previous value for that week (or default to '' / 'Open'
        // the first time that week is touched).
        if (action === 'save') {
            const customer = sanitize(body.customer || '', 150);
            const defect = sanitize(body.defect || '', 150);
            const week = sanitizeKey(body.week || '', 20);
            if (!customer) return errorResponse(res, 'Missing customer');
            if (!defect) return errorResponse(res, 'Missing defect');
            if (!week) return errorResponse(res, 'Missing week');
            if (body.monitoring !== undefined && !MONITORING_STATUSES.includes(body.monitoring)) {
                return errorResponse(res, 'Invalid monitoring status');
            }

            const key = capaKey(customer, defect);
            if (!key) return errorResponse(res, 'Invalid customer/defect');

            const existing = (await fbGet(env, token, `smt_capa/${key}`)) || {};

            // One-time migration: a record saved before this feature existed
            // has its root cause etc. sitting at the top level with no
            // `history` map at all. Fold that into a single "0000-legacy"
            // entry so it becomes the first row of the chain instead of
            // being silently overwritten the next time this record is
            // touched. Only runs once per record — after this, `history`
            // always exists (even if empty), so this block never fires again.
            let history = existing.history;
            if (!history) {
                history = {};
                const hadLegacyData = existing.rootCause || existing.correctiveAction ||
                    existing.dueDate || existing.pic || (existing.monitoring && existing.monitoring !== 'Open');
                if (hadLegacyData) {
                    history['0000-legacy'] = {
                        week: null, rank: null, count: null, model: '', comp: '',
                        rootCause: existing.rootCause || '', correctiveAction: existing.correctiveAction || '',
                        dueDate: existing.dueDate || '', pic: existing.pic || '',
                        monitoring: existing.monitoring || 'Open',
                        updated: existing.updated || existing.created || Date.now(),
                        updatedBy: existing.updatedBy || ''
                    };
                }
            }

            const existingEntry = history[week] || {};
            const entryPatch = {};
            if (body.rank !== undefined) entryPatch.rank = body.rank === null ? null : clampInt(body.rank, 1, 999);
            if (body.count !== undefined) entryPatch.count = body.count === null ? null : clampInt(body.count, 0, 1e9);
            if (body.model !== undefined) entryPatch.model = sanitize(body.model, 120);
            if (body.comp !== undefined) entryPatch.comp = sanitize(body.comp, 60);
            if (body.rootCause !== undefined) entryPatch.rootCause = sanitize(body.rootCause, 1500);
            if (body.correctiveAction !== undefined) entryPatch.correctiveAction = sanitize(body.correctiveAction, 1500);
            if (body.dueDate !== undefined) entryPatch.dueDate = sanitizeDate(body.dueDate, 20);
            if (body.pic !== undefined) entryPatch.pic = sanitize(body.pic, 100);
            if (body.monitoring !== undefined) entryPatch.monitoring = body.monitoring;

            const newEntry = Object.assign(
                { rank: null, count: null, model: '', comp: '', rootCause: '', correctiveAction: '', dueDate: '', pic: '', monitoring: 'Open' },
                existingEntry,
                entryPatch,
                { week, updated: Date.now(), updatedBy: email }
            );

            const newHistory = Object.assign({}, history, { [week]: newEntry });
            const latest = latestOf(newHistory);

            const record = Object.assign(
                { created: Date.now() },
                existing,
                {
                    customer, defect, history: newHistory,
                    // Mirror = latest week's entry. Kept at the top level so
                    // anything still reading the old flat shape (older
                    // dashboards, ad-hoc scripts, etc.) keeps working as-is.
                    rootCause: latest.entry.rootCause, correctiveAction: latest.entry.correctiveAction,
                    dueDate: latest.entry.dueDate, pic: latest.entry.pic, monitoring: latest.entry.monitoring,
                    updated: Date.now(), updatedBy: email
                }
            );

            await fbSet(env, token, `smt_capa/${key}`, record);
            return jsonResponse(res, { ok: true, id: key });
        }

        // ── DELETE ──────────────────────────────────────────────────────
        // With a `week`: removes just that one history row (e.g. a
        // mis-entered week) and re-derives the mirror fields from whatever
        // is now the latest remaining week. If that was the only entry, or
        // no `week` is given at all, the whole chain is cleared — same as
        // the original single-record "Clear entry" behavior.
        if (action === 'delete') {
            const customer = sanitize(body.customer || '', 150);
            const defect = sanitize(body.defect || '', 150);
            if (!customer) return errorResponse(res, 'Missing customer');
            if (!defect) return errorResponse(res, 'Missing defect');
            const key = capaKey(customer, defect);
            if (!key) return errorResponse(res, 'Invalid customer/defect');

            const week = body.week ? sanitizeKey(body.week, 20) : '';
            if (!week) {
                await fbDelete(env, token, `smt_capa/${key}`);
                return jsonResponse(res, { ok: true });
            }

            const existing = (await fbGet(env, token, `smt_capa/${key}`)) || {};
            const history = Object.assign({}, existing.history || {});
            if (!(week in history)) {
                // Nothing to delete under this week — no-op rather than
                // falling through to any destructive branch below.
                return jsonResponse(res, { ok: true });
            }
            delete history[week];

            if (!Object.keys(history).length) {
                await fbDelete(env, token, `smt_capa/${key}`);
                return jsonResponse(res, { ok: true });
            }

            const latest = latestOf(history);
            const record = Object.assign({}, existing, {
                history,
                rootCause: latest.entry.rootCause, correctiveAction: latest.entry.correctiveAction,
                dueDate: latest.entry.dueDate, pic: latest.entry.pic, monitoring: latest.entry.monitoring,
                updated: Date.now(), updatedBy: email
            });
            await fbSet(env, token, `smt_capa/${key}`, record);
            return jsonResponse(res, { ok: true });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('capa.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

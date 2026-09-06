// ============================================
// yield.js — Yield/DPPM analytics storage
// Same no-role-gating pattern as the rest of the API (solo-engineer app).
//
// Paths:
//   smt_defects/{id}  — one row per pasted defect record
//   smt_prodvol/{id}  — one row per week+customer+model production volume
// ============================================

import {
    jsonResponse, errorResponse, handleOptions,
    sanitizeText, sanitizeDate, sanitizeKey, isValidDateTime, isValidIsoWeek, getToken, fbGet, fbUpdate, fbDelete, requireOwner
} from './_shared.js';


export function planProdVolUndo(records, events) {
    const all = Object.fromEntries(Object.entries(records || {}).map(([id, rec]) => [id, { ...rec }]));
    const deletes = [];
    const revertMap = {};
    let skipped = 0;

    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        const rec = all[event.recordId];
        if (!rec) { skipped++; continue; }

        if (event.kind === 'update') {
            const current = Number(rec[event.field]) || 0;
            if (current !== Number(event.after) || !Object.prototype.hasOwnProperty.call(rec, event.field)) {
                skipped++;
                continue;
            }

            const before = Number(event.before) || 0;
            rec[event.field] = before;
            if (!revertMap[event.recordId]) revertMap[event.recordId] = {};
            revertMap[event.recordId][event.field] = before;
        } else if (event.kind === 'create') {
            const same = ['week', 'customer', 'model', 'inspTOP', 'inspBOT'].every((key) =>
                String(rec[key] ?? '') === String(event.after[key] ?? '')
            );
            if (!same) {
                skipped++;
                continue;
            }
            deletes.push(event.recordId);
            delete all[event.recordId];
            delete revertMap[event.recordId];
        }
    }

    const reverts = Object.entries(revertMap).map(([id, patch]) => ({ id, patch }));
    return { deletes, reverts, skipped };
}

// Case/whitespace-insensitive match key — MUST stay in sync with normKey()
// in js/yield.js, which is what calcMetricsRaw() uses to join this data
// against smt_defects. Matching case-sensitively here let two rows like
// "CustA" and "custa" get stored as separate Firebase records that
// calcMetricsRaw's normalized join then collapsed into one key anyway —
// silently dropping whichever record lost that collision instead of
// merging into it.
function prodVolKey(week, customer, model) {
    return [week, customer, model].map((s) => String(s || '').trim().toLowerCase()).join('|');
}

/**
 * Matches each imported production-volume row against existing records (or
 * other rows earlier in the same import) by week+customer+model, producing
 * the updates/creates/change-log needed to write them. Existing records and
 * in-progress creates are indexed by key up front, so this is O(rows +
 * existingRecords) instead of O(rows × existingRecords) — see
 * test-prodvol-import.mjs for the correctness + performance regression
 * tests. Every touched record's change is logged (+ its pre-change value)
 * so "Undo" can revert exactly what this import did, but only if nothing
 * has touched the record again since — see planProdVolUndo above.
 *
 * @param {Array} clean       validated {week, customer, model, side, count} rows
 * @param {Object} existing   raw smt_prodvol records keyed by id, as returned by fbGet
 * @param {number} now
 * @param {() => string} newId   ID generator for newly-created records (injectable for tests)
 * @returns {{updates: Object, creates: Array, changes: Object}}
 */
export function planProdVolImport(clean, existing, now, newId) {
    const existingByKey = new Map();
    for (const id of Object.keys(existing || {})) {
        const rec = existing[id];
        existingByKey.set(prodVolKey(rec.week, rec.customer, rec.model), { _id: id, ...rec });
    }
    const createsByKey = new Map();

    const updates = {};
    const creates = [];
    const changes = {};
    let changeSeq = 0;
    const addChange = (change) => {
        const key = `chg_${now}_${changeSeq++}_${Math.random().toString(36).slice(2, 8)}`;
        changes[key] = change;
    };

    clean.forEach((r) => {
        const rKey = prodVolKey(r.week, r.customer, r.model);
        const match = existingByKey.get(rKey);
        const field = r.side === 'TOP' ? 'inspTOP' : 'inspBOT';
        if (match) {
            const patch = updates[match._id] || { updated: now };
            const before = Object.prototype.hasOwnProperty.call(patch, field) ? patch[field] : (Number(match[field]) || 0);
            patch[field] = r.count;
            updates[match._id] = patch;
            addChange({ kind: 'update', recordId: match._id, field, before, after: r.count });
        } else {
            const pending = createsByKey.get(rKey);
            if (pending) {
                pending[field] = r.count;
            } else {
                const record = { id: newId(), week: r.week, customer: r.customer, model: r.model, inspTOP: 0, inspBOT: 0, [field]: r.count, created: now };
                creates.push(record);
                createsByKey.set(rKey, record);
            }
        }
    });

    for (const c of creates) {
        addChange({
            kind: 'create',
            recordId: c.id,
            after: {
                week: c.week,
                customer: c.customer,
                model: c.model,
                inspTOP: Number(c.inspTOP) || 0,
                inspBOT: Number(c.inspBOT) || 0
            }
        });
    }

    return { updates, creates, changes };
}

function newFirebaseRecordId(prefix) {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}_${uuid}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

async function defectSignature(row) {
    const payload = JSON.stringify([row.dtStr, row.customer, row.model, row.sn, row.side, row.comp, row.defect]);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
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
        const identity = await requireOwner(env, res, req.headers.authorization);
        if (!identity) return;
        const email = identity.email;

        const token = await getToken(env);

        const action = body.action;
        const now = Date.now();

        // Every importDefects/importProdVol request from one user-initiated
        // import (i.e. one click of the IMPORT button) carries the same
        // client-generated importId, even when the client splits a large
        // file into several sequential batch requests — see
        // importInBatches() in yield.js. That importId is what "Undo last
        // import" targets: every row/record touched by an import is tagged
        // with it, and smt_imports/{importId} accumulates a running summary
        // across all of that import's batches so the UI can show one entry
        // ("214 rows imported") instead of one per batch.
        const importId = sanitizeKey(body.importId || ('auto_' + now), 64);
        const fileName = sanitizeText(body.fileName || '', 150);

        // ── IMPORT DEFECT ROWS ────────────────────────────────────────────
        // body.rows: [{dtStr, customer, model, sn, side, comp, defect}, ...]
        // Only the 7 raw fields are stored — week/hour/shift/dow are derived
        // client-side from dtStr via mkRow(), same as the original tool.
        //
        // Duplicate rows (same dtStr+customer+model+sn+side+comp+defect as an
        // already-stored row) are skipped rather than re-imported — protects
        // against re-uploading the same file, or overlapping date ranges
        // across two files, inflating defect counts.
        if (action === 'importDefects') {
            const rows = Array.isArray(body.rows) ? body.rows : [];
            if (!rows.length) return errorResponse(res, 'No rows to import');
            if (rows.length > 5000) return errorResponse(res, 'Too many rows in one import (max 5000)');

            const clean = rows.map(r => ({
                dtStr: sanitizeDate(r.dtStr || '', 30),
                customer: sanitizeText(r.customer || '', 100),
                model: sanitizeText(r.model || '', 100),
                sn: sanitizeText(r.sn || '', 100),
                side: sanitizeText(r.side || '', 10).toUpperCase().replace('BOTTOM', 'BOT'),
                comp: sanitizeText(r.comp || '', 40),
                defect: sanitizeText(r.defect || '', 100)
            })).filter(r => r.dtStr && isValidDateTime(r.dtStr) && r.customer && r.model && r.sn && ['TOP', 'BOT'].includes(r.side) && r.comp && r.defect);

            if (!clean.length) return errorResponse(res, 'No valid rows after validation');

            // Keep duplicate lookup data in a compact signature index instead of
            // downloading every historical defect payload for every import. The
            // one-time fallback below hydrates missing index entries from legacy
            // rows; all subsequent imports use the compact index directly.
            const existingIndex = (await fbGet(env, token, 'smt_defect_index')) || {};
            const index = { ...existingIndex };
            const indexBackfill = {};

            // Only the first import after this feature needs the full legacy scan.
            // Once marked complete, future imports read the compact index alone.
            if (existingIndex._meta?.backfilled !== true) {
                const existing = (await fbGet(env, token, 'smt_defects')) || {};
                for (const [id, row] of Object.entries(existing)) {
                    const signature = await defectSignature(row);
                    if (!index[signature]) {
                        index[signature] = id;
                        indexBackfill[`smt_defect_index/${signature}`] = id;
                    }
                }
                index._meta = { version: 1, backfilled: true, updated: now };
                indexBackfill['smt_defect_index/_meta'] = index._meta;
            }

            const toImport = [];
            const createdIds = [];
            const createdIndexKeys = [];
            let duplicates = 0;
            for (const r of clean) {
                const signature = await defectSignature(r);
                if (index[signature]) { duplicates++; continue; }
                const id = newFirebaseRecordId('def');
                index[signature] = id; // also catches duplicates repeated within this same file
                createdIds.push(id);
                createdIndexKeys.push(signature);
                toImport.push({ id, row: { ...r, loggedBy: email, created: now, importId } });
            }

            let log = null;
            if (toImport.length || duplicates || Object.keys(indexBackfill).length) {
                const prevLog = (await fbGet(env, token, `smt_imports/${importId}`)) || {};
                log = {
                    type: 'defects',
                    fileName: fileName || prevLog.fileName || '',
                    rowCount: (prevLog.rowCount || 0) + toImport.length,
                    duplicates: (prevLog.duplicates || 0) + duplicates,
                    createdIds: [...(prevLog.createdIds || []), ...createdIds],
                    createdIndexKeys: [...(prevLog.createdIndexKeys || []), ...createdIndexKeys],
                    loggedBy: email,
                    created: prevLog.created || now,
                    undone: false
                };
            }

            // One multi-location PATCH writes defect rows, duplicate-index entries,
            // legacy-index backfill, and the import log atomically.
            if (toImport.length || log || Object.keys(indexBackfill).length) {
                const multi = { ...indexBackfill };
                for (const { id, row } of toImport) {
                    multi[`smt_defects/${id}`] = row;
                }
                for (const signature of createdIndexKeys) {
                    multi[`smt_defect_index/${signature}`] = index[signature];
                }
                if (log) multi[`smt_imports/${importId}`] = log;
                await fbUpdate(env, token, '', multi);
            }

            return jsonResponse(res, { ok: true, count: toImport.length, duplicates, importId });
        }

        // ── IMPORT PRODUCTION VOLUME ─────────────────────────────────────
        // body.rows: [{week, customer, model, side:'TOP'|'BOT', count}, ...]
        // Merges into existing week+customer+model records (one row holds
        // both inspTOP and inspBOT), same semantics as the original tool.
        if (action === 'importProdVol') {
            const rows = Array.isArray(body.rows) ? body.rows : [];
            if (!rows.length) return errorResponse(res, 'No rows to import');
            if (rows.length > 2000) return errorResponse(res, 'Too many rows in one import (max 2000)');

            const clean = rows.map(r => ({
                week: sanitizeText(r.week || '', 20),
                customer: sanitizeText(r.customer || '', 100),
                model: sanitizeText(r.model || '', 100),
                side: r.side === 'BOT' ? 'BOT' : (r.side === 'TOP' ? 'TOP' : ''),
                count: Number(String(r.count ?? '').trim())
            })).filter(r => r.week && isValidIsoWeek(r.week) && r.model && r.side && Number.isSafeInteger(r.count) && r.count >= 0);

            if (!clean.length) return errorResponse(res, 'No valid rows after validation');

            const existing = (await fbGet(env, token, 'smt_prodvol')) || {};
            const { updates, creates, changes } = planProdVolImport(clean, existing, now, () => newFirebaseRecordId('vol'));

            let log = null;
            if (changes && Object.keys(changes).length) {
                const prevLog = (await fbGet(env, token, `smt_imports/${importId}`)) || {};
                log = {
                    type: 'prodvol',
                    fileName: fileName || prevLog.fileName || '',
                    createdCount: (prevLog.createdCount || 0) + creates.length,
                    updatedCount: (prevLog.updatedCount || 0) + Object.keys(updates).length,
                    loggedBy: email,
                    created: prevLog.created || now,
                    undone: false,
                    changes: { ...(prevLog.changes || {}), ...changes }
                };
            }

            // One multi-location PATCH makes all record changes and the corresponding
            // import log update visible atomically. This removes the old N+1 write loop.
            if (Object.keys(updates).length || creates.length || log) {
                const multi = {};
                for (const [id, patch] of Object.entries(updates)) multi[`smt_prodvol/${id}`] = patch;
                for (const c of creates) {
                    const payload = { ...c };
                    delete payload.id;
                    multi[`smt_prodvol/${c.id}`] = payload;
                }
                if (log) multi[`smt_imports/${importId}`] = log;
                await fbUpdate(env, token, '', multi);
            }

            return jsonResponse(res, { ok: true, updated: Object.keys(updates).length, created: creates.length, importId });
        }

        // ── LIST RECENT IMPORTS ──────────────────────────────────────────
        // Powers the "Recent Imports" panel — most recent first, capped so
        // the payload stays small even after months of use.
        if (action === 'listImports') {
            const all = (await fbGet(env, token, 'smt_imports')) || {};
            const list = Object.keys(all)
                .map(id => ({ importId: id, ...all[id] }))
                .sort((a, b) => (b.created || 0) - (a.created || 0))
                .slice(0, 25);
            return jsonResponse(res, { ok: true, imports: list });
        }

        // ── UNDO AN IMPORT ────────────────────────────────────────────────
        // Defects are always append-only, so undoing one is just deleting
        // every row tagged with that importId — always safe, regardless of
        // how much has happened since.
        //
        // Production volume merges into existing week+customer+model records.
        // New imports therefore keep an immutable change log under the import ID.
        // Undo walks those changes backwards and only reverses a field when the
        // current value still equals the value written by the change.
        if (action === 'undoImport') {
            const targetId = sanitizeKey(body.importId || '', 64);
            if (!targetId) return errorResponse(res, 'Missing importId');
            const log = await fbGet(env, token, `smt_imports/${targetId}`);
            if (!log) return errorResponse(res, 'Import not found — it may be older than what this app keeps, or already cleared.');
            if (log.undone) return errorResponse(res, 'This import was already undone.');

            if (log.type === 'defects') {
                if (Array.isArray(log.createdIds) && Array.isArray(log.createdIndexKeys)) {
                    const multi = {};
                    for (const id of log.createdIds) multi[`smt_defects/${id}`] = null;
                    for (const signature of log.createdIndexKeys) multi[`smt_defect_index/${signature}`] = null;
                    multi[`smt_imports/${targetId}/undone`] = true;
                    multi[`smt_imports/${targetId}/undoneAt`] = now;
                    await fbUpdate(env, token, '', multi);
                    return jsonResponse(res, { ok: true, deleted: log.createdIds.length, reverted: 0, skipped: 0 });
                }

                // Legacy imports have no index metadata; retain the old scan-based
                // fallback so their undo remains available.
                const all = (await fbGet(env, token, 'smt_defects')) || {};
                const toDelete = Object.keys(all).filter(id => all[id].importId === targetId);
                await Promise.all(toDelete.map(id => fbDelete(env, token, `smt_defects/${id}`)));
                await fbUpdate(env, token, `smt_imports/${targetId}`, { undone: true, undoneAt: now });
                return jsonResponse(res, { ok: true, deleted: toDelete.length, reverted: 0, skipped: 0 });
            }

            if (log.type === 'prodvol') {
                // New imports carry an immutable change log. Undo walks the log
                // backwards and only applies a reversal when the current value
                // still equals the value written by that change. That makes undo
                // safe across multiple batches of the same import and prevents it
                // from clobbering a later import that changed the same field.
                if (log.changes && Object.keys(log.changes).length) {
                    const all = (await fbGet(env, token, 'smt_prodvol')) || {};
                    const events = Object.values(log.changes);
                    const { deletes, reverts, skipped } = planProdVolUndo(all, events);

                    await Promise.all([
                        ...deletes.map(id => fbDelete(env, token, `smt_prodvol/${id}`)),
                        ...reverts.map(({ id, patch }) => fbUpdate(env, token, `smt_prodvol/${id}`, patch))
                    ]);
                    await fbUpdate(env, token, `smt_imports/${targetId}`, { undone: true, undoneAt: now });
                    return jsonResponse(res, { ok: true, deleted: deletes.length, reverted: reverts.length, skipped });
                }

                // Legacy fallback for imports created before the immutable change
                // log existed. Keep the old best-effort behavior so existing undo
                // entries remain usable.
                const all = (await fbGet(env, token, 'smt_prodvol')) || {};
                const dels = [], reverts = [];
                let skipped = 0;
                Object.keys(all).forEach(id => {
                    const rec = all[id];
                    if (rec.lastImportId !== targetId) return;
                    if (rec.createdByImportId === targetId) { dels.push(id); return; }
                    const fields = rec.lastImportFields || [];
                    if (!fields.length) { skipped++; return; }
                    const patch = {};
                    fields.forEach(f => { patch[f] = f === 'inspTOP' ? (rec.prevInspTOP || 0) : (rec.prevInspBOT || 0); });
                    patch.lastImportId = null; patch.lastImportFields = null;
                    patch.prevInspTOP = null; patch.prevInspBOT = null;
                    reverts.push({ id, patch });
                });
                await Promise.all([
                    ...dels.map(id => fbDelete(env, token, `smt_prodvol/${id}`)),
                    ...reverts.map(({ id, patch }) => fbUpdate(env, token, `smt_prodvol/${id}`, patch))
                ]);
                await fbUpdate(env, token, `smt_imports/${targetId}`, { undone: true, undoneAt: now });
                return jsonResponse(res, { ok: true, deleted: dels.length, reverted: reverts.length, skipped });
            }

            return errorResponse(res, 'Unknown import type');
        }

        // ── ONE-TIME REPAIR: fix defect dates corrupted by the old sanitize()
        // bug (see sanitizeDate in _shared.js). Before that fix, every dtStr
        // had its '/' stripped before saving (e.g. "04/07/2025 08:23:15" ->
        // "04072025 08:23:15"), so rows imported before the fix are still
        // stored that way and won't parse. This reconstructs the original
        // MM/DD/YYYY format for exactly that corruption signature and leaves
        // everything else untouched. Idempotent — safe to call more than
        // once (already-fixed rows simply won't match the pattern again).
        if (action === 'repairDefectDates') {
            const all = (await fbGet(env, token, 'smt_defects')) || {};
            const pattern = /^(\d{2})(\d{2})(\d{4}) (\d{2}:\d{2}:\d{2})$/;
            const fixes = {};
            Object.keys(all).forEach(id => {
                const m = (all[id].dtStr || '').match(pattern);
                if (m) fixes[id] = `${m[1]}/${m[2]}/${m[3]} ${m[4]}`;
            });
            const ids = Object.keys(fixes);
            if (!ids.length) return jsonResponse(res, { ok: true, repaired: 0, message: 'No corrupted rows found.' });
            await Promise.all(ids.map(id => fbUpdate(env, token, `smt_defects/${id}`, { dtStr: fixes[id] })));
            return jsonResponse(res, { ok: true, repaired: ids.length });
        }

        return errorResponse(res, 'Unknown action');

    } catch (err) {
        console.error('yield.js error:', err.message);
        return errorResponse(res, 'Server error', 500);
    }
}

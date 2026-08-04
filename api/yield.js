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
    sanitize, sanitizeDate, sanitizeKey, getToken, fbGet, fbPush, fbSet, fbUpdate, fbDelete, requireOwner
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
        const fileName = sanitize(body.fileName || '', 150);

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

            const sig = r => [r.dtStr, r.customer, r.model, r.sn, r.side, r.comp, r.defect].join('|');

            const clean = rows.map(r => ({
                dtStr: sanitizeDate(r.dtStr || '', 30),
                customer: sanitize(r.customer || '', 100),
                model: sanitize(r.model || '', 100),
                sn: sanitize(r.sn || '', 100),
                side: sanitize(r.side || '', 10),
                comp: sanitize(r.comp || '', 40),
                defect: sanitize(r.defect || '', 100)
            })).filter(r => r.dtStr && r.customer && r.model && r.sn && r.side && r.comp && r.defect);

            if (!clean.length) return errorResponse(res, 'No valid rows after validation');

            const existing = (await fbGet(env, token, 'smt_defects')) || {};
            const seen = new Set(Object.values(existing).map(sig));

            const toImport = [];
            let duplicates = 0;
            for (const r of clean) {
                const s = sig(r);
                if (seen.has(s)) { duplicates++; continue; }
                seen.add(s); // also catches duplicates repeated within this same file
                toImport.push({ ...r, loggedBy: email, created: now, importId });
            }

            if (toImport.length) await Promise.all(toImport.map(r => fbPush(env, token, 'smt_defects', r)));

            // Accumulate this batch into the shared import-log entry (read-modify-write
            // is safe here because the client sends batches for one import sequentially,
            // never in parallel — see importInBatches()).
            if (toImport.length || duplicates) {
                const prevLog = (await fbGet(env, token, `smt_imports/${importId}`)) || {};
                await fbSet(env, token, `smt_imports/${importId}`, {
                    type: 'defects',
                    fileName: fileName || prevLog.fileName || '',
                    rowCount: (prevLog.rowCount || 0) + toImport.length,
                    duplicates: (prevLog.duplicates || 0) + duplicates,
                    loggedBy: email,
                    created: prevLog.created || now,
                    undone: false
                });
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
                week: sanitize(r.week || '', 20),
                customer: sanitize(r.customer || '', 100),
                model: sanitize(r.model || '', 100),
                side: r.side === 'BOT' ? 'BOT' : (r.side === 'TOP' ? 'TOP' : ''),
                count: parseInt(r.count) || 0
            })).filter(r => r.week && r.model && r.side);

            if (!clean.length) return errorResponse(res, 'No valid rows after validation');

            const existing = (await fbGet(env, token, 'smt_prodvol')) || {};
            const existingArr = Object.keys(existing).map(id => ({ _id: id, ...existing[id] }));

            const updates = {};   // id -> patch
            const creates = [];   // new records to push

            // Every touched record is tagged with lastImportId (+ which
            // field(s) this specific import changed, and their pre-change
            // values) so "Undo" can revert exactly what this import did —
            // but only if nothing has touched the record again since. A
            // brand-new record (createdByImportId matches) is deleted
            // outright on undo instead of "reverted".
            clean.forEach(r => {
                const match = existingArr.find(p => p.week === r.week && p.customer === r.customer && p.model === r.model);
                const field = r.side === 'TOP' ? 'inspTOP' : 'inspBOT';
                const prevField = field === 'inspTOP' ? 'prevInspTOP' : 'prevInspBOT';
                if (match) {
                    const patch = updates[match._id] || { lastImportId: importId, lastImportFields: [], updated: now };
                    patch[field] = r.count;
                    patch[prevField] = match[field] || 0;
                    if (!patch.lastImportFields.includes(field)) patch.lastImportFields.push(field);
                    updates[match._id] = patch;
                } else {
                    const pending = creates.find(c => c.week === r.week && c.customer === r.customer && c.model === r.model);
                    if (pending) pending[field] = r.count;
                    else creates.push({ week: r.week, customer: r.customer, model: r.model, inspTOP: 0, inspBOT: 0, [field]: r.count, created: now, createdByImportId: importId, lastImportId: importId });
                }
            });

            await Promise.all([
                ...Object.keys(updates).map(id => fbUpdate(env, token, `smt_prodvol/${id}`, updates[id])),
                ...creates.map(c => fbPush(env, token, 'smt_prodvol', c))
            ]);

            if (creates.length || Object.keys(updates).length) {
                const prevLog = (await fbGet(env, token, `smt_imports/${importId}`)) || {};
                await fbSet(env, token, `smt_imports/${importId}`, {
                    type: 'prodvol',
                    fileName: fileName || prevLog.fileName || '',
                    createdCount: (prevLog.createdCount || 0) + creates.length,
                    updatedCount: (prevLog.updatedCount || 0) + Object.keys(updates).length,
                    loggedBy: email,
                    created: prevLog.created || now,
                    undone: false
                });
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
        // Production volume merges into existing week+customer+model
        // records, so undo is per-record: a record this import *created*
        // is deleted outright; a record it merely *updated* has just the
        // field(s) that import touched reverted to their pre-import values
        // — but ONLY if lastImportId still matches, i.e. nothing has
        // written to that record again since. Records a later import has
        // since touched are left alone and reported back as skipped,
        // rather than risk clobbering newer legitimate data.
        if (action === 'undoImport') {
            const targetId = sanitizeKey(body.importId || '', 64);
            if (!targetId) return errorResponse(res, 'Missing importId');
            const log = await fbGet(env, token, `smt_imports/${targetId}`);
            if (!log) return errorResponse(res, 'Import not found — it may be older than what this app keeps, or already cleared.');
            if (log.undone) return errorResponse(res, 'This import was already undone.');

            if (log.type === 'defects') {
                const all = (await fbGet(env, token, 'smt_defects')) || {};
                const toDelete = Object.keys(all).filter(id => all[id].importId === targetId);
                await Promise.all(toDelete.map(id => fbDelete(env, token, `smt_defects/${id}`)));
                await fbUpdate(env, token, `smt_imports/${targetId}`, { undone: true, undoneAt: now });
                return jsonResponse(res, { ok: true, deleted: toDelete.length, reverted: 0, skipped: 0 });
            }

            if (log.type === 'prodvol') {
                const all = (await fbGet(env, token, 'smt_prodvol')) || {};
                const dels = [], reverts = [];
                let skipped = 0;
                Object.keys(all).forEach(id => {
                    const rec = all[id];
                    if (rec.lastImportId !== targetId) return; // never touched by this import, or touched again since
                    if (rec.createdByImportId === targetId) { dels.push(id); return; }
                    const fields = rec.lastImportFields || [];
                    if (!fields.length) { skipped++; return; }
                    const patch = {};
                    fields.forEach(f => { patch[f] = f === 'inspTOP' ? (rec.prevInspTOP || 0) : (rec.prevInspBOT || 0); });
                    // Clear the tracking fields so this record can't be double-undone
                    // and doesn't keep pointing at an import that no longer applies.
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
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

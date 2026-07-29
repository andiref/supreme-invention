// ============================================
// yield.js — Yield/DPPM analytics storage
// Replaces the original tool's localStorage with Firebase, same
// no-role-gating pattern as customers.js/complaints.js (solo-engineer app).
//
// Paths:
//   smt_defects/{id}     — one row per pasted defect record
//   smt_prodvol/{id}     — one row per week+customer+model production volume
//   smt_modeltiers/{id}  — RCA-priority tier scoring config per model
// ============================================

import {
    jsonResponse, errorResponse, handleOptions,
    sanitize, sanitizeDate, sanitizeKey, getToken, fbGet, fbPush, fbUpdate, fbDelete, requireOwner
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

        // ── IMPORT DEFECT ROWS ────────────────────────────────────────────
        // body.rows: [{dtStr, customer, model, sn, side, comp, defect}, ...]
        // Only the 7 raw fields are stored — week/hour/shift/dow are derived
        // client-side from dtStr via mkRow(), same as the original tool.
        if (action === 'importDefects') {
            const rows = Array.isArray(body.rows) ? body.rows : [];
            if (!rows.length) return errorResponse(res, 'No rows to import');
            if (rows.length > 5000) return errorResponse(res, 'Too many rows in one import (max 5000)');

            const clean = rows.map(r => ({
                dtStr: sanitizeDate(r.dtStr || '', 30),
                customer: sanitize(r.customer || '', 100),
                model: sanitize(r.model || '', 100),
                sn: sanitize(r.sn || '', 100),
                side: sanitize(r.side || '', 10),
                comp: sanitize(r.comp || '', 40),
                defect: sanitize(r.defect || '', 100),
                loggedBy: email, created: now
            })).filter(r => r.dtStr && r.customer && r.model && r.sn && r.side && r.comp && r.defect);

            if (!clean.length) return errorResponse(res, 'No valid rows after validation');
            await Promise.all(clean.map(r => fbPush(env, token, 'smt_defects', r)));
            return jsonResponse(res, { ok: true, count: clean.length });
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

            clean.forEach(r => {
                const match = existingArr.find(p => p.week === r.week && p.customer === r.customer && p.model === r.model);
                const field = r.side === 'TOP' ? 'inspTOP' : 'inspBOT';
                if (match) {
                    updates[match._id] = { ...(updates[match._id] || {}), [field]: r.count };
                } else {
                    const pending = creates.find(c => c.week === r.week && c.customer === r.customer && c.model === r.model);
                    if (pending) pending[field] = r.count;
                    else creates.push({ week: r.week, customer: r.customer, model: r.model, inspTOP: 0, inspBOT: 0, [field]: r.count, created: now });
                }
            });

            await Promise.all([
                ...Object.keys(updates).map(id => fbUpdate(env, token, `smt_prodvol/${id}`, updates[id])),
                ...creates.map(c => fbPush(env, token, 'smt_prodvol', c))
            ]);
            return jsonResponse(res, { ok: true, updated: Object.keys(updates).length, created: creates.length });
        }

        // ── ADD MODEL TIER ────────────────────────────────────────────────
        if (action === 'addModelTier') {
            const model = sanitize(body.model || '', 100);
            const customer = sanitize(body.customer || '', 100);
            const weeklyVol = parseFloat(body.weeklyVol) || 0;
            const defectRate = parseFloat(body.defectRate) || 0;
            const criticality = ['Low', 'Medium', 'High'].includes(body.criticality) ? body.criticality : 'Low';
            if (!model || !customer) return errorResponse(res, 'Model and Customer required');

            const result = await fbPush(env, token, 'smt_modeltiers', {
                model, customer, weeklyVol, defectRate, criticality, created: now, createdBy: email
            });
            return jsonResponse(res, { ok: true, id: result.name });
        }

        // ── REMOVE MODEL TIER ─────────────────────────────────────────────
        if (action === 'removeModelTier') {
            const id = sanitizeKey(body.id || '', 40);
            if (!id) return errorResponse(res, 'Missing id');
            await fbDelete(env, token, `smt_modeltiers/${id}`);
            return jsonResponse(res, { ok: true });
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

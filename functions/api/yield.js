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
    CORS_HEADERS, jsonResponse, errorResponse,
    sanitize, sanitizeKey, getToken, fbGet, fbPush, fbUpdate, fbDelete
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

        // ── IMPORT DEFECT ROWS ────────────────────────────────────────────
        // body.rows: [{dtStr, customer, model, sn, side, comp, defect}, ...]
        // Only the 7 raw fields are stored — week/hour/shift/dow are derived
        // client-side from dtStr via mkRow(), same as the original tool.
        if (action === 'importDefects') {
            const rows = Array.isArray(body.rows) ? body.rows : [];
            if (!rows.length) return errorResponse('No rows to import');
            if (rows.length > 5000) return errorResponse('Too many rows in one import (max 5000)');

            const clean = rows.map(r => ({
                dtStr: sanitize(r.dtStr || '', 30),
                customer: sanitize(r.customer || '', 100),
                model: sanitize(r.model || '', 100),
                sn: sanitize(r.sn || '', 100),
                side: sanitize(r.side || '', 10),
                comp: sanitize(r.comp || '', 40),
                defect: sanitize(r.defect || '', 100),
                badge, created: now
            })).filter(r => r.dtStr && r.customer && r.model && r.sn && r.side && r.comp && r.defect);

            if (!clean.length) return errorResponse('No valid rows after validation');
            await Promise.all(clean.map(r => fbPush(env, token, 'smt_defects', r)));
            return jsonResponse({ ok: true, count: clean.length });
        }

        // ── IMPORT PRODUCTION VOLUME ─────────────────────────────────────
        // body.rows: [{week, customer, model, side:'TOP'|'BOT', count}, ...]
        // Merges into existing week+customer+model records (one row holds
        // both inspTOP and inspBOT), same semantics as the original tool.
        if (action === 'importProdVol') {
            const rows = Array.isArray(body.rows) ? body.rows : [];
            if (!rows.length) return errorResponse('No rows to import');
            if (rows.length > 2000) return errorResponse('Too many rows in one import (max 2000)');

            const clean = rows.map(r => ({
                week: sanitize(r.week || '', 20),
                customer: sanitize(r.customer || '', 100),
                model: sanitize(r.model || '', 100),
                side: r.side === 'BOT' ? 'BOT' : (r.side === 'TOP' ? 'TOP' : ''),
                count: parseInt(r.count) || 0
            })).filter(r => r.week && r.model && r.side);

            if (!clean.length) return errorResponse('No valid rows after validation');

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
            return jsonResponse({ ok: true, updated: Object.keys(updates).length, created: creates.length });
        }

        // ── ADD MODEL TIER ────────────────────────────────────────────────
        if (action === 'addModelTier') {
            const model = sanitize(body.model || '', 100);
            const customer = sanitize(body.customer || '', 100);
            const weeklyVol = parseFloat(body.weeklyVol) || 0;
            const defectRate = parseFloat(body.defectRate) || 0;
            const criticality = ['Low', 'Medium', 'High'].includes(body.criticality) ? body.criticality : 'Low';
            if (!model || !customer) return errorResponse('Model and Customer required');

            const result = await fbPush(env, token, 'smt_modeltiers', {
                model, customer, weeklyVol, defectRate, criticality, created: now, createdBy: badge
            });
            return jsonResponse({ ok: true, id: result.name });
        }

        // ── REMOVE MODEL TIER ─────────────────────────────────────────────
        if (action === 'removeModelTier') {
            const id = sanitizeKey(body.id || '', 40);
            if (!id) return errorResponse('Missing id');
            await fbDelete(env, token, `smt_modeltiers/${id}`);
            return jsonResponse({ ok: true });
        }

        return errorResponse('Unknown action');

    } catch (err) {
        console.error('yield.js error:', err.message);
        return errorResponse('Server error: ' + err.message, 500);
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

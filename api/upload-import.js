import {
    jsonResponse, errorResponse, handleOptions,
    sanitize, requireOwner, getToken,
    fbGet, fbPush, fbUpdate
} from './_shared.js';
import * as XLSX from 'xlsx';

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

        const type = body.type;
        if (!type || !['defect', 'prod'].includes(type)) {
            return errorResponse(res, 'Invalid type. Use "defect" or "prod"');
        }

        const fileBase64 = body.fileBase64 || '';
        if (!fileBase64) return errorResponse(res, 'No file provided');

        let buffer;
        try { buffer = Buffer.from(fileBase64, 'base64'); }
        catch { return errorResponse(res, 'Invalid file encoding'); }

        let workbook;
        try { workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true }); }
        catch (err) { return errorResponse(res, 'Cannot parse file: ' + err.message); }

        if (!workbook.SheetNames.length) return errorResponse(res, 'No sheets found');
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        if (!json.length || !json[0].length) return errorResponse(res, 'Empty file');
        const headers = json[0].map(h => String(h).trim());
        const rawRows = json.slice(1).filter(r => r.some(c => String(c).trim()));

        if (!rawRows.length) return errorResponse(res, 'No data rows');
        if (rawRows.length > 5000) return errorResponse(res, 'Too many rows (max 5,000)');

        const mapping = body.mapping || {};
        const required = type === 'defect'
            ? ['customer', 'sn', 'model', 'defect', 'comp', 'datetime', 'side']
            : ['week', 'model', 'side', 'count'];
        const missing = required.filter(k => typeof mapping[k] !== 'number');
        if (missing.length) return errorResponse(res, 'Missing mapping: ' + missing.join(', '));

        const now = Date.now();
        const parsed = [];
        const errors = [];

        for (let i = 0; i < rawRows.length; i++) {
            const r = rawRows[i];
            const row = {};
            for (const [key, idx] of Object.entries(mapping)) {
                row[key] = r[idx] !== undefined ? String(r[idx]).trim() : '';
            }
            let err = null;

            if (type === 'defect') {
                const dtStr = row.datetime || '';
                if (!dtStr || !/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dtStr)) err = 'Bad date';
                const side = String(row.side).toUpperCase().replace('BOTTOM', 'BOT');
                if (!/^(TOP|BOT)$/.test(side)) err = 'Invalid side';
                if (!row.customer || !row.model || !row.sn || !row.comp || !row.defect) err = err || 'Missing field';
                if (!err) parsed.push({
                    dtStr, customer: sanitize(row.customer, 100), model: sanitize(row.model, 100),
                    sn: sanitize(row.sn, 100), side, comp: sanitize(row.comp, 40),
                    defect: sanitize(row.defect, 100), loggedBy: email, created: now
                });
            } else {
                const side = String(row.side).toUpperCase().replace('BOTTOM', 'BOT');
                if (!/^(TOP|BOT)$/.test(side)) err = 'Invalid side';
                const count = parseInt(row.count);
                if (isNaN(count) || count < 0) err = 'Bad count';
                if (!row.week || !row.model) err = err || 'Missing field';
                if (!err) parsed.push({
                    week: sanitize(row.week, 20), customer: sanitize(row.customer || '', 100),
                    model: sanitize(row.model, 100), side, count
                });
            }
            if (err) errors.push({ row: i + 2, error: err });
        }

        if (!parsed.length) {
            return errorResponse(res, 'No valid rows. First error: ' + (errors[0]?.error || 'unknown'));
        }

        const token = await getToken(env);

        if (type === 'defect') {
            const CHUNK = 50;
            for (let i = 0; i < parsed.length; i += CHUNK) {
                const chunk = parsed.slice(i, i + CHUNK);
                await Promise.all(chunk.map(r => fbPush(env, token, 'smt_defects', r)));
            }
        } else {
            const existing = (await fbGet(env, token, 'smt_prodvol')) || {};
            const existingArr = Object.keys(existing).map(id => ({ _id: id, ...existing[id] }));
            const updates = {};
            const creates = [];

            parsed.forEach(r => {
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
        }

        return jsonResponse(res, {
            ok: true,
            imported: parsed.length,
            skipped: errors.length,
            total: rawRows.length,
            errors: errors.slice(0, 10)
        });

    } catch (err) {
        console.error('upload-import.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

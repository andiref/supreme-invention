import {
    jsonResponse, errorResponse, handleOptions,
    sanitize, requireOwner
} from './_shared.js';
import * as XLSX from 'xlsx';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return handleOptions(res);
    if (req.method !== 'POST') return errorResponse(res, 'Method not allowed', 405);

    try {
        const env = process.env;
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

        const rows = [];
        const errors = [];
        let valid = 0;

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
                if (!err) rows.push({ dtStr, customer: row.customer, model: row.model, sn: row.sn, side, comp: row.comp, defect: row.defect });
            } else {
                const side = String(row.side).toUpperCase().replace('BOTTOM', 'BOT');
                if (!/^(TOP|BOT)$/.test(side)) err = 'Invalid side';
                const count = parseInt(row.count);
                if (isNaN(count) || count < 0) err = 'Bad count';
                if (!row.week || !row.model) err = err || 'Missing field';
                if (!err) rows.push({ week: row.week, customer: row.customer || '', model: row.model, side, count });
            }
            if (err) errors.push({ row: i + 2, error: err, raw: row });
            else valid++;
        }

        return jsonResponse(res, {
            ok: true, type, headers,
            rows: rows.slice(0, 100),
            totalRows: rawRows.length,
            valid, invalid: errors.length,
            errors: errors.slice(0, 20),
            canImport: rows.length > 0
        });

    } catch (err) {
        console.error('upload.js error:', err.message);
        return errorResponse(res, 'Server error: ' + err.message, 500);
    }
}

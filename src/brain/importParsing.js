// ============================================
// importParsing.js — turns an uploaded .csv/.txt/.xlsx/.xls file into
// validated import rows for Defect Data or Production Volume.
// The only "impure" bits are FileReader/SheetJS (unavoidable — reading an
// actual File requires them) — there is no DOM querying or rendering here.
// ============================================

import * as XLSX from 'xlsx';
import { buildDefectRow } from './defectRow.js';
import { formatDateTimeForImport } from './datetime.js';

/** Splits pasted/CSV text into rows of trimmed, unquoted cells. */
export function splitDelimited(text) {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split(/[\t,]/).map((x) => x.trim().replace(/^"|"$/g, '')));
}

/**
 * Reads a File (csv/txt/xlsx/xls) and resolves with an array of
 * string-cell rows — the same shape as if it had been pasted as text.
 * Excel date cells are converted to "MM/DD/YYYY HH:MM:SS" text.
 */
export function readFileAsRows(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return new Promise((resolve, reject) => {
    if (ext === 'csv' || ext === 'txt') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(splitDelimited(String(e.target.result)));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
          const rows = raw.map((r) => r.map((cell) => {
            if (cell instanceof Date) return formatDateTimeForImport(cell);
            return String(cell == null ? '' : cell).trim();
          }));
          resolve(rows);
        } catch (err) {
          reject(new Error(`Could not read Excel file: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error('Unsupported file type. Use .csv, .txt, .xlsx, or .xls'));
    }
  });
}

/**
 * Validates raw rows against the Defect Data format:
 * Customer | SerialNo | Model | DefectType | Component | MM/DD/YYYY HH:MM:SS | Side
 * @returns {{ rows: object[], skipped: number }}
 */
export function parseDefectImportRows(rawRows) {
  const parsed = rawRows.map((p) => {
    if (p.length < 7) return null;
    const [customer, sn, model, defect, comp, dtStr, side] = p;
    const row = buildDefectRow(dtStr, customer, model, sn, side, comp, defect);
    if (!row) return null;
    return { dtStr, customer, model, sn, side: row.side, comp, defect };
  });
  const rows = parsed.filter(Boolean);
  return { rows, skipped: parsed.length - rows.length };
}

/**
 * Validates raw rows against the Production Volume format:
 * Week | Model | Side | Customer | TotalInspected
 * @returns {{ rows: object[], skipped: number }}
 */
export function parseProdVolImportRows(rawRows) {
  const parsed = rawRows.map((p) => {
    if (p.length < 5) return null;
    const [week, model, side, customer, totalInspected] = p;
    if (!week || !model || !side) return null;
    const normSide = String(side).toUpperCase().replace('BOTTOM', 'BOT');
    if (!['TOP', 'BOT'].includes(normSide)) return null;
    return { week, customer, model, side: normSide, count: parseInt(totalInspected, 10) || 0 };
  });
  const rows = parsed.filter(Boolean);
  return { rows, skipped: parsed.length - rows.length };
}

/** Client-side batch sizes — kept under the server's hard caps (see api/yield.js). */
export const DEFECT_IMPORT_BATCH_SIZE = 2000;
export const PRODVOL_IMPORT_BATCH_SIZE = 1000;

/** A reasonably unique id for tying together all batches of one import (for the undo feature). */
export function newImportId() {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

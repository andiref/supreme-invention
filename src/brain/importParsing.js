// ============================================
// importParsing.js — turns an uploaded .csv/.txt/.xlsx/.xls file into
// validated import rows for Defect Data or Production Volume.
// The only "impure" bits are FileReader/SheetJS (unavoidable — reading an
// actual File requires them) — there is no DOM querying or rendering here.
// ============================================

import * as XLSX from 'xlsx';
import { buildDefectRow } from './defectRow.js';
import { formatDateTimeForImport } from './datetime.js';
import { splitDelimited } from './delimited.js';

/** Splits pasted/CSV text into rows of trimmed, quote-aware cells. */


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

/** Returns true when the first row looks like the documented column header. */
function isHeaderRow(row, type) {
  if (!Array.isArray(row)) return false;
  const values = row.slice(0, type === 'defect' ? 7 : 5).map((value) => String(value ?? '').trim().toLowerCase());
  if (type === 'defect') {
    return values.length >= 7 &&
      values[0] === 'customer' &&
      (values[1] === 'serialno' || values[1] === 'serial number' || values[1] === 'serialnumber') &&
      values[2] === 'model' &&
      (values[3] === 'defecttype' || values[3] === 'defect type') &&
      (values[4] === 'component' || values[4] === 'comp') &&
      (values[5] === 'datetime' || values[5] === 'date time' || values[5] === 'date/time') &&
      values[6] === 'side';
  }
  return values.length >= 5 &&
    values[0] === 'week' &&
    values[1] === 'model' &&
    values[2] === 'side' &&
    values[3] === 'customer' &&
    (values[4] === 'totalinspected' || values[4] === 'total inspected');
}

/** Turns one invalid raw row into a human-readable reason without changing validation behavior. */
function defectSkipReason(p) {
  if (p.length < 7) return 'Not enough columns (expected 7)';
  const [, , , , , dtStr] = p;
  if (!String(p[0] ?? '').trim()) return 'Missing customer';
  if (!String(p[1] ?? '').trim()) return 'Missing serial number';
  if (!String(p[2] ?? '').trim()) return 'Missing model';
  if (!String(p[3] ?? '').trim()) return 'Missing defect type';
  if (!String(p[4] ?? '').trim()) return 'Missing component';
  if (!String(p[5] ?? '').trim()) return 'Missing date/time';
  return `Invalid date/time format: ${String(dtStr ?? '').trim() || '(blank)'}`;
}

function prodVolSkipReason(p) {
  if (p.length < 5) return 'Not enough columns (expected 5)';
  const [week, model, side, , totalInspected] = p;
  if (!String(week ?? '').trim()) return 'Missing week';
  if (!String(model ?? '').trim()) return 'Missing model';
  if (!String(side ?? '').trim()) return 'Missing side';
  const normSide = String(side).toUpperCase().replace('BOTTOM', 'BOT');
  if (!['TOP', 'BOT'].includes(normSide)) return `Invalid side: ${String(side).trim()}`;
  const count = Number(String(totalInspected ?? '').trim());
  if (!Number.isSafeInteger(count) || count < 0) return `Invalid TotalInspected: ${String(totalInspected ?? '').trim() || '(blank)'}`;
  return 'Invalid row format';
}

function skippedDetail(sourceRow, raw, reason) {
  return { sourceRow, reason, raw: raw.map((value) => String(value ?? '').trim()) };
}

/**
 * Validates raw rows against the Defect Data format:
 * Customer | SerialNo | Model | DefectType | Component | MM/DD/YYYY HH:MM:SS | Side
 * @returns {{ rows: object[], skipped: number, skippedDetails: object[] }}
 */
export function parseDefectImportRows(rawRows) {
  const rows = [];
  const skippedDetails = [];
  rawRows.forEach((p, index) => {
    if (index === 0 && isHeaderRow(p, 'defect')) return;
    if (p.length < 7) {
      skippedDetails.push(skippedDetail(index + 1, p, defectSkipReason(p)));
      return;
    }
    const [customer, sn, model, defect, comp, dtStr, side] = p;
    const row = buildDefectRow(dtStr, customer, model, sn, side, comp, defect);
    if (!row) {
      skippedDetails.push(skippedDetail(index + 1, p, defectSkipReason(p)));
      return;
    }
    rows.push({ dtStr, customer, model, sn, side: row.side, comp, defect });
  });
  return { rows, skipped: skippedDetails.length, skippedDetails };
}

/**
 * Validates raw rows against the Production Volume format:
 * Week | Model | Side | Customer | TotalInspected
 * @returns {{ rows: object[], skipped: number, skippedDetails: object[] }}
 */
export function parseProdVolImportRows(rawRows) {
  const rows = [];
  const skippedDetails = [];
  rawRows.forEach((p, index) => {
    if (index === 0 && isHeaderRow(p, 'prodvol')) return;
    if (p.length < 5) {
      skippedDetails.push(skippedDetail(index + 1, p, prodVolSkipReason(p)));
      return;
    }
    const [week, model, side, customer, totalInspected] = p;
    if (!week || !model || !side) {
      skippedDetails.push(skippedDetail(index + 1, p, prodVolSkipReason(p)));
      return;
    }
    const normSide = String(side).toUpperCase().replace('BOTTOM', 'BOT');
    if (!['TOP', 'BOT'].includes(normSide)) {
      skippedDetails.push(skippedDetail(index + 1, p, prodVolSkipReason(p)));
      return;
    }
    const count = Number(String(totalInspected ?? '').trim());
    if (!Number.isSafeInteger(count) || count < 0) {
      skippedDetails.push(skippedDetail(index + 1, p, prodVolSkipReason(p)));
      return;
    }
    rows.push({ week, customer, model, side: normSide, count });
  });
  return { rows, skipped: skippedDetails.length, skippedDetails };
}

/** Client-side batch sizes — kept under the server's hard caps (see api/yield.js). */
export const DEFECT_IMPORT_BATCH_SIZE = 2000;
export const PRODVOL_IMPORT_BATCH_SIZE = 1000;

/** A reasonably unique id for tying together all batches of one import (for the undo feature). */
export function newImportId() {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

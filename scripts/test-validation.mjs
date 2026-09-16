import assert from 'node:assert/strict';
import { parseDateTime } from '../src/brain/datetime.js';
import { isValidDateTime, isValidIsoWeek } from '../api/_shared.js';
import { parseDefectImportRows, parseProdVolImportRows } from '../src/brain/importParsing.js';

const valid = ['02/29/2024 08:23:15', '4/7/2025 8:23:15'];
for (const value of valid) {
  assert.ok(parseDateTime(value));
  assert.equal(isValidDateTime(value), true);
}
for (const value of ['02/30/2025 08:23:15', '13/01/2025 08:23:15', '04/07/2025 24:00:00', '04/07/2025 08:23:15junk']) {
  assert.equal(parseDateTime(value), null);
  assert.equal(isValidDateTime(value), false);
}

// ISO week labels ("YYYY-Www") — used for CAPA history keys and
// production-volume import rows. Garbage text or an out-of-range week
// number must never silently pass through as if it were a real week.
for (const value of ['2026-W01', '2026-W33', '2026-W53']) {
  assert.equal(isValidIsoWeek(value), true);
}
for (const value of ['hello', '2026-W99', '2026-W00', 'abc123', '2026-33', '', null, undefined]) {
  assert.equal(isValidIsoWeek(value), false);
}


// Import preview diagnostics — skipped rows retain source row numbers, reasons,
// and source cell values; documented header rows are ignored rather than counted.
const defectImport = parseDefectImportRows([
  ['Customer', 'SerialNo', 'Model', 'DefectType', 'Component', 'DateTime', 'Side'],
  ['CUST-A', 'SN-001', 'MODEL-AA1', 'Solder Bridge', 'R1', '04/07/2025 08:23:15', 'TOP'],
  ['CUST-A', 'SN-002', 'MODEL-AA1', 'Solder Bridge', 'R2', 'bad-date', 'TOP'],
]);
assert.equal(defectImport.rows.length, 1);
assert.equal(defectImport.skipped, 1);
assert.equal(defectImport.skippedDetails[0].sourceRow, 3);
assert.match(defectImport.skippedDetails[0].reason, /Invalid date\/time/);
assert.equal(defectImport.skippedDetails[0].raw[5], 'bad-date');

const prodVolImport = parseProdVolImportRows([
  ['Week', 'Model', 'Side', 'Customer', 'TotalInspected'],
  ['2026-W32', 'MODEL-AA1', 'TOP', 'CUST-A', '1500'],
  ['2026-W32', 'MODEL-AA1', 'LEFT', 'CUST-A', '1500'],
]);
assert.equal(prodVolImport.rows.length, 1);
assert.equal(prodVolImport.skipped, 1);
assert.equal(prodVolImport.skippedDetails[0].sourceRow, 3);
assert.match(prodVolImport.skippedDetails[0].reason, /Invalid side/i);

console.log('date validation tests: PASS');

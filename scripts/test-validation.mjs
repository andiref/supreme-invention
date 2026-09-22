import assert from 'node:assert/strict';
import { parseDateTime } from '../src/brain/datetime.js';
import { isValidDateTime, isValidIsoWeek } from '../api/_shared.js';
import { parseDefectImportRows, parseProdVolImportRows } from '../src/brain/importParsing.js';
import { computeCustomerReportData } from '../src/brain/reportData.js';

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

// Defect trend regression — compare occurrence rate, not raw defect count.
// Prior week: 20 defects / 100 inspected = 20%. Current week: 30 defects /
// 1000 inspected = 3%, so the normalized rate must be classified as falling
// even though the raw defect count increased.
const trendMetrics = [
  { week: '2026-W29', customer: 'CUST-A', model: 'MODEL-AA1', inspTOP: 100, inspBOT: 0, failedTOP: 20, failedBOT: 0, totalFailed: 20, totalInsp: 100, yieldTOP: 80, yieldBOT: null, yieldOverall: 80, dppm: 200000, totalDefects: 20 },
  { week: '2026-W30', customer: 'CUST-A', model: 'MODEL-AA1', inspTOP: 1000, inspBOT: 0, failedTOP: 30, failedBOT: 0, totalFailed: 30, totalInsp: 1000, yieldTOP: 97, yieldBOT: null, yieldOverall: 97, dppm: 30000, totalDefects: 30 },
];
const trendRows = [
  ...Array.from({ length: 20 }, (_, i) => ({ week: '2026-W29', customer: 'CUST-A', model: 'MODEL-AA1', defect: 'Solder Bridge', comp: `R${i + 1}`, sn: `SN-P${i + 1}`, side: 'TOP' })),
  ...Array.from({ length: 30 }, (_, i) => ({ week: '2026-W30', customer: 'CUST-A', model: 'MODEL-AA1', defect: 'Solder Bridge', comp: `R${i + 1}`, sn: `SN-C${i + 1}`, side: 'TOP' })),
];
const trendReport = computeCustomerReportData(
  'CUST-A',
  { from: '2026-W29', to: '2026-W30', weeks: ['2026-W29', '2026-W30'] },
  trendMetrics,
  trendRows,
);
assert.equal(trendReport.defectTrend('Solder Bridge'), 'falling');
assert.equal(trendReport.defectTrendInfo('Solder Bridge').currentRatePct, 3);
assert.equal(trendReport.defectTrendInfo('Solder Bridge').previousRatePct, 20);
assert.equal(trendReport.defectTrendInfo('Solder Bridge').deltaPp, -17);

console.log('date validation tests: PASS');

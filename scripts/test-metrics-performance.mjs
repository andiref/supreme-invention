import assert from 'node:assert/strict';
import { calcMetrics } from '../src/brain/metrics.js';

const prodVol = Array.from({ length: 100 }, (_, i) => ({
  week: `2026-W${String(i + 1).padStart(2, '0')}`,
  customer: 'ACME',
  model: 'M1',
  inspTOP: 1000,
  inspBOT: 1000
}));
const defects = Array.from({ length: 10000 }, (_, i) => {
  const n = i % 100;
  return {
    week: `2026-W${String(n + 1).padStart(2, '0')}`,
    customer: 'ACME',
    model: 'M1',
    sn: `SN${i}`,
    side: i % 2 ? 'TOP' : 'BOT',
    defect: 'Insufficient Solder'
  };
});

const started = Date.now();
const result = calcMetrics(defects, prodVol);
const elapsed = Date.now() - started;
assert.equal(result.length, 100);
assert.equal(result.reduce((sum, row) => sum + row.totalDefects, 0), defects.length);
assert.equal(result.every((row) => row.totalInsp === 2000), true);
assert.ok(elapsed < 1000, `calcMetrics took ${elapsed}ms`);
console.log(`metrics performance test: PASS (${elapsed}ms)`);

// Regression: a single legacy/malformed row with a missing model (or week)
// used to throw "Cannot read properties of undefined (reading
// 'localeCompare')" inside the final .sort() — crashing calcMetrics (and
// every view that calls it) for ALL customers, not just the bad row.
// Model can end up missing on old production-volume rows created before
// planProdVolImport required it, or on a manually-edited Firebase record.
const malformedProdVol = [
  ...prodVol,
  { week: '2026-W99', customer: 'ACME', model: undefined, inspTOP: 500, inspBOT: 500 },
];
assert.doesNotThrow(() => calcMetrics(defects, malformedProdVol));
console.log('metrics malformed-row regression test: PASS');

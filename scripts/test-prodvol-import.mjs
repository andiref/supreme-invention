import assert from 'node:assert/strict';
import { planProdVolImport } from '../api/yield.js';

// ── Correctness ──────────────────────────────────────────────────────────
// One existing record to update, one brand-new week+customer+model that
// needs both a TOP and a BOT row merged into a single created record.
const existing = {
  vol_1: { week: '2026-W20', customer: 'ACME', model: 'M1', inspTOP: 100, inspBOT: 80 },
};
const clean = [
  { week: '2026-W20', customer: 'ACME', model: 'M1', side: 'TOP', count: 150 },
  { week: '2026-W21', customer: 'ACME', model: 'M1', side: 'TOP', count: 40 },
  { week: '2026-W21', customer: 'ACME', model: 'M1', side: 'BOT', count: 30 },
];
let idSeq = 0;
const { updates, creates, changes } = planProdVolImport(clean, existing, 1700000000000, () => `vol_new_${idSeq++}`);

assert.deepEqual(updates, { vol_1: { updated: 1700000000000, inspTOP: 150 } });
assert.equal(creates.length, 1); // the two W21 rows (TOP+BOT) merge into ONE created record
assert.equal(creates[0].inspTOP, 40);
assert.equal(creates[0].inspBOT, 30);

const events = Object.values(changes);
assert.equal(events.filter((e) => e.kind === 'update').length, 1);
assert.equal(events.filter((e) => e.kind === 'create').length, 1);
const updateEvent = events.find((e) => e.kind === 'update');
assert.equal(updateEvent.before, 100);
assert.equal(updateEvent.after, 150);

// Case/whitespace differences in the key fields must still match the same
// existing record (mirrors normKey() in js/yield.js — see prodVolKey()).
const { updates: caseUpdates, creates: caseCreates } = planProdVolImport(
  [{ week: '2026-W20', customer: ' acme ', model: 'm1', side: 'BOT', count: 90 }],
  existing,
  1700000000000,
  () => 'vol_new'
);
assert.deepEqual(caseUpdates, { vol_1: { updated: 1700000000000, inspBOT: 90 } });
assert.equal(caseCreates.length, 0);

console.log('prodvol import correctness tests: PASS');

// ── Performance ──────────────────────────────────────────────────────────
// The old implementation did an existingArr.find() per imported row — an
// O(rows × existingRecords) scan. 2000 rows against 20000 existing records
// should complete quickly if the O(1) key lookup is actually being used.
const bigExisting = {};
for (let i = 0; i < 20000; i += 1) {
  bigExisting[`vol_${i}`] = { week: `2026-W${String((i % 52) + 1).padStart(2, '0')}`, customer: 'ACME', model: `M${i}`, inspTOP: 100, inspBOT: 100 };
}
const bigClean = Array.from({ length: 2000 }, (_, i) => ({
  week: `2026-W${String((i % 52) + 1).padStart(2, '0')}`, customer: 'ACME', model: `M${i}`, side: 'TOP', count: 999,
}));

const started = Date.now();
const bigResult = planProdVolImport(bigClean, bigExisting, Date.now(), () => `vol_new_${Math.random()}`);
const elapsed = Date.now() - started;
assert.equal(Object.keys(bigResult.updates).length, 2000);
assert.ok(elapsed < 1000, `planProdVolImport took ${elapsed}ms`);
console.log(`prodvol import performance test: PASS (${elapsed}ms)`);

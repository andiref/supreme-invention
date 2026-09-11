import assert from 'node:assert/strict';
import { planProdVolImport, planProdVolUndo } from '../api/yield.js';

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
const { updates, creates, changes, updatedCount } = planProdVolImport(clean, existing, 1700000000000, () => `vol_new_${idSeq++}`, 'imp_1');

// The patch written to smt_prodvol/{id} is a full node replacement (Firebase's
// multi-location PATCH does not merge into an existing object at that path), so
// it must carry every field forward — not just the ones this import touched —
// or week/customer/model/the untouched inspection side get silently deleted.
assert.deepEqual(updates, {
  vol_1: { week: '2026-W20', customer: 'ACME', model: 'M1', inspTOP: 150, inspBOT: 80, created: 1700000000000, updated: 1700000000000, lastImportId: 'imp_1' }
});
assert.equal(creates.length, 1); // the two W21 rows (TOP+BOT) merge into ONE created record
assert.equal(creates[0].inspTOP, 40);
assert.equal(creates[0].inspBOT, 30);

const events = Object.values(changes);
assert.equal(events.filter((e) => e.kind === 'update').length, 1);
assert.equal(updatedCount, 1);
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
  () => 'vol_new',
  'imp_2'
);
assert.deepEqual(caseUpdates, {
  vol_1: { week: '2026-W20', customer: 'ACME', model: 'M1', inspTOP: 100, inspBOT: 90, created: 1700000000000, updated: 1700000000000, lastImportId: 'imp_2' }
});
assert.equal(caseCreates.length, 0);

console.log('prodvol import correctness tests: PASS');

// ── Same-file reimport + undo safety ─────────────────────────────────────
const first = planProdVolImport(
  [{ week: '2026-W22', customer: 'ACME', model: 'M2', side: 'TOP', count: 50 }],
  {},
  1700000000000,
  () => 'vol_same',
  'import_A'
);
assert.equal(first.creates.length, 1);
const storedAfterFirst = { vol_same: { ...first.creates[0] } };

const second = planProdVolImport(
  [{ week: '2026-W22', customer: 'ACME', model: 'M2', side: 'TOP', count: 50 }],
  storedAfterFirst,
  1700000001000,
  () => 'should_not_create',
  'import_B'
);
assert.equal(second.creates.length, 0);
assert.equal(second.updatedCount, 0);
assert.equal(second.touchedCount, 1);
assert.equal(second.updates.vol_same.lastImportId, 'import_B');
// Regression: a same-file reimport must not drop week/customer/model (or the
// untouched inspection side) from the record — the patch is written as a full
// node replacement, so any field missing from it is deleted from Firebase.
assert.equal(second.updates.vol_same.week, '2026-W22');
assert.equal(second.updates.vol_same.customer, 'ACME');
assert.equal(second.updates.vol_same.model, 'M2');

const undoOld = planProdVolUndo(storedAfterFirst, Object.values(first.changes), 'import_A');
assert.equal(undoOld.deletes.length, 1);

const storedAfterSecond = {
  vol_same: { ...storedAfterFirst, ...second.updates.vol_same }
};
const undoAAfterB = planProdVolUndo(storedAfterSecond, Object.values(first.changes), 'import_A');
assert.equal(undoAAfterB.deletes.length, 0);
assert.ok(undoAAfterB.skipped >= 1);

console.log('prodvol same-file reimport/undo safety tests: PASS');


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

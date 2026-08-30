// Quick end-to-end smoke test for src/brain — run with `npm run test:brain`.
// Not a full test suite, just a sanity check that the extracted logic
// still behaves like the original app on the same sample data.

import assert from 'node:assert/strict';
import {
  buildDefectRow, calcMetrics, weeklySummary, findUnmatchedDefectCombos,
  paretoByDefectType, topFailingComponents, shiftBreakdown, dayOfWeekBreakdown,
  hourlyBreakdown, topDefectPerShift, dailyFailedTrend,
  capaKey, buildWeeklyTop3Map, chronicWeekCount, getCustomerCapaCards,
  computeCustomerReportData, resolveReportWeekRange, resolveWeekRange,
  DEFECT_LIBRARY, findLibraryEntry, searchLibrary,
  sortEquipment, equipmentStatusColor, buildDataHealth, capaHealth, chronicDefectCount,
} from '../src/brain/index.js';

// ---- sample defect rows (mirrors the format shown in the original UI) ----
const raw = [
  ['CUST-A', 'SN-001', 'MODEL-AA1', 'Solder Bridge', 'R1', '04/07/2025 08:23:15', 'TOP'],
  ['CUST-A', 'SN-001', 'MODEL-AA1', 'Missing Component', 'C5', '04/07/2025 08:45:02', 'TOP'], // same SN+side = still 1 fail
  ['CUST-A', 'SN-001', 'MODEL-AA1', 'Insuff Solder', 'U3', '04/07/2025 09:10:05', 'BOT'],       // diff side = 2nd fail
  ['CUST-A', 'SN-002', 'MODEL-AA1', 'Solder Bridge', 'R1', '04/07/2025 16:00:00', 'TOP'],       // afternoon shift
  ['CUST-B', 'SN-100', 'MODEL-BB2', 'Tombstone', 'C10', '04/14/2025 02:00:00', 'TOP'],           // next week, night shift
];
const defectRows = raw.map((r) => buildDefectRow(r[5], r[0], r[2], r[1], r[6], r[4], r[3])).filter(Boolean);
assert.equal(defectRows.length, 5, 'all sample rows should parse');
assert.equal(defectRows[0].week, '2025-W15');
assert.equal(defectRows[0].shift, 'Morning');
assert.equal(defectRows[3].shift, 'Afternoon');
assert.equal(defectRows[4].shift, 'Night');

const prodVol = [
  { week: '2025-W15', customer: 'CUST-A', model: 'MODEL-AA1', inspTOP: 500, inspBOT: 500 },
  { week: '2025-W16', customer: 'CUST-B', model: 'MODEL-BB2', inspTOP: 200, inspBOT: 200 },
];

// ---- metrics ----
const metrics = calcMetrics(defectRows, prodVol);
assert.equal(metrics.length, 2, 'one metric row per matched week/customer/model combo');
const custA = metrics.find((m) => m.customer === 'CUST-A');
assert.equal(custA.failedTOP, 2, 'SN-001 TOP (2 defects, same SN+side) + SN-002 TOP = 2 failed units');
assert.equal(custA.failedBOT, 1);
assert.equal(custA.totalFailed, 3);
assert.equal(custA.totalInsp, 1000);
console.log('✓ calcMetrics: CUST-A yield =', custA.yieldOverall.toFixed(3) + '%', 'dppm =', Math.round(custA.dppm));

const wk = weeklySummary(metrics);
assert.equal(wk.length, 2);

const unmatched = findUnmatchedDefectCombos(defectRows, []);
assert.equal(unmatched.length, 2, 'with no prod vol at all, both combos are unmatched');
console.log('✓ findUnmatchedDefectCombos surfaces', unmatched.length, 'combo(s) with no matching production volume');

// ---- pareto / components ----
const pareto = paretoByDefectType(defectRows);
assert.equal(pareto[0][0], 'Solder Bridge');
assert.equal(pareto[0][1], 2);
console.log('✓ paretoByDefectType top defect:', pareto[0]);

const topComps = topFailingComponents(defectRows);
assert.equal(topComps[0].comp, 'R1');
assert.equal(topComps[0].count, 2);
console.log('✓ topFailingComponents top component:', topComps[0].comp, `(${topComps[0].count})`);

// ---- time analysis ----
const shifts = shiftBreakdown(defectRows);
assert.equal(shifts.find((s) => s.name === 'Morning').count, 3);
assert.equal(shifts.find((s) => s.name === 'Afternoon').count, 1);
assert.equal(shifts.find((s) => s.name === 'Night').count, 1);
console.log('✓ shiftBreakdown:', shifts.map((s) => `${s.name}=${s.count}`).join(', '));

const dow = dayOfWeekBreakdown(defectRows);
assert.equal(dow.reduce((s, d) => s + d.count, 0), 5);

const hourly = hourlyBreakdown(defectRows);
assert.equal(hourly.reduce((s, h) => s + h.count, 0), 5);

const perShift = topDefectPerShift(defectRows);
assert.equal(perShift.find((s) => s.shift === 'Morning').topDefect, 'Solder Bridge');
console.log('✓ topDefectPerShift (Morning):', perShift.find((s) => s.shift === 'Morning').topDefect);

const daily = dailyFailedTrend(defectRows);
assert.equal(daily.length, 2, 'two distinct calendar dates in the sample');
console.log('✓ dailyFailedTrend:', daily);

// ---- library ----
assert.ok(DEFECT_LIBRARY.length >= 15, 'defect library should have all 15 entries');
assert.ok(findLibraryEntry('Solder Bridge'), 'library lookup by exact type works');
assert.equal(searchLibrary('tombstone').length, 1);
console.log('✓ defect library:', DEFECT_LIBRARY.length, 'entries,', searchLibrary('paste').length, 'match "paste"');

// ---- CAPA ----
const key = capaKey('CUST-A', 'Solder Bridge', 'MODEL-AA1', 'R1');
assert.equal(key, 'CUST-A__Solder Bridge__MODEL-AA1__R1');
const top3Map = buildWeeklyTop3Map(defectRows.filter((d) => d.customer === 'CUST-A'));
assert.ok(chronicWeekCount(top3Map, 'Solder Bridge') >= 1);
console.log('✓ capaKey:', key);

// Note: computeCustomerReportData's "top 3" always reflects the END of the
// requested range, not necessarily that customer's own latest week — so a
// range spanning both customers' weeks (ending W16, CUST-B only) would
// correctly leave CUST-A's t3 empty. Range it to CUST-A's own last week
// to exercise the non-empty case here.
const range = resolveReportWeekRange(['2025-W15']);
assert.equal(range.from, '2025-W15');
assert.equal(range.to, '2025-W15');
const rd = computeCustomerReportData('CUST-A', range, metrics, defectRows);
assert.ok(rd, 'report data computed for CUST-A');
assert.equal(rd.t3[0][0], 'Solder Bridge');
console.log('✓ computeCustomerReportData: CUST-A yield =', rd.yieldOverall.toFixed(2) + '%, top defect =', rd.t3[0][0]);

// Cross-customer range where CUST-A has no data in the final week: t3
// should come back empty for CUST-A specifically, matching original behavior.
const wideRange = resolveReportWeekRange(['2025-W15', '2025-W16']);
const rdWide = computeCustomerReportData('CUST-A', wideRange, metrics, defectRows);
assert.equal(rdWide.t3.length, 0, 'CUST-A has no rows in the wide range\'s end week (W16)');
console.log('✓ computeCustomerReportData correctly reflects range-end week, not per-customer latest week');

const cards = getCustomerCapaCards(rd, 'CUST-A', {}, false);
assert.equal(cards.length, rd.t3.length);
console.log('✓ getCustomerCapaCards:', cards.length, 'card(s) for CUST-A');

const clamped = resolveWeekRange(['W1', 'W2', 'W3'], 'W1', 'W3', 'to');
assert.deepEqual(clamped.weeks, ['W1', 'W2', 'W3']);

// ---- equipment ----
const eq = [
  { id: 'a', partName: 'Feeder', status: 'Installed', priority: 'Low', updated: 100 },
  { id: 'b', partName: 'Sensor', status: 'Requested', priority: 'High', created: 1 },
  { id: 'c', partName: 'Nozzle', status: 'Requested', priority: 'Medium', created: 2 },
];
const sorted = sortEquipment(eq);
assert.equal(sorted[0].id, 'b', 'High priority active item sorts first');
assert.equal(sorted[2].id, 'a', 'Installed sinks to the bottom');
console.log('✓ sortEquipment order:', sorted.map((e) => e.id).join(' > '));
assert.equal(equipmentStatusColor('Installed'), '#22c55e');
console.log('✓ sortEquipment order:', sorted.map((e) => e.id).join(' > '));

// ---- v3 data health ----
const capaSample = {
  c1: { customer: 'CUST-A', defect: 'Solder Bridge', monitoring: 'Open', dueDate: '2025-01-01' },
  c2: { customer: 'CUST-A', defect: 'Tombstone', monitoring: 'Effective', dueDate: '2099-01-01' },
};
const h = buildDataHealth(defectRows, prodVol, capaSample, new Date('2025-04-20T12:00:00'));
assert.equal(h.summary.unmatchedCombos, 0);
assert.equal(h.summary.productionRows, 2);
assert.equal(h.capa.overdue, 1);
assert.equal(h.chronic.count, 0);
assert.equal(capaHealth(capaSample, new Date('2025-04-20T12:00:00')).overdue, 1);
assert.equal(chronicDefectCount(defectRows).count, 0);
console.log('✓ buildDataHealth: warnings =', h.summary.warnings, 'overdue CAPA =', h.capa.overdue, 'chronic =', h.chronic.count);

console.log('\nAll brain smoke tests passed ✓');

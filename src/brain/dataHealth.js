import { normKey, findUnmatchedDefectCombos } from './metrics.js';
import { buildWeeklyTop3Map, chronicWeekCount } from './capaLogic.js';

function uniqueCount(rows, keyFn) { return new Set(rows.map(keyFn)).size; }

function isValidDateValue(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t);
}

export function capaHealth(capaRecords, now = new Date()) {
  const records = Object.values(capaRecords || {}).filter(Boolean);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let open = 0; let overdue = 0; let monitoring = 0; let effective = 0; let closed = 0;
  records.forEach((r) => {
    const status = r.monitoring || 'Open';
    if (status === 'Closed') closed += 1;
    else if (status === 'Effective') effective += 1;
    else if (status === 'Monitoring') monitoring += 1;
    else open += 1;
    if (status !== 'Closed' && r.dueDate && isValidDateValue(r.dueDate) && new Date(`${r.dueDate}T23:59:59`).getTime() < cutoff) overdue += 1;
  });
  return { total: records.length, open, overdue, monitoring, effective, closed };
}

export function chronicDefectCount(defectRows, lookbackWeeks = 4) {
  const byCustomer = new Map();
  defectRows.forEach((d) => {
    if (!byCustomer.has(d.customer)) byCustomer.set(d.customer, []);
    byCustomer.get(d.customer).push(d);
  });
  let count = 0;
  const details = [];
  for (const [customer, rows] of byCustomer) {
    const weekMap = buildWeeklyTop3Map(rows);
    const weeks = Object.keys(weekMap).sort().slice(-lookbackWeeks);
    const defects = new Set(rows.map((d) => d.defect));
    defects.forEach((defect) => {
      const weeksInTop3 = chronicWeekCount(Object.fromEntries(weeks.map((w) => [w, weekMap[w]])), defect);
      if (weeksInTop3 >= 2) { count += 1; details.push({ customer, defect, weeksInTop3 }); }
    });
  }
  return { count, details: details.sort((a, b) => b.weeksInTop3 - a.weeksInTop3 || a.defect.localeCompare(b.defect)) };
}

export function buildDataHealth(defectRows, prodVolRows, capaRecords = {}, now = new Date()) {
  const unmatched = findUnmatchedDefectCombos(defectRows, prodVolRows);
  const pvKeys = prodVolRows.map((p) => normKey(p.week, p.customer, p.model));
  const duplicatePvKeys = uniqueCount(pvKeys, (x) => x) < pvKeys.length;
  const zeroVolumeRows = prodVolRows.filter((p) => (p.inspTOP || 0) + (p.inspBOT || 0) <= 0);
  const invalidVolumeRows = prodVolRows.filter((p) => (p.inspTOP || 0) < 0 || (p.inspBOT || 0) < 0);
  const health = capaHealth(capaRecords, now);
  const chronic = chronicDefectCount(defectRows);
  const unmatchedKeys = new Set(unmatched.map((u) => normKey(u.week, u.customer, u.model)));
  const matchedComboKeys = uniqueCount(prodVolRows.filter((p) => !unmatchedKeys.has(normKey(p.week, p.customer, p.model))), (p) => normKey(p.week, p.customer, p.model));
  const duplicateProdCombos = pvKeys.length - new Set(pvKeys).size;

  const warningCount = unmatched.length + zeroVolumeRows.length + invalidVolumeRows.length + (duplicatePvKeys ? 1 : 0) + health.overdue;
  return {
    summary: {
      defectRows: defectRows.length,
      productionRows: prodVolRows.length,
      matchedCombos: matchedComboKeys,
      unmatchedCombos: unmatched.length,
      duplicateProdCombos,
      zeroVolumeRows: zeroVolumeRows.length,
      invalidVolumeRows: invalidVolumeRows.length,
      warnings: warningCount,
    },
    unmatched,
    zeroVolumeRows,
    invalidVolumeRows,
    capa: health,
    chronic,
    generatedAt: now.toISOString(),
  };
}

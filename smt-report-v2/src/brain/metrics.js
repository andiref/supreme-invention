// ============================================
// metrics.js — Yield / DPPM calculation
//
// Joins Defect Data rows against Production Volume rows on
// Week + Customer + Model to compute per-combo and per-week yield/DPPM.
// Pure functions: (DefectRow[], ProdVolRow[]) -> metrics[]. No DOM.
// ============================================

/**
 * @typedef {Object} ProdVolRow
 * @property {string} week
 * @property {string} customer
 * @property {string} model
 * @property {number} inspTOP
 * @property {number} inspBOT
 */

/**
 * @typedef {Object} MetricRow
 * @property {string} week
 * @property {string} customer
 * @property {string} model
 * @property {number} inspTOP
 * @property {number} inspBOT
 * @property {number} failedTOP
 * @property {number} failedBOT
 * @property {number} totalFailed
 * @property {number} totalInsp
 * @property {number|null} yieldTOP
 * @property {number|null} yieldBOT
 * @property {number} yieldOverall
 * @property {number} dppm
 * @property {number} totalDefects
 * @property {boolean} yieldOk
 * @property {boolean} dppmOk
 */

/**
 * Normalizes a Week+Customer+Model combo into a join key that ignores case
 * and leading/trailing whitespace, since Defect Data and Production Volume
 * are typically typed or exported from two different sources.
 */
export function normKey(week, customer, model) {
  const n = (s) => String(s || '').trim().toLowerCase();
  return `${n(week)}|${n(customer)}|${n(model)}`;
}

/**
 * Computes one MetricRow per distinct Week+Customer+Model combo that has
 * BOTH a Production Volume entry and (optionally) Defect Data. Combos with
 * Defect Data but no matching Production Volume are silently excluded —
 * see `findUnmatchedDefectCombos` to surface those to the user instead.
 *
 * @param {DefectRow[]} defectRows
 * @param {ProdVolRow[]} prodVolRows
 * @param {{ yieldTarget?: number, dppmLimit?: number }} [thresholds]
 * @returns {MetricRow[]} sorted by week, then model
 */
export function calcMetrics(defectRows, prodVolRows, thresholds = {}) {
  const { yieldTarget = 99.5, dppmLimit = 5000 } = thresholds;

  // Two prodVol rows can normalize to the same key (e.g. "CustA" vs
  // "custa" imported at different times). Sum inspTOP/inspBOT across every
  // row that maps to a given key instead of keeping only the first —
  // otherwise the dropped row's inspected counts silently vanish.
  const pvByKey = new Map();
  prodVolRows.forEach((p) => {
    const k = normKey(p.week, p.customer, p.model);
    const acc = pvByKey.get(k);
    if (acc) {
      acc.inspTOP += p.inspTOP || 0;
      acc.inspBOT += p.inspBOT || 0;
    } else {
      pvByKey.set(k, {
        week: p.week, customer: p.customer, model: p.model,
        inspTOP: p.inspTOP || 0, inspBOT: p.inspBOT || 0,
      });
    }
  });

  // Display text (week/customer/model as shown in KPIs/tables) is taken
  // from whichever Defect Data row first used this combo — usually the
  // more detailed/authoritative source — falling back to Production
  // Volume's text if there's no defect data for this combo yet.
  const drDisplay = new Map();
  defectRows.forEach((d) => {
    const k = normKey(d.week, d.customer, d.model);
    if (!drDisplay.has(k)) drDisplay.set(k, { week: d.week, customer: d.customer, model: d.model });
  });

  const keys = new Set([...pvByKey.keys(), ...drDisplay.keys()]);
  const result = [];

  keys.forEach((k) => {
    const prow = pvByKey.get(k);
    if (!prow) return; // no production volume => no yield/DPPM for this combo

    const drows = defectRows.filter((d) => normKey(d.week, d.customer, d.model) === k);
    const disp = drDisplay.get(k) || { week: prow.week, customer: prow.customer, model: prow.model };

    const inspTOP = prow.inspTOP || 0;
    const inspBOT = prow.inspBOT || 0;
    // Same SN+Side = one failed pass; a different side is a separate failure.
    const failedTOP = new Set(drows.filter((d) => d.side === 'TOP').map((d) => `${d.sn}|TOP`)).size;
    const failedBOT = new Set(drows.filter((d) => d.side === 'BOT').map((d) => `${d.sn}|BOT`)).size;
    const totalFailed = failedTOP + failedBOT;
    const totalInsp = inspTOP + inspBOT;

    const yieldTOP = inspTOP ? ((inspTOP - failedTOP) / inspTOP) * 100 : null;
    const yieldBOT = inspBOT ? ((inspBOT - failedBOT) / inspBOT) * 100 : null;
    const yieldOverall = totalInsp ? ((totalInsp - totalFailed) / totalInsp) * 100 : 0;
    const dppm = totalInsp ? (totalFailed / totalInsp) * 1e6 : 0;

    result.push({
      week: disp.week, customer: disp.customer, model: disp.model,
      inspTOP, inspBOT, failedTOP, failedBOT, totalFailed, totalInsp,
      yieldTOP, yieldBOT, yieldOverall, dppm,
      totalDefects: drows.length,
      yieldOk: yieldOverall >= yieldTarget,
      dppmOk: dppm <= dppmLimit,
    });
  });

  return result.sort((a, b) => a.week.localeCompare(b.week) || a.model.localeCompare(b.model));
}

/**
 * Finds Week+Customer+Model combos that have Defect Data but no matching
 * Production Volume row — these are silently excluded from calcMetrics(),
 * so surface them to explain "why is nothing showing".
 */
export function findUnmatchedDefectCombos(defectRows, prodVolRows) {
  const pvKeySet = new Set(prodVolRows.map((p) => normKey(p.week, p.customer, p.model)));
  const combos = new Map();
  defectRows.forEach((d) => {
    const k = normKey(d.week, d.customer, d.model);
    if (!combos.has(k)) combos.set(k, { week: d.week, customer: d.customer, model: d.model });
  });
  return [...combos.values()].filter((c) => !pvKeySet.has(normKey(c.week, c.customer, c.model)));
}

/** Rolls MetricRow[] up into one summary row per week. */
export function weeklySummary(metrics) {
  return [...new Set(metrics.map((m) => m.week))].sort().map((week) => {
    const rows = metrics.filter((m) => m.week === week);
    const totalInsp = rows.reduce((s, r) => s + r.totalInsp, 0);
    const totalFailed = rows.reduce((s, r) => s + r.totalFailed, 0);
    return {
      week,
      yieldPct: totalInsp ? ((totalInsp - totalFailed) / totalInsp) * 100 : 0,
      dppm: totalInsp ? (totalFailed / totalInsp) * 1e6 : 0,
      totalInsp,
      totalFailed,
    };
  });
}

/** Sums KPI totals across a set of MetricRows (already filtered by caller). */
export function aggregateKpis(metrics) {
  const totalInsp = metrics.reduce((s, r) => s + r.totalInsp, 0);
  const totalFailed = metrics.reduce((s, r) => s + r.totalFailed, 0);
  const failedTOP = metrics.reduce((s, r) => s + r.failedTOP, 0);
  const failedBOT = metrics.reduce((s, r) => s + r.failedBOT, 0);
  const inspTOP = metrics.reduce((s, r) => s + r.inspTOP, 0);
  const inspBOT = metrics.reduce((s, r) => s + r.inspBOT, 0);
  const totalDefects = metrics.reduce((s, r) => s + r.totalDefects, 0);
  return {
    totalInsp, totalFailed, failedTOP, failedBOT, inspTOP, inspBOT, totalDefects,
    yieldOverall: totalInsp ? ((totalInsp - totalFailed) / totalInsp) * 100 : 0,
    yieldTOP: inspTOP ? ((inspTOP - failedTOP) / inspTOP) * 100 : null,
    yieldBOT: inspBOT ? ((inspBOT - failedBOT) / inspBOT) * 100 : null,
    dppm: totalInsp ? (totalFailed / totalInsp) * 1e6 : 0,
  };
}

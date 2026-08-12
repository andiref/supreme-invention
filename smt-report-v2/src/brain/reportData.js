// ============================================
// reportData.js — week-range resolution + the per-customer numbers behind
// both the on-screen report and the CAPA tracker. Pure functions: given
// raw rows + metrics + a week range, returns plain data. No DOM, no canvas.
// ============================================

import { REPORT_MAX_WEEKS } from './constants.js';
import { weeklySummary } from './metrics.js';

/**
 * Clamps a from/to week selection to a valid, ordered pair within
 * REPORT_MAX_WEEKS of each other. `anchor` ('from'|'to') says which end of
 * the pair the user just changed, so the cap trims from the other end.
 * @param {string[]} allWeeksSorted
 */
export function resolveWeekRange(allWeeksSorted, fromWeek, toWeek, anchor) {
  if (!allWeeksSorted.length) return { from: '', to: '', weeks: [] };
  let i0 = allWeeksSorted.indexOf(fromWeek);
  if (i0 === -1) i0 = 0;
  let i1 = allWeeksSorted.indexOf(toWeek);
  if (i1 === -1) i1 = allWeeksSorted.length - 1;
  if (i0 > i1) {
    if (anchor === 'from') i1 = i0; else i0 = i1;
  }
  if (i1 - i0 + 1 > REPORT_MAX_WEEKS) {
    if (anchor === 'from') i1 = Math.min(allWeeksSorted.length - 1, i0 + REPORT_MAX_WEEKS - 1);
    else i0 = Math.max(0, i1 - REPORT_MAX_WEEKS + 1);
  }
  return { from: allWeeksSorted[i0], to: allWeeksSorted[i1], weeks: allWeeksSorted.slice(i0, i1 + 1) };
}

/**
 * Resolves the report's week-range selection to a validated range, filling
 * in sensible defaults (last REPORT_MAX_WEEKS weeks) if nothing's selected
 * yet. Caller supplies the current UI selection (or undefined for "use default").
 */
export function resolveReportWeekRange(allDefectWeeksSorted, selectedFrom, selectedTo) {
  if (!allDefectWeeksSorted.length) return null;
  const defaultFrom = allDefectWeeksSorted[Math.max(0, allDefectWeeksSorted.length - REPORT_MAX_WEEKS)];
  const defaultTo = allDefectWeeksSorted[allDefectWeeksSorted.length - 1];
  return resolveWeekRange(allDefectWeeksSorted, selectedFrom || defaultFrom, selectedTo || defaultTo, 'to');
}

/** Truncates text to at most maxLen chars, adding an ellipsis. */
function truncateText(name, maxLen) {
  return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
}

/**
 * Computes every metric/chart value needed to render one customer's report
 * section for a resolved week range. Returns null if that customer has no
 * data in range. `customer === 'ALL'` aggregates every customer together.
 *
 * @param {string} customer
 * @param {{from:string,to:string,weeks:string[]}} range
 * @param {MetricRow[]} allMetrics
 * @param {DefectRow[]} allDefectRows
 */
export function computeCustomerReportData(customer, range, allMetrics, allDefectRows) {
  const metricsAllTime = customer === 'ALL' ? allMetrics : allMetrics.filter((m) => m.customer === customer);
  const rowsAllTime = customer === 'ALL' ? allDefectRows : allDefectRows.filter((d) => d.customer === customer);
  const metricsInRange = metricsAllTime.filter((m) => m.week >= range.from && m.week <= range.to);
  const rowsInRange = rowsAllTime.filter((d) => d.week >= range.from && d.week <= range.to);

  const weeklyInRange = weeklySummary(metricsInRange);
  if (!weeklyInRange.length) return null;

  const totalInsp = metricsInRange.reduce((s, r) => s + r.totalInsp, 0);
  const totalFailed = metricsInRange.reduce((s, r) => s + r.totalFailed, 0);
  const failedTOP = metricsInRange.reduce((s, r) => s + r.failedTOP, 0);
  const failedBOT = metricsInRange.reduce((s, r) => s + r.failedBOT, 0);
  const inspTOP = metricsInRange.reduce((s, r) => s + r.inspTOP, 0);
  const inspBOT = metricsInRange.reduce((s, r) => s + r.inspBOT, 0);

  const labels = weeklyInRange.map((w) => {
    const m = w.week.match(/W(\d+)$/);
    return m ? `WW${m[1]}` : w.week;
  });

  // Top-3 defects reference the END of the selected range (not necessarily
  // the absolute latest week in the whole dataset), so the breakdown stays
  // consistent with whichever weeks the report actually covers.
  const latestWeekInRange = range.to || '';
  const latestWeekRows = rowsInRange.filter((d) => d.week === latestWeekInRange);
  const defectCounts = {};
  latestWeekRows.forEach((d) => { defectCounts[d.defect] = (defectCounts[d.defect] || 0) + 1; });
  const top3 = Object.entries(defectCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  /** Top contributing value (model/comp) for a defect, truncated + " (count)" — for display. */
  function topOf(defect, key, maxLen = 13) {
    const counts = {};
    latestWeekRows.filter((d) => d.defect === defect).forEach((d) => { counts[d[key]] = (counts[d[key]] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return '-';
    return `${truncateText(String(sorted[0][0]), maxLen)} (${sorted[0][1]})`;
  }

  /** Same ranking as topOf() but the raw value only — for CAPA chain identity, not display. */
  function topContributor(defect, key) {
    const counts = {};
    latestWeekRows.filter((d) => d.defect === defect).forEach((d) => { counts[d[key]] = (counts[d[key]] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length ? String(sorted[0][0]) : '';
  }

  /** Actual occurrence count for one exact chain this week, independent of Top-3 rank. */
  function countFor(defect, model, comp) {
    return latestWeekRows.filter((d) => d.defect === defect && d.model === model && d.comp === comp).length;
  }

  // ---- Digest-only figures: decoupled from the from/to range picker ----
  // 1) headline yield/DPPM for the single latest week (a snapshot, not an average)
  // 2) a trend series spanning the last REPORT_MAX_WEEKS weeks ending at that week,
  //    regardless of how narrow/wide the selected range is.
  const latestWeekMetrics = metricsAllTime.filter((m) => m.week === latestWeekInRange);
  const latestTotalInsp = latestWeekMetrics.reduce((s, r) => s + r.totalInsp, 0);
  const latestTotalFailed = latestWeekMetrics.reduce((s, r) => s + r.totalFailed, 0);
  const latestFailedTOP = latestWeekMetrics.reduce((s, r) => s + r.failedTOP, 0);
  const latestFailedBOT = latestWeekMetrics.reduce((s, r) => s + r.failedBOT, 0);
  const latestInspTOP = latestWeekMetrics.reduce((s, r) => s + r.inspTOP, 0);
  const latestInspBOT = latestWeekMetrics.reduce((s, r) => s + r.inspBOT, 0);

  const allWeeksForCustomer = [...new Set(metricsAllTime.map((m) => m.week))].sort();
  let toIdx = allWeeksForCustomer.indexOf(latestWeekInRange);
  if (toIdx === -1) toIdx = allWeeksForCustomer.length - 1;
  const trendWeeks = toIdx === -1 ? [] : allWeeksForCustomer.slice(Math.max(0, toIdx - REPORT_MAX_WEEKS + 1), toIdx + 1);
  const trendWeekSet = new Set(trendWeeks);
  const trendSummary = weeklySummary(metricsAllTime.filter((m) => trendWeekSet.has(m.week)));

  return {
    totalInsp, totalFailed, failedTOP, failedBOT, inspTOP, inspBOT,
    yieldOverall: totalInsp ? ((totalInsp - totalFailed) / totalInsp) * 100 : 0,
    yieldTOP: inspTOP ? ((inspTOP - failedTOP) / inspTOP) * 100 : null,
    yieldBOT: inspBOT ? ((inspBOT - failedBOT) / inspBOT) * 100 : null,
    dppm: totalInsp ? (totalFailed / totalInsp) * 1e6 : 0,
    labels,
    yieldSeries: weeklyInRange.map((w) => w.yieldPct),
    dppmSeries: weeklyInRange.map((w) => w.dppm),
    t3: top3,
    topOf,
    topContributor,
    countFor,
    lw: latestWeekInRange,
    filtRawCount: rowsInRange.length,

    // digest-only
    latestYieldOverall: latestTotalInsp ? ((latestTotalInsp - latestTotalFailed) / latestTotalInsp) * 100 : 0,
    latestDppm: latestTotalInsp ? (latestTotalFailed / latestTotalInsp) * 1e6 : 0,
    latestTotalInsp,
    trendLabels: trendSummary.map((w) => {
      const m = w.week.match(/W(\d+)$/);
      return m ? `WW${m[1]}` : w.week;
    }),
    trendYieldSeries: trendSummary.map((w) => w.yieldPct),
    trendDppmSeries: trendSummary.map((w) => w.dppm),
  };
}

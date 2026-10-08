// ============================================
// reportData.js — week-range resolution + the per-customer numbers behind
// both the on-screen report and the CAPA tracker. Pure functions: given
// raw rows + metrics + a week range, returns plain data. No DOM, no canvas.
// ============================================

import { REPORT_MAX_WEEKS, YIELD_TARGET, DPPM_LIMIT } from "./constants.js";
import { weeklySummary } from "./metrics.js";
import { groupCustomers } from "./customerGroups.js";

/**
 * Overall HEALTHY / WARNING / CRITICAL read on a week's headline KPIs, plus
 * the one-line summary shown next to the status badge in the weekly digest.
 * @param {{latestYieldOverall:number, latestDppm:number, latestTotalInsp:number, t3:[string,number][]}} data
 *   — the object returned by computeCustomerReportData().
 */
export function computeQualityStatus(data) {
  if (!data.latestTotalInsp) {
    return {
      status: "NO DATA",
      yieldOk: false,
      dppmOk: false,
      notes: "No inspection data recorded for this week.",
    };
  }
  const yieldOk = data.latestYieldOverall >= YIELD_TARGET;
  const dppmOk = data.latestDppm <= DPPM_LIMIT;
  const status =
    yieldOk && dppmOk ? "HEALTHY" : yieldOk || dppmOk ? "WARNING" : "CRITICAL";
  const defectCount = data.t3.length;
  const notes = [
    `Yield ${yieldOk ? "above" : "below"} target`,
    `DPPM ${dppmOk ? "below" : "above"} limit`,
    `${defectCount} priority defect${defectCount === 1 ? "" : "s"}`,
  ].join(" \u00b7 ");
  return { status, yieldOk, dppmOk, notes };
}

/**
 * Clamps a from/to week selection to a valid, ordered pair within
 * REPORT_MAX_WEEKS of each other. `anchor` ('from'|'to') says which end of
 * the pair the user just changed, so the cap trims from the other end.
 * @param {string[]} allWeeksSorted
 */
export function resolveWeekRange(allWeeksSorted, fromWeek, toWeek, anchor) {
  if (!allWeeksSorted.length) return { from: "", to: "", weeks: [] };
  let i0 = allWeeksSorted.indexOf(fromWeek);
  if (i0 === -1) i0 = 0;
  let i1 = allWeeksSorted.indexOf(toWeek);
  if (i1 === -1) i1 = allWeeksSorted.length - 1;
  if (i0 > i1) {
    if (anchor === "from") i1 = i0;
    else i0 = i1;
  }
  if (i1 - i0 + 1 > REPORT_MAX_WEEKS) {
    if (anchor === "from")
      i1 = Math.min(allWeeksSorted.length - 1, i0 + REPORT_MAX_WEEKS - 1);
    else i0 = Math.max(0, i1 - REPORT_MAX_WEEKS + 1);
  }
  return {
    from: allWeeksSorted[i0],
    to: allWeeksSorted[i1],
    weeks: allWeeksSorted.slice(i0, i1 + 1),
  };
}

/**
 * Resolves the report's week-range selection to a validated range, filling
 * in sensible defaults (last REPORT_MAX_WEEKS weeks) if nothing's selected
 * yet. Caller supplies the current UI selection (or undefined for "use default").
 */
export function resolveReportWeekRange(
  allDefectWeeksSorted,
  selectedFrom,
  selectedTo,
) {
  if (!allDefectWeeksSorted.length) return null;
  const defaultFrom =
    allDefectWeeksSorted[
      Math.max(0, allDefectWeeksSorted.length - REPORT_MAX_WEEKS)
    ];
  const defaultTo = allDefectWeeksSorted[allDefectWeeksSorted.length - 1];
  return resolveWeekRange(
    allDefectWeeksSorted,
    selectedFrom || defaultFrom,
    selectedTo || defaultTo,
    "to",
  );
}

/** The default digest selection: the latest `count` weeks (REPORT_MAX_WEEKS = 11). */
export function defaultReportWeeks(allWeeksSorted, count = REPORT_MAX_WEEKS) {
  return allWeeksSorted.slice(Math.max(0, allWeeksSorted.length - count));
}

/**
 * Builds the digest's range from an explicit, free selection of weeks (any
 * weeks, contiguous or not — e.g. WW32-WW35 for an August roll-up).
 *  - from/to are the first/last selected week; `to` is the digest's
 *    reference week.
 *  - rollup=false: headline KPIs + Top 3 defects describe the reference week
 *    only; the selected weeks drive the trend charts.
 *  - rollup=true: headline KPIs + Top 3 defects accumulate over every
 *    selected week (same rule as the Yield tab's monthly KPI roll-up).
 * An empty/unknown selection falls back to defaultReportWeeks().
 *
 * @param {string[]} allWeeksSorted
 * @param {Iterable<string>} selectedWeeks
 * @param {{rollup?:boolean}} [opts]
 * @returns {{from:string,to:string,weeks:string[],rollup:boolean}|null}
 */
export function buildWeekSelectionRange(allWeeksSorted, selectedWeeks, { rollup = false } = {}) {
  const sel = new Set(selectedWeeks || []);
  let weeks = allWeeksSorted.filter((w) => sel.has(w));
  if (!weeks.length) weeks = defaultReportWeeks(allWeeksSorted);
  if (!weeks.length) return null;
  return {
    from: weeks[0], to: weeks[weeks.length - 1], weeks, rollup: !!rollup,
  };
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
 * @param {string|string[]} customer   one name, 'ALL', or several names to combine
 * @param {{from:string,to:string,weeks:string[]}} range
 * @param {MetricRow[]} allMetrics
 * @param {DefectRow[]} allDefectRows
 */
export function computeCustomerReportData(
  customer,
  range,
  allMetrics,
  allDefectRows,
) {
  // `customer` is a single name, 'ALL', or an array of names combined into
  // one report (used for grouped customers such as CASCO-1 + CASCO-2).
  const members = Array.isArray(customer) ? new Set(customer) : null;
  const matchesCustomer = (c) =>
    customer === "ALL" || (members ? members.has(c) : c === customer);
  const metricsAllTime =
    customer === "ALL" ? allMetrics : allMetrics.filter((m) => matchesCustomer(m.customer));
  const rowsAllTime =
    customer === "ALL" ? allDefectRows : allDefectRows.filter((d) => matchesCustomer(d.customer));
  // An explicit week list (any weeks, not necessarily contiguous) wins over
  // the from/to bounds; legacy callers that only pass from/to still work.
  const weekSet = range.weeks && range.weeks.length ? new Set(range.weeks) : null;
  const inRange = (w) => (weekSet ? weekSet.has(w) : w >= range.from && w <= range.to);
  const rollup = !!range.rollup;
  const metricsInRange = metricsAllTime.filter((m) => inRange(m.week));
  const rowsInRange = rowsAllTime.filter((d) => inRange(d.week));

  const weeklyInRange = weeklySummary(metricsInRange);
  if (!weeklyInRange.length) return null;

  const totalInsp = metricsInRange.reduce((s, r) => s + r.totalInsp, 0);
  const totalFailed = metricsInRange.reduce((s, r) => s + r.totalFailed, 0);
  const failedTOP = metricsInRange.reduce((s, r) => s + r.failedTOP, 0);
  const failedBOT = metricsInRange.reduce((s, r) => s + r.failedBOT, 0);
  const inspTOP = metricsInRange.reduce((s, r) => s + r.inspTOP, 0);
  const inspBOT = metricsInRange.reduce((s, r) => s + r.inspBOT, 0);

  const labels = weeklyInRange.map((w) => {
    const m = String(w.week).match(/W(\d+)$/);
    return m ? `WW${m[1]}` : w.week;
  });

  // Top-3 defects reference the END of the selected range (not necessarily
  // the absolute latest week in the whole dataset), so the breakdown stays
  // consistent with whichever weeks the report actually covers.
  const latestWeekInRange = range.to || "";
  const latestWeekRows = rowsInRange.filter(
    (d) => d.week === latestWeekInRange,
  );
  // Roll-up mode counts defects across every selected week; otherwise only
  // the reference week.
  const scopeRows = rollup ? rowsInRange : latestWeekRows;
  const defectCounts = {};
  scopeRows.forEach((d) => {
    defectCounts[d.defect] = (defectCounts[d.defect] || 0) + 1;
  });
  const top3 = Object.entries(defectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  /** Top contributing value (model/comp) for a defect, truncated + " (count)"
   *  for display. maxLen defaults generously high — component refs (U7, J2,
   *  SH1) never approach it, and model numbers should display in full rather
   *  than clipping to "T100098-20-C…"; it only exists as a safety cap
   *  against a pathologically long value breaking the layout. */
  function topOf(defect, key, maxLen = 40) {
    const counts = {};
    scopeRows
      .filter((d) => d.defect === defect)
      .forEach((d) => {
        counts[d[key]] = (counts[d[key]] || 0) + 1;
      });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return "-";
    return `${truncateText(String(sorted[0][0]), maxLen)} (${sorted[0][1]})`;
  }

  /** Same ranking as topOf() but the raw value only — for CAPA chain identity, not display. */
  function topContributor(defect, key) {
    const counts = {};
    scopeRows
      .filter((d) => d.defect === defect)
      .forEach((d) => {
        counts[d[key]] = (counts[d[key]] || 0) + 1;
      });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length ? String(sorted[0][0]) : "";
  }

  /** Actual occurrence count for one exact chain this week, independent of Top-3 rank. */
  function countFor(defect, model, comp) {
    return scopeRows.filter(
      (d) => d.defect === defect && d.model === model && d.comp === comp,
    ).length;
  }

  // ---- Digest-only figures ----
  // 1) headline yield/DPPM for the reference week (or the roll-up of all selected weeks)
  // 2) a trend series over the selected weeks.
  // Headline figures: the reference week alone, or (roll-up) the sum of all
  // selected weeks.
  const latestWeekMetrics = rollup
    ? metricsInRange
    : metricsAllTime.filter((m) => m.week === latestWeekInRange);
  const latestTotalInsp = latestWeekMetrics.reduce(
    (s, r) => s + r.totalInsp,
    0,
  );
  const latestTotalFailed = latestWeekMetrics.reduce(
    (s, r) => s + r.totalFailed,
    0,
  );
  const latestFailedTOP = latestWeekMetrics.reduce(
    (s, r) => s + r.failedTOP,
    0,
  );
  const latestFailedBOT = latestWeekMetrics.reduce(
    (s, r) => s + r.failedBOT,
    0,
  );
  const latestInspTOP = latestWeekMetrics.reduce((s, r) => s + r.inspTOP, 0);
  const latestInspBOT = latestWeekMetrics.reduce((s, r) => s + r.inspBOT, 0);

  // Trend = the selected weeks THIS CUSTOMER actually has data for
  // ("builds"). A customer with data in only some of the selected weeks
  // gets a shorter chart instead of being padded with empty slots; every
  // plotted point keeps its real week label.
  const custWeeksSorted = [
    ...new Set(metricsAllTime.map((m) => m.week)),
  ].sort();
  let toIdx = custWeeksSorted.indexOf(latestWeekInRange);
  if (toIdx === -1) toIdx = custWeeksSorted.length - 1;
  const trendWeeks = custWeeksSorted.filter(inRange);
  const trendByWeek = new Map(
    weeklySummary(metricsAllTime).map((w) => [w.week, w]),
  );

  // Previous week (immediately preceding the digest's reference week, for
  // this customer specifically) — used only to flag whether each of this
  // week's top-3 defects is trending up or down since last week.
  const latestIdxForTrend = custWeeksSorted.indexOf(latestWeekInRange);
  const prevWeekForDefects =
    latestIdxForTrend > 0 ? custWeeksSorted[latestIdxForTrend - 1] : null;
  const prevWeekDefectRows = prevWeekForDefects
    ? rowsAllTime.filter((d) => d.week === prevWeekForDefects)
    : [];
  const prevDefectCounts = {};
  prevWeekDefectRows.forEach((d) => {
    prevDefectCounts[d.defect] = (prevDefectCounts[d.defect] || 0) + 1;
  });

  // Prior-week and last-4-week figures are always relative to the reference
  // week over this customer's whole history, independent of which weeks are
  // selected for the trend (so picking a single week still shows a delta).
  const prevWeekSummary = prevWeekForDefects ? trendByWeek.get(prevWeekForDefects) : null;
  const shortWeek = (w) => {
    const m = String(w).match(/W(\d+)$/);
    return m ? `WW${m[1]}` : w;
  };
  const last4Weeks = latestIdxForTrend >= 0
    ? custWeeksSorted.slice(Math.max(0, latestIdxForTrend - 3), latestIdxForTrend + 1)
    : [];
  const avgOf = (key) => {
    const vals = last4Weeks.map((w) => trendByWeek.get(w)?.[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
  };

  // Defect trend is normalized by inspection volume. Comparing raw occurrence
  // counts can reverse the quality signal when weekly production volume
  // changes materially (e.g. 20/100 = 20% vs 30/1000 = 3%).
  const prevWeekMetrics = prevWeekForDefects
    ? metricsAllTime.filter((m) => m.week === prevWeekForDefects)
    : [];
  const prevWeekTotalInsp = prevWeekMetrics.reduce(
    (s, r) => s + r.totalInsp,
    0,
  );

  function defectRatePct(count, totalInsp) {
    return totalInsp > 0 ? (count / totalInsp) * 100 : null;
  }

  /** 'rising' | 'falling' | 'flat' | null based on occurrence rate,
   * not raw defect count. */
  function defectTrend(defect) {
    if (rollup || !prevWeekForDefects || latestTotalInsp <= 0 || prevWeekTotalInsp <= 0) return null;
    const prev = prevDefectCounts[defect] || 0;
    const curr = defectCounts[defect] || 0;

    // Compare the two fractions directly to avoid floating-point edge cases:
    // curr / currentInsp vs prev / previousInsp.
    const lhs = curr * prevWeekTotalInsp;
    const rhs = prev * latestTotalInsp;
    if (lhs > rhs) return "rising";
    if (lhs < rhs) return "falling";
    return "flat";
  }

  /** Exact rate context for one of this week's top-3 defects. */
  function defectTrendInfo(defect) {
    if (rollup || !prevWeekForDefects || latestTotalInsp <= 0 || prevWeekTotalInsp <= 0) return null;
    const prev = prevDefectCounts[defect] || 0;
    const curr = defectCounts[defect] || 0;
    const currentRatePct = defectRatePct(curr, latestTotalInsp);
    const previousRatePct = defectRatePct(prev, prevWeekTotalInsp);
    return {
      currentRatePct,
      previousRatePct,
      deltaPp: currentRatePct - previousRatePct,
      trend: defectTrend(defect),
    };
  }

  return {
    totalInsp,
    totalFailed,
    failedTOP,
    failedBOT,
    inspTOP,
    inspBOT,
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
    defectTrend,
    defectTrendInfo,
    lw: latestWeekInRange,
    filtRawCount: rowsInRange.length,

    // digest-only
    rollup,
    rollupWeekCount: weeklyInRange.length,
    prevYield: prevWeekSummary ? prevWeekSummary.yieldPct : null,
    prevDppm: prevWeekSummary ? prevWeekSummary.dppm : null,
    prevWeekLabel: prevWeekForDefects ? shortWeek(prevWeekForDefects) : '',
    avg4Yield: avgOf('yieldPct'),
    avg4Dppm: avgOf('dppm'),
    latestYieldOverall: latestTotalInsp
      ? ((latestTotalInsp - latestTotalFailed) / latestTotalInsp) * 100
      : 0,
    latestDppm: latestTotalInsp
      ? (latestTotalFailed / latestTotalInsp) * 1e6
      : 0,
    latestTotalInsp,
    trendLabels: trendWeeks.map((w) => {
      const m = String(w).match(/W(\d+)$/);
      return m ? `WW${m[1]}` : w;
    }),
    trendYieldSeries: trendWeeks.map(
      (w) => trendByWeek.get(w)?.yieldPct ?? null,
    ),
    trendDppmSeries: trendWeeks.map((w) => trendByWeek.get(w)?.dppm ?? null),
  };
}

/**
 * Computes computeCustomerReportData() for every customer against the SAME
 * shared week range (so every section's "current week" KPI reflects the
 * same reporting week, even though each customer's own trend chart may
 * span a different, sparser set of weeks depending on their own history).
 * Customers with zero matched data anywhere in range are dropped.
 *
 * @param {string[]} customers
 * @param {{from:string,to:string,weeks:string[]}} range
 * @param {MetricRow[]} allMetrics
 * @param {DefectRow[]} allDefectRows
 */
export function buildDigestData(customers, range, allMetrics, allDefectRows) {
  // A weekly digest keeps grouped customers (CASCO-1, CASCO-2) as separate
  // cards. A roll-up (monthly) digest merges the selected members of each
  // group into one combined card named after the group.
  const entries = range.rollup
    ? groupCustomers(customers).map(({ name, members }) => (
        members.length > 1
          ? { name, who: members }
          : { name: members[0], who: members[0] }
      ))
    : customers.map((c) => ({ name: c, who: c }));
  return entries
    .map(({ name, who }) => ({
      customer: name,
      data: computeCustomerReportData(who, range, allMetrics, allDefectRows),
    }))
    .filter((x) => x.data);
}

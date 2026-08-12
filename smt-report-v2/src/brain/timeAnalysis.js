// ============================================
// timeAnalysis.js — shift, day-of-week, hourly, and daily-trend breakdowns
// Everything here is a pure aggregation over DefectRow[]. No DOM, no canvas.
// ============================================

import { SHIFTS, DAYS_OF_WEEK } from './constants.js';
import { shiftForHour } from './datetime.js';

/**
 * Counts defects and distinct failed SN+Side per shift.
 * @param {DefectRow[]} rows
 */
export function shiftBreakdown(rows) {
  const counts = { Morning: 0, Afternoon: 0, Night: 0 };
  const failedSNs = { Morning: new Set(), Afternoon: new Set(), Night: new Set() };
  rows.forEach((d) => {
    counts[d.shift]++;
    failedSNs[d.shift].add(`${d.sn}|${d.side}`);
  });
  const total = rows.length;
  return SHIFTS.map((sh) => ({
    name: sh.name,
    label: sh.label,
    color: sh.color,
    count: counts[sh.name],
    pctOfTotal: total ? Math.round((counts[sh.name] / total) * 100) : 0,
    failedUnits: failedSNs[sh.name].size,
  }));
}

/** Defect count per day of week, in Sunday..Saturday order. */
export function dayOfWeekBreakdown(rows) {
  const counts = Array(7).fill(0);
  rows.forEach((d) => { counts[d.dow]++; });
  return DAYS_OF_WEEK.map((name, i) => ({ name, count: counts[i] }));
}

/** Defect count per hour of day (0-23), each tagged with its shift. */
export function hourlyBreakdown(rows) {
  const counts = Array(24).fill(0);
  rows.forEach((d) => { counts[d.hour]++; });
  const max = Math.max(...counts) || 1;
  return counts.map((count, hour) => ({
    hour,
    count,
    shift: shiftForHour(hour),
    intensity: 0.1 + (count / max) * 0.85, // 0.1..0.95, for heatmap opacity
  }));
}

const SHIFT_INSIGHTS = {
  Morning: 'Check machine warm-up, paste temp, operator handover.',
  Afternoon: 'Check changeover quality, material FIFO, operator fatigue.',
  Night: 'Check supervisor presence, machine stability, PM compliance.',
};

/** For each shift: its single most common defect type, count, and a canned insight. */
export function topDefectPerShift(rows) {
  const byShift = { Morning: {}, Afternoon: {}, Night: {} };
  rows.forEach((d) => { byShift[d.shift][d.defect] = (byShift[d.shift][d.defect] || 0) + 1; });
  const shiftTotals = shiftBreakdown(rows);

  return SHIFTS.map((sh) => {
    const entries = Object.entries(byShift[sh.name]).sort((a, b) => b[1] - a[1]);
    const total = shiftTotals.find((s) => s.name === sh.name)?.count || 0;
    if (!entries.length) {
      return { shift: sh.name, color: sh.color, topDefect: null, count: 0, pctOfShift: 0, insight: SHIFT_INSIGHTS[sh.name] };
    }
    const [topDefect, count] = entries[0];
    return {
      shift: sh.name,
      color: sh.color,
      topDefect,
      count,
      pctOfShift: total ? Math.round((count / total) * 100) : 0,
      insight: SHIFT_INSIGHTS[sh.name],
    };
  });
}

/** Distinct failed-unit count per calendar day, sorted chronologically. */
export function dailyFailedTrend(rows) {
  const byDate = {};
  rows.forEach((d) => {
    if (!byDate[d.dateStr]) byDate[d.dateStr] = new Set();
    byDate[d.dateStr].add(`${d.sn}|${d.side}`);
  });
  return Object.keys(byDate)
    .sort((a, b) => {
      const [ma, da, ya] = a.split('/');
      const [mb, db, yb] = b.split('/');
      return new Date(+ya, +ma - 1, +da) - new Date(+yb, +mb - 1, +db);
    })
    .map((dateStr) => ({ dateStr, failedUnits: byDate[dateStr].size }));
}

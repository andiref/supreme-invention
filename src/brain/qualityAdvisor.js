// ============================================
// qualityAdvisor.js — deterministic SMT quality advisor
// Pure functions: raw rows + CAPA history -> findings, risks, causes, actions.
// No DOM, fetch, or framework dependencies.
// ============================================

import { aggregateKpis, calcMetrics, weeklySummary } from './metrics.js';
import { YIELD_TARGET, DPPM_LIMIT, REPORT_MAX_WEEKS } from './constants.js';
import { findLibraryEntry } from './defectLibrary.js';

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function latestWeek(rows) {
  return rows.reduce((latest, row) => (!latest || row.week > latest ? row.week : latest), '');
}

function defectCounts(rows) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row.defect, (counts.get(row.defect) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function uniqueActions(items, limit = 6) {
  const seen = new Set();
  const out = [];
  items.flat().filter(Boolean).forEach((item) => {
    const key = norm(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out.slice(0, limit);
}

// Matches by defect name only, scoped to `customer` when one is selected.
// Without the customer scope, two different customers' chains sharing a
// defect name (e.g. "Insufficient Solder") would let one customer's CAPA
// notes — root cause, corrective action, PIC — surface under another
// customer's analysis, since CAPA chains are keyed by
// customer+defect+model+component (see capaLogic.js) but this lookup was
// only checking the defect segment of that key.
function matchingCapaRecords(capaRecords, defect, customer) {
  return Object.values(capaRecords || {})
    .filter(Boolean)
    .filter((r) => norm(r.defect) === norm(defect))
    .filter((r) => customer === 'ALL' || !customer || norm(r.customer) === norm(customer))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function percentDelta(current, baseline) {
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function summarizeTrend(rows, weeks) {
  const weekMap = new Map();
  weeks.forEach((week) => weekMap.set(week, 0));
  rows.forEach((row) => {
    if (weekMap.has(row.week)) weekMap.set(row.week, weekMap.get(row.week) + 1);
  });
  const series = weeks.map((week) => ({ week, count: weekMap.get(week) || 0 }));
  const current = series.at(-1)?.count || 0;
  const prior = series.slice(0, -1).map((x) => x.count);
  const baseline = prior.length ? prior.reduce((s, x) => s + x, 0) / prior.length : 0;
  const deltaPct = percentDelta(current, baseline);
  return { series, current, baseline, deltaPct, rising: deltaPct !== null && deltaPct >= 25, falling: deltaPct !== null && deltaPct <= -25 };
}

function findLibraryEntryLoose(defect) {
  const exact = findLibraryEntry(defect);
  if (exact) return exact;
  return findLibraryEntry(
    String(defect || '')
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase())
  ) || null;
}

/**
 * Analyze a chosen quality slice.
 * filters: { week?: string, customer?: string, model?: string }
 */
export function analyzeQualityData(defectRows, prodVolRows, capaRecords = {}, filters = {}) {
  const metrics = calcMetrics(defectRows, prodVolRows);
  const week = filters.week && filters.week !== 'ALL' ? filters.week : latestWeek(metrics);
  const customer = filters.customer || 'ALL';
  const model = filters.model || 'ALL';

  const scopedMetrics = metrics.filter((m) =>
    (!week || m.week === week) &&
    (customer === 'ALL' || m.customer === customer) &&
    (model === 'ALL' || m.model === model)
  );
  const scopedRows = defectRows.filter((d) =>
    (!week || d.week === week) &&
    (customer === 'ALL' || d.customer === customer) &&
    (model === 'ALL' || d.model === model)
  );

  const kpis = aggregateKpis(scopedMetrics);
  const availableWeeks = [...new Set(metrics
    .filter((m) => customer === 'ALL' || m.customer === customer)
    .filter((m) => model === 'ALL' || m.model === model)
    .map((m) => m.week))].sort();
  const trendWeeks = (week && availableWeeks.includes(week) ? availableWeeks.slice(0, availableWeeks.indexOf(week) + 1) : availableWeeks)
    .slice(-REPORT_MAX_WEEKS);
  const trendMetrics = metrics.filter((m) =>
    trendWeeks.includes(m.week) &&
    (customer === 'ALL' || m.customer === customer) &&
    (model === 'ALL' || m.model === model)
  );
  const weekly = weeklySummary(trendMetrics);

  const latestRowsForTrend = defectRows.filter((d) =>
    trendWeeks.includes(d.week) &&
    (customer === 'ALL' || d.customer === customer) &&
    (model === 'ALL' || d.model === model)
  );
  const topDefects = defectCounts(scopedRows).slice(0, 5).map(([defect, count], index) => {
    const trend = summarizeTrend(latestRowsForTrend.filter((d) => d.defect === defect), trendWeeks);
    const library = findLibraryEntryLoose(defect);
    const capa = matchingCapaRecords(capaRecords, defect, customer);
    const activeCapa = capa.find((r) => (r.monitoring || 'Open') !== 'Closed') || capa[0] || null;
    const sharePct = scopedRows.length ? (count / scopedRows.length) * 100 : 0;
    const risk = count >= 20 || sharePct >= 25 || trend.rising ? 'HIGH' : count >= 8 || sharePct >= 10 ? 'MEDIUM' : 'LOW';
    return {
      rank: index + 1,
      defect,
      count,
      sharePct,
      risk,
      trend,
      library,
      capa: activeCapa,
      category: library?.cat || 'Unclassified',
      causes: library?.causes || [],
      actions: library?.actions || [],
      prevention: library?.prev || '',
    };
  });

  const risks = [];
  if (kpis.totalInsp === 0) risks.push({ level: 'HIGH', title: 'No matched production volume', detail: 'The selected slice has no joined production volume, so yield and DPPM cannot be trusted yet.' });
  else {
    if (kpis.yieldOverall < YIELD_TARGET) risks.push({ level: kpis.yieldOverall < YIELD_TARGET - 1 ? 'HIGH' : 'MEDIUM', title: 'Yield below target', detail: `${kpis.yieldOverall.toFixed(2)}% vs ${YIELD_TARGET}% target.` });
    if (kpis.dppm > DPPM_LIMIT) risks.push({ level: kpis.dppm > DPPM_LIMIT * 2 ? 'HIGH' : 'MEDIUM', title: 'DPPM above limit', detail: `${Math.round(kpis.dppm).toLocaleString()} vs ${DPPM_LIMIT.toLocaleString()} limit.` });
  }
  topDefects.filter((d) => d.risk === 'HIGH').slice(0, 3).forEach((d) => risks.push({ level: 'HIGH', title: `${d.defect} is a priority defect`, detail: `${d.count} occurrences (${d.sharePct.toFixed(1)}% of defects)${d.trend.rising ? ', with an increasing trend' : ''}.` }));
  topDefects.filter((d) => d.trend.rising && d.risk !== 'HIGH').slice(0, 2).forEach((d) => risks.push({ level: 'MEDIUM', title: `${d.defect} is trending up`, detail: `Current ${d.trend.current} vs ${d.trend.baseline.toFixed(1)} average across prior weeks.` }));

  const recommendations = uniqueActions([
    topDefects.slice(0, 3).flatMap((d) => d.actions.slice(0, 2)),
    topDefects.slice(0, 3).filter((d) => d.trend.rising).map((d) => `Investigate ${d.defect} trend by model, component reference, side, and shift.`),
    topDefects.slice(0, 3).filter((d) => d.capa && (d.capa.monitoring || 'Open') !== 'Effective' && (d.capa.monitoring || 'Open') !== 'Closed').map((d) => `Review open CAPA for ${d.defect} before creating another action.`),
    kpis.yieldOverall < YIELD_TARGET ? 'Review the Pareto first; focus containment on the highest contributor before broad process changes.' : [],
  ], 8);

  const primary = topDefects[0] || null;
  let headline = 'No material quality issue detected in the selected slice.';
  if (kpis.totalInsp === 0) headline = 'No matched production volume is available for this selection.';
  else if (primary && primary.risk === 'HIGH') headline = `${primary.defect} is the primary quality driver for ${week || 'the selected period'}.`;
  else if (kpis.yieldOverall < YIELD_TARGET) headline = `Yield is below target for ${week || 'the selected period'}, led by ${primary?.defect || 'multiple defects'}.`;
  else headline = `Quality is within target for ${week || 'the selected period'}, with ${primary?.defect || 'no dominant defect'} as the largest defect contributor.`;

  const status = kpis.totalInsp === 0 ? 'NO DATA' : risks.some((r) => r.level === 'HIGH') ? 'ACTION REQUIRED' : risks.length ? 'MONITOR' : 'STABLE';
  return {
    filters: { week: week || 'ALL', customer, model },
    kpis,
    status,
    headline,
    weeks: trendWeeks,
    weekly,
    topDefects,
    risks: risks.slice(0, 6),
    recommendations,
    primaryDefect: primary,
    generatedAt: new Date().toISOString(),
  };
}

export function answerQualityQuestion(question, analysis) {
  const q = norm(question);
  if (!analysis) return 'Run an analysis first.';
  if (q.includes('why') && (q.includes('yield') || q.includes('drop'))) return analysis.kpis.totalInsp ? analysis.headline + (analysis.primaryDefect ? ` The strongest contributor is ${analysis.primaryDefect.defect} at ${analysis.primaryDefect.count} occurrences.` : '') : analysis.headline;
  if (q.includes('top') || q.includes('main defect') || q.includes('biggest')) {
    return analysis.topDefects.length ? analysis.topDefects.slice(0, 3).map((d) => `#${d.rank} ${d.defect}: ${d.count} (${d.sharePct.toFixed(1)}%)`).join(' • ') : 'No defects in the selected slice.';
  }
  if (q.includes('check') || q.includes('investigate') || q.includes('action') || q.includes('recommend')) return analysis.recommendations.length ? analysis.recommendations.map((x, i) => `${i + 1}. ${x}`).join('\n') : 'No specific action is recommended from the current data.';
  if (q.includes('capa')) {
    const active = analysis.topDefects.filter((d) => d.capa).map((d) => `${d.defect}: ${(d.capa.monitoring || 'Open')}${d.capa.correctiveAction ? ` — ${d.capa.correctiveAction}` : ''}`);
    return active.length ? active.join('\n') : 'No matching CAPA history found for the leading defects.';
  }
  return analysis.headline + '\n\nAsk about yield, top defects, investigation checks, actions, or CAPA.';
}

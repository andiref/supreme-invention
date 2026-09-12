/**
 * Pure chart-math helpers for TrendLineChart.jsx, kept in a plain .js file
 * (not .jsx) so they're importable from a plain Node test script and
 * covered by check-syntax.mjs — which only walks .js/.mjs files, never
 * .jsx. See test-trend-chart.mjs.
 */

/**
 * Computes a "zoomed" y-axis domain around the actual data (+ target line),
 * instead of always including 0. A yield% series that hovers at 99.5–99.9%
 * looks like a flat line against a 0–100 axis — this zooms in so real
 * week-to-week movement is actually visible, while still guaranteeing the
 * target reference line stays in view.
 *
 * Filters out anything that isn't a finite number (not just null/undefined)
 * before computing min/max — a stray NaN or non-numeric value here used to
 * propagate into a NaN domain, which Recharts' own bundled internals could
 * then crash on with an opaque "Cannot read properties of undefined
 * (reading 'value')" far from anything in this file.
 */
export function computeZoomedDomain(series, target, { padFraction = 0.15, minPad = 0.5, minValue = null, maxValue = null } = {}) {
  const values = (Array.isArray(series) ? series : [])
    .flatMap((s) => (Array.isArray(s?.values) ? s.values : []))
    .filter((v) => Number.isFinite(v));
  const safeTarget = Number.isFinite(target) ? target : null;
  if (!values.length) return ['auto', 'auto'];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (safeTarget != null) {
    min = Math.min(min, safeTarget);
    max = Math.max(max, safeTarget);
  }
  const range = max - min;
  const pad = Math.max(range * padFraction, minPad);
  let domainMin = min - pad;
  let domainMax = max + pad;
  // A logical bound (e.g. 100 for a percentage) caps the padded domain, not
  // just the data — padding a 99.9% max by minPad alone already overshoots
  // 100, which then shows up as an impossible ">100%" tick label.
  if (Number.isFinite(maxValue)) domainMax = Math.min(domainMax, maxValue);
  if (Number.isFinite(minValue)) domainMin = Math.max(domainMin, minValue);
  return [domainMin, domainMax];
}

// Compact-formats large tick values (e.g. 140454 -> "140.5K") so wide series
// like DPPM stay readable, and keeps small/decimal series (e.g. yield %)
// exactly as-is. Falls back to the raw value for anything not comfortably
// expressed as an integer + suffix, e.g. small percentages.
export function formatTick(v) {
  if (typeof v !== 'number') return v;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return String(v);
}

// Recharts' own "nice tick" generator can misbehave when handed a fully
// explicit, narrow, non-round domain (e.g. the zoomed-in yield% domain from
// computeZoomedDomain) — it can emit garbled multi-million-looking tick
// labels even though the plotted line/dots are positioned correctly. When
// both domain endpoints are real numbers (not 'auto'), we sidestep that by
// generating our own small set of evenly-spaced, sensibly-rounded ticks.
export function computeLinearTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return undefined;
  const range = max - min;
  const decimals = range < 10 ? 1 : 0;
  const scale = 10 ** decimals;
  const step = range / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round((min + step * i) * scale) / scale);
}

// The Y-axis label column needs to be exactly as wide as its longest tick
// text, or long labels get clipped by the chart's left edge (this is what
// caused DPPM-scale numbers to render with their leading digit sliced off —
// margin.left used to be a fixed -8, tuned for short 2-4 char labels like a
// yield percentage, which broke as soon as a series needed wider ticks).
export function estimateAxisWidth(series, valueSuffix) {
  const values = (Array.isArray(series) ? series : [])
    .flatMap((s) => (Array.isArray(s?.values) ? s.values : []))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return 40;
  const longest = Math.max(...values.map((v) => String(formatTick(v)).length));
  return Math.min(60, Math.max(32, 14 + (longest + valueSuffix.length) * 6));
}

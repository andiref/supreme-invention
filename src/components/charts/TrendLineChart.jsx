import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';

/**
 * Computes a "zoomed" y-axis domain around the actual data (+ target line),
 * instead of always including 0. A yield% series that hovers at 99.5–99.9%
 * looks like a flat line against a 0–100 axis — this zooms in so real
 * week-to-week movement is actually visible, while still guaranteeing the
 * target reference line stays in view.
 */
export function computeZoomedDomain(series, target, { padFraction = 0.15, minPad = 0.5 } = {}) {
  const values = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!values.length) return ['auto', 'auto'];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (target != null) {
    min = Math.min(min, target);
    max = Math.max(max, target);
  }
  const range = max - min;
  const pad = Math.max(range * padFraction, minPad);
  return [min - pad, max + pad];
}

// Compact-formats large tick values (e.g. 140454 -> "140.5K") so wide series
// like DPPM stay readable, and keeps small/decimal series (e.g. yield %)
// exactly as-is. Falls back to the raw value for anything not comfortably
// expressed as an integer + suffix, e.g. small percentages.
function formatTick(v) {
  if (typeof v !== 'number') return v;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return String(v);
}

// The Y-axis label column needs to be exactly as wide as its longest tick
// text, or long labels get clipped by the chart's left edge (this is what
// caused DPPM-scale numbers to render with their leading digit sliced off —
// margin.left used to be a fixed -8, tuned for short 2-4 char labels like a
// yield percentage, which broke as soon as a series needed wider ticks).
function estimateAxisWidth(series, valueSuffix) {
  const values = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!values.length) return 40;
  const longest = Math.max(...values.map((v) => formatTick(v).length));
  return Math.min(60, Math.max(32, 14 + (longest + valueSuffix.length) * 6));
}

/**
 * @param {string[]} labels           x-axis labels (e.g. week labels)
 * @param {{name:string,color:string,values:(number|null)[]}[]} series
 * @param {number} [target]           optional horizontal reference line (yield target or DPPM limit)
 * @param {string} [valueSuffix]      e.g. '%'
 * @param {[number|string,number|string]} [domain]  y-axis domain — defaults to recharts' auto (0-based)
 */
export default function TrendLineChart({ labels, series, target, valueSuffix = '', height = 220, domain = ['auto', 'auto'] }) {
  const data = labels.map((label, i) => {
    const row = { label };
    series.forEach((s) => { row[s.name] = s.values[i]; });
    return row;
  });
  const axisWidth = estimateAxisWidth(series, valueSuffix);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--yc-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="var(--yc-muted)" fontSize={10} tickLine={false} />
        <YAxis
          stroke="var(--yc-muted)"
          fontSize={10}
          tickLine={false}
          width={axisWidth}
          domain={domain}
          allowDecimals
          tickFormatter={(v) => `${formatTick(v)}${valueSuffix}`}
        />
        <Tooltip
          contentStyle={{ background: 'var(--yc-surface)', border: '1px solid var(--yc-border)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#3b82f6' }}
          formatter={(v) => (v == null ? '—' : `${typeof v === 'number' ? v.toFixed(2) : v}${valueSuffix}`)}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {target != null && (
          <ReferenceLine y={target} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Target', fontSize: 9, fill: '#f59e0b', position: 'right' }} />
        )}
        {series.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3, fill: s.color }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

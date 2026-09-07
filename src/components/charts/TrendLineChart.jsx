import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import {
  computeZoomedDomain, formatTick, computeLinearTicks, estimateAxisWidth,
} from './trendChartUtils.js';

export { computeZoomedDomain };

/**
 * @param {string[]} labels           x-axis labels (e.g. week labels)
 * @param {{name:string,color:string,values:(number|null)[]}[]} series
 * @param {number} [target]           optional horizontal reference line (yield target or DPPM limit)
 * @param {string} [valueSuffix]      e.g. '%'
 * @param {[number|string,number|string]} [domain]  y-axis domain — defaults to recharts' auto (0-based)
 */
export default function TrendLineChart({ labels: rawLabels, series: rawSeries, target, valueSuffix = '', height = 220, domain = ['auto', 'auto'] }) {
  // Recharts' internal geometry/tick/legend math assumes every data value is
  // a finite number or an explicit null — a malformed upstream row (a
  // legacy record with a missing field, a mismatched labels/values length)
  // can otherwise hand it undefined/NaN and crash deep inside its own
  // bundled code with an opaque "Cannot read properties of undefined
  // (reading 'value')", far from anything in this file. Sanitizing at this
  // boundary means a bad row degrades to a gap in the line instead.
  const labels = (Array.isArray(rawLabels) ? rawLabels : []).map((l) => (l == null ? '' : String(l)));
  const series = (Array.isArray(rawSeries) ? rawSeries : []).map((s) => ({
    ...s,
    values: Array.isArray(s.values) ? s.values : [],
  }));
  const safeTarget = Number.isFinite(target) ? target : null;

  const data = labels.map((label, i) => {
    const row = { label };
    series.forEach((s) => {
      const v = s.values[i];
      row[s.name] = Number.isFinite(v) ? v : null;
    });
    return row;
  });
  const axisWidth = estimateAxisWidth(series, valueSuffix);
  const customTicks = typeof domain[0] === 'number' && typeof domain[1] === 'number'
    ? computeLinearTicks(domain[0], domain[1])
    : undefined;

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
          ticks={customTicks}
          allowDecimals
          tickFormatter={(v) => `${formatTick(v)}${valueSuffix}`}
        />
        <Tooltip
          contentStyle={{ background: 'var(--yc-surface)', border: '1px solid var(--yc-border)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#3b82f6' }}
          formatter={(v) => (v == null ? '—' : `${typeof v === 'number' ? v.toFixed(2) : v}${valueSuffix}`)}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {safeTarget != null && (
          <ReferenceLine y={safeTarget} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Target', fontSize: 9, fill: '#f59e0b', position: 'right' }} />
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

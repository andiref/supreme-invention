import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';

/**
 * @param {string[]} labels           x-axis labels (e.g. week labels)
 * @param {{name:string,color:string,values:(number|null)[]}[]} series
 * @param {number} [target]           optional horizontal reference line (yield target or DPPM limit)
 * @param {string} [valueSuffix]      e.g. '%'
 */
export default function TrendLineChart({ labels, series, target, valueSuffix = '', height = 220 }) {
  const data = labels.map((label, i) => {
    const row = { label };
    series.forEach((s) => { row[s.name] = s.values[i]; });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--yc-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="var(--yc-muted)" fontSize={10} tickLine={false} />
        <YAxis stroke="var(--yc-muted)" fontSize={10} tickLine={false} width={48} />
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

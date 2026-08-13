import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

/**
 * @param {{name:string,value:number,color?:string}[]} data
 */
export default function SimpleBarChart({ data, height = 200, defaultColor = '#3b82f6', horizontal = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, left: horizontal ? 8 : -8, bottom: 0 }}
      >
        <CartesianGrid stroke="var(--yc-border)" strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" stroke="var(--yc-muted)" fontSize={10} tickLine={false} />
            <YAxis type="category" dataKey="name" stroke="var(--yc-muted)" fontSize={10} tickLine={false} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" stroke="var(--yc-muted)" fontSize={10} tickLine={false} interval={0} angle={-25} textAnchor="end" height={50} />
            <YAxis stroke="var(--yc-muted)" fontSize={10} tickLine={false} width={38} />
          </>
        )}
        <Tooltip
          contentStyle={{ background: 'var(--yc-surface)', border: '1px solid var(--yc-border)', borderRadius: 6, fontSize: 11 }}
          cursor={{ fill: '#1e293b55' }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color || defaultColor} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

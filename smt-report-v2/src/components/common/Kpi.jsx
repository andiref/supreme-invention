export function KpiRow({ kpis }) {
  if (!kpis.length) {
    return <div style={{ fontSize: 11, color: '#64748b', padding: '8px 2px' }}>No matched Week+Customer+Model data yet — see note above.</div>;
  }
  return (
    <div className="kpi-row">
      {kpis.map((k) => (
        <div key={k.label} className="kpi" style={{ background: `${k.color}12`, border: `1px solid ${k.color}50` }}>
          <div className="kpi-n" style={{ color: k.color }}>{k.value}</div>
          <div className="kpi-l">{k.label}</div>
          <div className="kpi-s">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && <div className="ct">{title}</div>}
      {children}
    </div>
  );
}

export default function FilterField({ label, value, onChange, options, width }) {
  return (
    <div className="fl" style={width ? { flex: 'none', width } : undefined}>
      <div className="fl-lbl">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  );
}

/** @param {{hour:number,count:number,shift:string,intensity:number}[]} hourly */
export default function HourlyHeatmap({ hourly }) {
  const shiftColor = { Morning: '#3b82f6', Afternoon: '#f59e0b', Night: '#a78bfa' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
      {hourly.map((h) => (
        <div
          key={h.hour}
          title={`${String(h.hour).padStart(2, '0')}:00 — ${h.count} defects (${h.shift})`}
          style={{
            aspectRatio: '1',
            borderRadius: 4,
            background: `${shiftColor[h.shift]}${Math.round(h.intensity * 255).toString(16).padStart(2, '0')}`,
            border: `1px solid ${shiftColor[h.shift]}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#e2e8f0', fontWeight: 700,
          }}
        >
          {h.hour}
        </div>
      ))}
    </div>
  );
}

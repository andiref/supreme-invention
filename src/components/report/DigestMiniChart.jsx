// Full-size trend chart for the weekly digest — a solid data line, a dashed
// target/limit reference line, three gridlines (min/mid/max) with axis
// labels, the line's most recent value called out in bold, and a 3-column
// stat row underneath (this week / last week / rolling average). The
// target/limit itself isn't repeated in the stat row — it's already shown
// by the dashed reference line and its legend entry above. Kept
// deliberately separate from the full app's Recharts-based TrendLineChart
// — this one exists purely to match the printable digest's fixed light
// "email document" look, independent of the app's own theme.
import { fmtInt } from '../../brain/index.js';

const VBW = 640;
const VBH = 190;
const PL = 54;
const PR = 16;
const PT = 14;
const PB = 26;
const PW = VBW - PL - PR;
const PH = VBH - PT - PB;

function IconTrendingUp({ size = 15, color = '#14304d' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 17l6-6 4 4 8-9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBarChart({ size = 15, color = '#14304d' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 20V10M12 20V4M20 20v-7" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

function ChartHeader({
  title, metricLabel, targetColor, targetLegendLabel, isYield,
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
    }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 800, color: '#102a56',
      }}
      >
        {isYield ? <IconTrendingUp /> : <IconBarChart />}
        {title}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, fontWeight: 600, color: '#555555', whiteSpace: 'nowrap',
      }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="8" style={{ display: 'block', flexShrink: 0 }}>
            <line x1="0" y1="4" x2="16" y2="4" stroke="#2f6fed" strokeWidth="2" />
          </svg>
          {metricLabel}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="8" style={{ display: 'block', flexShrink: 0 }}>
            <line x1="0" y1="4" x2="16" y2="4" stroke={targetColor} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          {targetLegendLabel}
        </span>
      </div>
    </div>
  );
}

function StatRow({ stats }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#eef1fb', borderRadius: 8, marginTop: 8, padding: '9px 6px',
    }}
    >
      {stats.map(({ label, value, good }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#8892a6' }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: good ? '#16a34a' : '#14304d', marginTop: 2 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {number[]} values      one entry per label; null/undefined = no data that week
 * @param {string[]} labels
 * @param {number} target        target (yield) or limit (DPPM) reference value
 * @param {boolean} isYield      yield caps its axis at 100% and floors ~0.3pp below the min
 *                               (or the target, whichever is lower); DPPM floors at 0 and
 *                               tops out at 1.15x the highest value (or the limit)
 */
export default function DigestMiniChart({
  title, values, labels, target, targetColor, isYield, metricLabel, targetLegendLabel,
}) {
  const have = values.map((v, i) => ({ v, i })).filter(({ v }) => v != null);
  const boxStyle = {
    border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, background: '#ffffff', padding: '12px 14px 10px',
  };
  const fmtVal = (v) => (isYield ? `${v.toFixed(2)}%` : fmtInt(v));

  if (!have.length) {
    return (
      <div style={boxStyle}>
        <ChartHeader title={title} metricLabel={metricLabel} targetColor={targetColor} targetLegendLabel={targetLegendLabel} isYield={isYield} />
        <div style={{
          height: VBH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999999',
        }}
        >
          No data
        </div>
      </div>
    );
  }

  const rawValues = have.map(({ v }) => v);
  const maxV = isYield ? 100 : Math.max(...rawValues, target || 0) * 1.15;
  const minV = isYield ? Math.min(...rawValues, target) - 0.3 : 0;
  const span = maxV - minV || 1;

  const xp = (i) => PL + (labels.length < 2 ? PW / 2 : (i / (labels.length - 1)) * PW);
  const yp = (v) => PT + PH - ((v - minV) / span) * PH;

  const linePoints = have.map(({ v, i }) => `${xp(i)},${yp(v).toFixed(1)}`).join(' ');
  const lastPoint = have[have.length - 1];
  const showEvery = labels.length > 6 ? 2 : 1;
  const targetVisible = target >= minV && target <= maxV;
  const gridTicks = [minV, (minV + maxV) / 2, maxV];

  // 3-column stat row: this week, last week, and the rolling average of the
  // last (up to) 4 charted weeks. The target/limit lives in the chart's
  // dashed line + legend, not repeated here.
  const curr = rawValues[rawValues.length - 1];
  const prev = rawValues.length > 1 ? rawValues[rawValues.length - 2] : null;
  const last4 = rawValues.slice(-4);
  const avg = last4.reduce((s, v) => s + v, 0) / last4.length;
  const currLabel = labels[have[have.length - 1].i];
  const prevLabel = have.length > 1 ? labels[have[have.length - 2].i] : '\u2014';

  return (
    <div style={boxStyle}>
      <ChartHeader title={title} metricLabel={metricLabel} targetColor={targetColor} targetLegendLabel={targetLegendLabel} isYield={isYield} />
      <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ width: '100%', height: VBH, display: 'block' }}>
        {gridTicks.map((v) => {
          const gy = yp(v);
          return (
            <g key={v}>
              <line x1={PL} y1={gy} x2={PL + PW} y2={gy} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />
              <text x={PL - 8} y={gy + 3} fontSize={10} fill="#8892a6" textAnchor="end">{fmtVal(v)}</text>
            </g>
          );
        })}

        {targetVisible && (
          <line x1={PL} y1={yp(target)} x2={PL + PW} y2={yp(target)} stroke={targetColor} strokeWidth={1.5} strokeDasharray="6 4" />
        )}

        <polyline points={linePoints} fill="none" stroke="#2f6fed" strokeWidth={2.4} />
        {have.map(({ v, i }) => <circle key={i} cx={xp(i)} cy={yp(v)} r={3.2} fill="#2f6fed" />)}

        {(() => {
          const dotX = xp(lastPoint.i);
          const dotY = yp(lastPoint.v);
          // Flip the label below the dot if "above" would push its glyphs
          // above y=0 and get clipped by the SVG (e.g. a near-100% yield
          // week sitting right at the top of the chart).
          const labelAbove = dotY - 10 > PT + 8;
          return (
            <text
              x={dotX}
              y={labelAbove ? dotY - 10 : dotY + 18}
              fontSize={13}
              fontWeight={700}
              fill="#14304d"
              textAnchor={lastPoint.i === labels.length - 1 ? 'end' : 'middle'}
            >
              {fmtVal(lastPoint.v)}
            </text>
          );
        })()}

        {labels.map((l, i) => {
          if (i % showEvery !== 0 && i !== labels.length - 1) return null;
          const anchor = i === 0 && labels.length > 1 ? 'start' : (i === labels.length - 1 && labels.length > 1 ? 'end' : 'middle');
          return <text key={l} x={xp(i)} y={PT + PH + 18} fontSize={10} fill="#8892a6" textAnchor={anchor}>{l}</text>;
        })}
      </svg>
      <StatRow stats={[
        { label: currLabel, value: fmtVal(curr), good: true },
        { label: prevLabel, value: prev != null ? fmtVal(prev) : '\u2014', good: false },
        { label: '4-WK AVG', value: fmtVal(avg), good: false },
      ]}
      />
    </div>
  );
}

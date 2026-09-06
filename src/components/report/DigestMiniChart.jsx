// SVG port of the old vanilla-JS canvas digest's drawDigestMiniChart(): a
// compact trend chart with only a top/bottom axis label (not a full grid),
// a dashed target/limit line, the line labeled with its most recent value,
// and a title + legend row above it. Kept deliberately separate from the
// full-size Recharts-based TrendLineChart used elsewhere in the app — this
// one exists purely to match the old digest's exact printable look.

const VBW = 500; // reference viewBox width — the <svg> stretches to fill
const VBH = 96; // whatever width its column ends up at, height stays fixed
const PL = 40;
const PR = 6;
const PT = 10;
const PB = 16;
const PW = VBW - PL - PR;
const PH = VBH - PT - PB;

function ChartHeader({ title, metricLabel, targetColor, targetText }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#333333' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 8, fontWeight: 700, color: '#333333', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <svg width="16" height="7" style={{ display: 'block', flexShrink: 0 }}>
            <line x1="0" y1="3.5" x2="12" y2="3.5" stroke="#000000" strokeWidth="1.4" />
            <circle cx="14" cy="3.5" r="1.7" fill="#000000" />
          </svg>
          {metricLabel}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <svg width="14" height="7" style={{ display: 'block', flexShrink: 0 }}>
            <line x1="0" y1="3.5" x2="14" y2="3.5" stroke={targetColor} strokeWidth="1.3" strokeDasharray="3 2" />
          </svg>
          {targetText}
        </span>
      </div>
    </div>
  );
}

/**
 * @param {number[]} values     one entry per label; null/undefined = no data that week
 * @param {string[]} labels
 * @param {number} target       target (yield) or limit (DPPM) value
 * @param {boolean} isYield     yield caps its axis at 100% and floors at ~0.3% below the min;
 *                              DPPM floors at 0 and tops out at 1.1x the highest value
 */
export default function DigestMiniChart({
  title, values, labels, target, targetColor, isYield, metricLabel, targetText,
}) {
  const have = values.map((v, i) => ({ v, i })).filter(({ v }) => v != null);
  const boxStyle = {
    border: '1px solid rgba(0,0,0,0.15)', borderRadius: 5, background: 'rgba(0,0,0,0.03)', padding: '6px 8px 4px',
  };

  if (!have.length) {
    return (
      <div style={boxStyle}>
        <ChartHeader title={title} metricLabel={metricLabel} targetColor={targetColor} targetText={targetText} />
        <div style={{ height: VBH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#999999' }}>No data</div>
      </div>
    );
  }

  const rawValues = have.map(({ v }) => v);
  const allV = [...rawValues, target || 0];
  const maxV = isYield ? 100 : Math.max(...allV) * 1.1;
  const minV = Math.min(...allV) * (isYield ? 0.997 : 0);
  const span = maxV - minV || 1;

  const xp = (i) => PL + (labels.length < 2 ? PW / 2 : (i / (labels.length - 1)) * PW);
  const yp = (v) => PT + PH - ((v - minV) / span) * PH;
  const fmtVal = (v) => (isYield ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString());

  const linePoints = have.map(({ v, i }) => `${xp(i)},${yp(v)}`).join(' ');
  const lastPoint = have[have.length - 1];
  const showEvery = labels.length > 6 ? Math.ceil(labels.length / 6) : 1;
  const targetVisible = target >= minV && target <= maxV;

  return (
    <div style={boxStyle}>
      <ChartHeader title={title} metricLabel={metricLabel} targetColor={targetColor} targetText={targetText} />
      <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ width: '100%', height: VBH, display: 'block' }}>
        {[0, 1].map((i) => {
          const gy = PT + PH * (1 - i);
          const v = minV + span * i;
          return (
            <g key={i}>
              <line x1={PL} y1={gy} x2={PL + PW} y2={gy} stroke="rgba(0,0,0,0.12)" strokeWidth={0.6} />
              <text x={PL - 4} y={gy + 3} fontSize={7} fill="#666666" textAnchor="end">{fmtVal(v)}</text>
            </g>
          );
        })}

        {targetVisible && (
          <line x1={PL} y1={yp(target)} x2={PL + PW} y2={yp(target)} stroke={targetColor} strokeWidth={1} strokeDasharray="4 3" />
        )}

        <polyline points={linePoints} fill="none" stroke="#000000" strokeWidth={1.6} />
        {have.map(({ v, i }) => <circle key={i} cx={xp(i)} cy={yp(v)} r={2.3} fill="#000000" />)}

        {lastPoint && (() => {
          const dotY = yp(lastPoint.v);
          // Normally the label sits just above the dot. But if the dot is
          // close to the top of the chart (a near-100% yield week, say),
          // "above" pushes the label's own text glyphs above y=0 and the
          // SVG clips them — cutting the tops off digits (a "9" reads as a
          // "3", a "7" reads as a "1"). Flip it below the dot instead.
          const labelY = dotY - 6 < 10 ? dotY + 13 : dotY - 6;
          return (
            <text
              x={xp(lastPoint.i)}
              y={labelY}
              fontSize={9}
              fontWeight={700}
              fill="#000000"
              textAnchor={lastPoint.i === labels.length - 1 ? 'end' : 'middle'}
            >
              {fmtVal(lastPoint.v)}
            </text>
          );
        })()}

        {labels.map((l, i) => {
          if (i % showEvery !== 0 && i !== labels.length - 1) return null;
          // Middle-anchor interior labels, but anchor the first/last labels
          // to the inside edge so their text never spills past the chart
          // boundary and gets clipped.
          const anchor = i === 0 && labels.length > 1 ? 'start' : (i === labels.length - 1 && labels.length > 1 ? 'end' : 'middle');
          return <text key={i} x={xp(i)} y={PT + PH + 11} fontSize={7} fill="#666666" textAnchor={anchor}>{l}</text>;
        })}
      </svg>
    </div>
  );
}

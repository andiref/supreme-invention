import DigestMiniChart from './DigestMiniChart.jsx';
import {
  YIELD_TARGET, DPPM_LIMIT, fmtInt, computeQualityStatus, DEFECT_RANK_META,
} from '../../brain/index.js';

const STATUS_COLORS = {
  HEALTHY: { text: '#16a34a', bg: '#eefcf3' },
  WARNING: { text: '#c2650c', bg: '#fdf3e6' },
  CRITICAL: { text: '#dc2626', bg: '#fde8e8' },
  'NO DATA': { text: '#666666', bg: '#f2f2f2' },
};

const PILL_TONES = {
  green: { bg: '#eefcf3', color: '#16a34a' },
  red: { bg: '#fde8e8', color: '#dc2626' },
  orange: { bg: '#fdecd2', color: '#c2650c' },
  amber: { bg: '#fbeec2', color: '#946800' },
};

function Pill({ text, tone }) {
  const t = PILL_TONES[tone] || PILL_TONES.green;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: t.bg, color: t.color, whiteSpace: 'nowrap',
    }}
    >
      {text}
    </span>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS['NO DATA'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: c.text,
    }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: c.text, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        <span style={{ color: '#ffffff', fontSize: 11, lineHeight: 1 }}>{status === 'HEALTHY' ? '\u2713' : '!'}</span>
      </span>
      QUALITY STATUS: {status}
    </span>
  );
}

function KpiBlock({
  label, value, valueColor, badgeText, badgeTone, deltaValue, deltaGood, deltaText, footerText,
}) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 800, color: '#71819b', letterSpacing: 0.4, marginBottom: 7,
      }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{
          fontSize: 32, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.6px', color: valueColor,
        }}
        >
          {value}
        </div>
        <Pill text={badgeText} tone={badgeTone} />
      </div>
      {deltaValue != null && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: deltaGood ? '#16a34a' : '#dc2626', marginTop: 7,
        }}
        >
          {deltaValue >= 0 ? '\u25b2' : '\u25bc'} {deltaText}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#71819b', marginTop: 5 }}>{footerText}</div>
    </div>
  );
}

function DefectRow({
  rank, defect, count, model, comp, trend,
}) {
  const meta = DEFECT_RANK_META[rank - 1] || DEFECT_RANK_META[DEFECT_RANK_META.length - 1];
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 0', borderTop: rank === 1 ? 'none' : '1px solid #e7edf5',
    }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: meta.barColor, color: '#ffffff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
      }}
      >
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6,
        }}
        >
          <div style={{
            fontSize: 15, fontWeight: 800, color: '#102a56', letterSpacing: '-0.1px',
          }}
          >
            {defect}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#102a56' }}>{count}</div>
        </div>
        <div style={{ fontSize: 11, color: '#71819b', marginTop: 6, lineHeight: 1.55 }}>
          Top Contributing Model<br /><b style={{ color: '#243b63', fontSize: 12 }}>{model}</b><br />
          Top Contributing Component<br /><b style={{ color: '#243b63', fontSize: 12 }}>{comp}</b>
        </div>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0,
      }}
      >
        {trend === 'rising' && <Pill text="RISING" tone="red" />}
        <Pill text={meta.label} tone={meta.tone} />
      </div>
    </div>
  );
}

/**
 * One line/customer's card in the printable weekly digest — a fixed
 * light/white "email document" palette (not the app's dark/light theme
 * toggle), a bordered card with a colored left accent and a full-width
 * quality-status header, followed by three columns: headline KPIs,
 * top-3 defects (rank badges + RISING/severity tags), and the two full
 * yield/DPPM trend charts with their stat rows.
 *
 * @param {string} customer
 * @param {object} data       result of computeCustomerReportData()
 * @param {string} color      accent color for the card's left bar
 * @param {string} weekBadge  the digest's reference week (range.to) — shown
 *                            under every customer's name, same for all of
 *                            them (not each customer's own latest week)
 * @param {boolean} [first=false]  first card gets no top margin
 */
export default function DigestCard({
  customer, data, color, weekBadge, first = false,
}) {
  const hasCurrentData = data.latestTotalInsp > 0;
  const { status, notes } = computeQualityStatus(data);

  const ys = data.trendYieldSeries;
  const prevYield = ys.length > 1 ? ys[ys.length - 2] : null;
  const yieldDelta = hasCurrentData && prevYield != null ? data.latestYieldOverall - prevYield : null;

  const ds = data.trendDppmSeries;
  const prevDppm = ds.length > 1 ? ds[ds.length - 2] : null;
  const dppmDelta = hasCurrentData && prevDppm != null ? data.latestDppm - prevDppm : null;

  const prevWeekLabel = data.trendLabels.length > 1 ? data.trendLabels[data.trendLabels.length - 2] : '';
  const yieldAboveTarget = hasCurrentData && data.latestYieldOverall >= YIELD_TARGET;
  const dppmWithinLimit = hasCurrentData && data.latestDppm <= DPPM_LIMIT;

  return (
    <div style={{
      marginTop: first ? 18 : 18, border: '1px solid #dbe3ef', borderRadius: 12, overflow: 'hidden', background: '#ffffff',
    }}
    >
      <div style={{ display: 'flex' }}>
        <div style={{ width: 5, background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: '20px 24px 22px' }}>

          {/* header: identity + quality status */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.1)',
          }}
          >
            <div>
              <div style={{
                fontSize: 22, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.3px', color: '#102a56',
              }}
              >
                {customer}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#71819b', marginTop: 4 }}>WEEK {weekBadge}</div>
            </div>
            {hasCurrentData ? (
              <div>
                <StatusBadge status={status} />
                <div style={{ fontSize: 11, color: '#8892a6', marginTop: 4 }}>{notes}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#8892a6' }}>No data this week</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* column 1: headline KPIs */}
            <div style={{
              width: 175, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 18,
            }}
            >
              <KpiBlock
                label="YIELD"
                value={hasCurrentData ? `${data.latestYieldOverall.toFixed(2)}%` : '\u2014'}
                valueColor={hasCurrentData ? (yieldAboveTarget ? '#16a34a' : '#dc2626') : '#000000'}
                badgeText={hasCurrentData ? (yieldAboveTarget ? 'ABOVE TARGET' : 'BELOW TARGET') : '\u2014'}
                badgeTone={hasCurrentData ? (yieldAboveTarget ? 'green' : 'red') : 'green'}
                deltaValue={yieldDelta}
                deltaGood={yieldDelta != null ? yieldDelta >= 0 : true}
                deltaText={yieldDelta != null ? `${yieldDelta >= 0 ? '+' : ''}${yieldDelta.toFixed(2)} pp vs ${prevWeekLabel}` : ''}
                footerText={`Target ${YIELD_TARGET}%`}
              />
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 18 }}>
                <KpiBlock
                  label="DPPM"
                  value={hasCurrentData ? fmtInt(data.latestDppm) : '\u2014'}
                  valueColor={hasCurrentData ? (dppmWithinLimit ? '#16a34a' : '#dc2626') : '#000000'}
                  badgeText={hasCurrentData ? (dppmWithinLimit ? 'WITHIN LIMIT' : 'OVER LIMIT') : '\u2014'}
                  badgeTone={hasCurrentData ? (dppmWithinLimit ? 'green' : 'red') : 'green'}
                  deltaValue={dppmDelta}
                  deltaGood={dppmDelta != null ? dppmDelta <= 0 : true}
                  deltaText={dppmDelta != null ? `${dppmDelta >= 0 ? '+' : ''}${fmtInt(dppmDelta)} vs ${prevWeekLabel}` : ''}
                  footerText={`Limit ${fmtInt(DPPM_LIMIT)}`}
                />
              </div>
            </div>

            {/* column 2: top 3 defects */}
            <div style={{ width: 300, flexShrink: 0, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: '#71819b', letterSpacing: '0.04em', paddingBottom: 9, marginBottom: 4, borderBottom: '1px solid #dbe3ef',
              }}
              >
                TOP 3 DEFECTS
              </div>
              {data.t3.length ? (
                data.t3.map(([defect, count], i) => (
                  <DefectRow
                    key={defect}
                    rank={i + 1}
                    defect={defect}
                    count={count}
                    model={data.topOf(defect, 'model')}
                    comp={data.topOf(defect, 'comp')}
                    trend={data.defectTrend(defect)}
                  />
                ))
              ) : (
                <div style={{ fontSize: 11, color: '#999999', marginTop: 6 }}>No defects recorded this period.</div>
              )}
            </div>

            {/* column 3: full yield + dppm trend charts */}
            <div style={{
              flex: 1, minWidth: 420, display: 'flex', flexDirection: 'column', gap: 16,
            }}
            >
              <DigestMiniChart
                title="Yield Trend"
                values={data.trendYieldSeries}
                labels={data.trendLabels}
                target={YIELD_TARGET}
                targetColor="#16a34a"
                isYield
                metricLabel="Yield"
                targetLegendLabel={`${YIELD_TARGET}% target`}
                targetStatLabel="TARGET"
              />
              <DigestMiniChart
                title="DPPM Trend"
                values={data.trendDppmSeries}
                labels={data.trendLabels}
                target={DPPM_LIMIT}
                targetColor="#e64545"
                isYield={false}
                metricLabel="DPPM"
                targetLegendLabel={`${fmtInt(DPPM_LIMIT)} limit`}
                targetStatLabel="LIMIT"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

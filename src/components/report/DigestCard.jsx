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
      display: 'inline-block', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: t.bg, color: t.color, whiteSpace: 'nowrap',
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
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: c.text,
    }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%', background: c.text, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        <span style={{ color: '#ffffff', fontSize: 10, lineHeight: 1 }}>{status === 'HEALTHY' ? '\u2713' : '!'}</span>
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
        fontSize: 10, fontWeight: 800, color: '#8892a6', letterSpacing: 0.3, marginBottom: 6,
      }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: valueColor }}>{value}</div>
        <Pill text={badgeText} tone={badgeTone} />
      </div>
      {deltaValue != null && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: deltaGood ? '#16a34a' : '#dc2626', marginTop: 6,
        }}
        >
          {deltaValue >= 0 ? '\u25b2' : '\u25bc'} {deltaText}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#8892a6', marginTop: 4 }}>{footerText}</div>
    </div>
  );
}

function DefectRow({
  rank, defect, count, model, comp, trend,
}) {
  const meta = DEFECT_RANK_META[rank - 1] || DEFECT_RANK_META[DEFECT_RANK_META.length - 1];
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 0', borderTop: rank === 1 ? 'none' : '1px solid rgba(0,0,0,0.08)',
    }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: meta.barColor, color: '#ffffff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
      }}
      >
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6,
        }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>{defect}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#000000' }}>{count}</div>
        </div>
        <div style={{ fontSize: 10, color: '#8892a6', marginTop: 5, lineHeight: 1.6 }}>
          Top Contributing Model<br /><b style={{ color: '#000000', fontSize: 11 }}>{model}</b><br />
          Top Contributing Component<br /><b style={{ color: '#000000', fontSize: 11 }}>{comp}</b>
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
      marginTop: first ? 0 : 16, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, overflow: 'hidden', background: '#ffffff',
    }}
    >
      <div style={{ display: 'flex' }}>
        <div style={{ width: 5, background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: '16px 24px' }}>

          {/* header: identity + quality status */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.1)',
          }}
          >
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#000000' }}>{customer}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a6', marginTop: 2 }}>{weekBadge}</div>
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
            <div style={{ width: 250, flexShrink: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: '#8892a6', paddingBottom: 8, marginBottom: 4, borderBottom: '1px solid rgba(0,0,0,0.12)',
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
              flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 14,
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

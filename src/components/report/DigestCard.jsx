import DigestMiniChart from './DigestMiniChart.jsx';
import {
  YIELD_TARGET, DPPM_LIMIT, fmtInt, computeQualityStatus, DEFECT_RANK_META,
} from '../../brain/index.js';

const STATUS_COLORS = {
  HEALTHY: { text: '#16a34a', bg: '#e9f9ef' },
  WARNING: { text: '#c2650c', bg: '#fdf3e6' },
  CRITICAL: { text: '#dc2626', bg: '#fde8e8' },
  'NO DATA': { text: '#666666', bg: '#f2f2f2' },
};

const PILL_TONES = {
  green: { bg: '#e9f9ef', color: '#16a34a' },
  red: { bg: '#fde8e8', color: '#dc2626' },
  orange: { bg: '#fdecd2', color: '#c2650c' },
  amber: { bg: '#fbeec2', color: '#946800' },
};

/* ---------------------------- tiny inline icons --------------------------- */
/* Hand-drawn, dependency-free stand-ins for the lucide-style icons in the
   reference design — kept here rather than pulled from a package so the
   printable digest has no extra runtime dependency. */

function IconCheck({ size = 10, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12l6 6L20 6" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconWarningTriangle({ size = 20, color = '#102a56' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l10 18H2L12 3z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4M12 17.5h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconBarChart({ size = 15, color = '#102a56' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 20V10M12 20V4M20 20v-7" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}
function IconDocument({ size = 15, color = '#102a56' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke={color} strokeWidth="2.1" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}
function IconArrowUp({ size = 10, color = '#dc2626' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5M5 12l7-7 7 7" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pill({ text, tone, dot }) {
  const t = PILL_TONES[tone] || PILL_TONES.green;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: t.bg, color: t.color, whiteSpace: 'nowrap',
    }}
    >
      {dot === 'check' && (
        <span style={{
          width: 13, height: 13, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
        >
          <IconCheck size={8} color="#ffffff" />
        </span>
      )}
      {dot === 'up' && <IconArrowUp size={10} color={t.color} />}
      {text}
    </span>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS['NO DATA'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 19, fontWeight: 800, color: c.text,
    }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: '50%', background: c.text, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        {status === 'HEALTHY' ? <IconCheck size={12} /> : <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 800, lineHeight: 1 }}>!</span>}
      </span>
      QUALITY STATUS: {status}
    </span>
  );
}

/** The header's identity + status + report-meta strip — its own bordered
 * card, with a left accent bar colored by this week's quality status
 * (green/amber/red), matching the reference design 1:1. */
function CardHeader({
  customer, weekBadge, status, notes, generatedAt, hasCurrentData,
}) {
  const c = STATUS_COLORS[status] || STATUS_COLORS['NO DATA'];
  const weekNumMatch = String(weekBadge).match(/W(\d+)$/);
  const weekSuffix = weekNumMatch ? `  (Week ${weekNumMatch[1]})` : '';
  return (
    <div style={{
      display: 'flex', border: '1px solid #dbe3ef', borderRadius: 12, overflow: 'hidden', background: '#ffffff',
    }}
    >
      <div style={{ width: 6, background: c.text, flexShrink: 0 }} />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'stretch', gap: 24, padding: '22px 28px', flexWrap: 'wrap',
      }}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 210,
        }}
        >
          <div style={{
            fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', color: '#102a56', lineHeight: 1.15,
          }}
          >
            {customer}
          </div>
          <div style={{ fontSize: 15, color: '#71819b', marginTop: 4 }}>{weekBadge}{weekSuffix}</div>
        </div>
        <div style={{
          flex: 1, minWidth: 260, background: c.bg, borderRadius: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 26px',
        }}
        >
          <StatusBadge status={status} />
          {hasCurrentData && <div style={{ fontSize: 14, color: '#5c6c85', marginTop: 6 }}>{notes}</div>}
        </div>
        <div style={{
          textAlign: 'right', minWidth: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 14, color: '#71819b',
        }}
        >
          <div style={{ fontWeight: 800, color: '#102a56', fontSize: 15 }}>Weekly Quality Report</div>
          <div style={{ marginTop: 4 }}>Generated: {generatedAt}</div>
        </div>
      </div>
    </div>
  );
}

function KpiBlock({
  icon, label, value, valueColor, badgeText, badgeTone, deltaValue, deltaGood, deltaText, footerText,
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: '#102a56', letterSpacing: 0.4, marginBottom: 9,
      }}
      >
        {icon}
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{
          fontSize: 32, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.6px', color: valueColor,
        }}
        >
          {value}
        </div>
        <Pill text={badgeText} tone={badgeTone} dot={badgeTone === 'green' ? 'check' : null} />
      </div>
      {deltaValue != null && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: deltaGood ? '#16a34a' : '#dc2626', marginTop: 8,
        }}
        >
          {deltaValue >= 0 ? '\u25b2' : '\u25bc'} {deltaText}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#71819b', marginTop: 6 }}>{footerText}</div>
    </div>
  );
}

/** Narrow bordered card holding the YIELD and DPPM headline numbers. */
function MetricsBox({
  hasCurrentData, latestYieldOverall, yieldAboveTarget, yieldDelta, prevWeekLabel,
  latestDppm, dppmWithinLimit, dppmDelta,
}) {
  return (
    <div style={{
      width: 230, flexShrink: 0, border: '1px solid #dbe3ef', borderRadius: 12, background: '#ffffff', padding: '22px 24px',
    }}
    >
      <KpiBlock
        icon={<IconBarChart />}
        label="YIELD"
        value={hasCurrentData ? `${latestYieldOverall.toFixed(2)}%` : '\u2014'}
        valueColor={hasCurrentData ? (yieldAboveTarget ? '#16a34a' : '#dc2626') : '#000000'}
        badgeText={hasCurrentData ? (yieldAboveTarget ? 'ABOVE TARGET' : 'BELOW TARGET') : '\u2014'}
        badgeTone={hasCurrentData ? (yieldAboveTarget ? 'green' : 'red') : 'green'}
        deltaValue={yieldDelta}
        deltaGood={yieldDelta != null ? yieldDelta >= 0 : true}
        deltaText={yieldDelta != null ? `${yieldDelta >= 0 ? '+' : ''}${yieldDelta.toFixed(2)} pp vs ${prevWeekLabel}` : ''}
        footerText={`Target ${YIELD_TARGET}%`}
      />
      <div style={{ borderTop: '1px solid #e7edf5', marginTop: 22, paddingTop: 22 }}>
        <KpiBlock
          icon={<IconDocument />}
          label="DPPM"
          value={hasCurrentData ? fmtInt(latestDppm) : '\u2014'}
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
  );
}

function DefectRow({
  rank, defect, count, model, comp, trend,
}) {
  const meta = DEFECT_RANK_META[rank - 1] || DEFECT_RANK_META[DEFECT_RANK_META.length - 1];
  return (
    <div style={{
      position: 'relative', display: 'flex', gap: 12, padding: '14px 0 14px 16px', borderTop: rank === 1 ? 'none' : '1px solid #e7edf5',
    }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderRadius: 3, background: meta.barColor,
      }}
      />
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
            fontSize: 16, fontWeight: 800, color: '#102a56', letterSpacing: '-0.1px',
          }}
          >
            {defect}
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#102a56' }}>{count}</div>
        </div>
        <div style={{ fontSize: 12, color: '#71819b', marginTop: 7, lineHeight: 1.6 }}>
          Top Contributing Model<br /><b style={{ color: '#243b63', fontSize: 13 }}>{model}</b><br />
          Top Contributing Component<br /><b style={{ color: '#243b63', fontSize: 13 }}>{comp}</b>
        </div>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0,
      }}
      >
        {trend === 'rising' && <Pill text="RISING" tone="red" dot="up" />}
        <Pill text={meta.label} tone={meta.tone} />
      </div>
    </div>
  );
}

/** Bordered card holding the ranked Top-3 defects list. */
function DefectsBox({ t3, topOf, defectTrend }) {
  return (
    <div style={{
      width: 320, flexShrink: 0, minWidth: 0, border: '1px solid #dbe3ef', borderRadius: 12, background: '#ffffff', padding: '20px 22px',
    }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, fontSize: 19, fontWeight: 800, color: '#102a56', marginBottom: 10,
      }}
      >
        <IconWarningTriangle />
        Top 3 Defects
      </div>
      {t3.length ? (
        t3.map(([defect, count], i) => (
          <DefectRow
            key={defect}
            rank={i + 1}
            defect={defect}
            count={count}
            model={topOf(defect, 'model')}
            comp={topOf(defect, 'comp')}
            trend={defectTrend(defect)}
          />
        ))
      ) : (
        <div style={{ fontSize: 12, color: '#999999', marginTop: 6 }}>No defects recorded this period.</div>
      )}
    </div>
  );
}

/**
 * One line/customer's card in the printable weekly digest — a fixed
 * light/white "email document" palette (not the app's dark/light theme
 * toggle): a bordered header strip (identity + quality status + report
 * meta, left accent colored by status) above three independently-boxed
 * sections (headline KPIs, top-3 defects, the two trend charts). Matches
 * the reference weekly digest layout 1:1.
 *
 * @param {string} customer
 * @param {object} data          result of computeCustomerReportData()
 * @param {string} weekBadge     the digest's reference week (range.to) —
 *                               same for every customer in the digest
 * @param {string} generatedAt   pre-formatted export timestamp, shared by
 *                               every card in the digest
 * @param {boolean} [first=false]  first card gets no top margin
 */
export default function DigestCard({
  customer, data, weekBadge, generatedAt, first = false,
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
    <div style={{ marginTop: first ? 0 : 28 }}>
      <CardHeader
        customer={customer}
        weekBadge={weekBadge}
        status={status}
        notes={notes}
        generatedAt={generatedAt}
        hasCurrentData={hasCurrentData}
      />
      <div style={{
        display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap',
      }}
      >
        <MetricsBox
          hasCurrentData={hasCurrentData}
          latestYieldOverall={data.latestYieldOverall}
          yieldAboveTarget={yieldAboveTarget}
          yieldDelta={yieldDelta}
          prevWeekLabel={prevWeekLabel}
          latestDppm={data.latestDppm}
          dppmWithinLimit={dppmWithinLimit}
          dppmDelta={dppmDelta}
        />
        <DefectsBox t3={data.t3} topOf={data.topOf} defectTrend={data.defectTrend} />
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
            targetLegendLabel={`Target (${YIELD_TARGET}%)`}
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
            targetLegendLabel={`Limit (${fmtInt(DPPM_LIMIT)})`}
            targetStatLabel="LIMIT"
          />
        </div>
      </div>
    </div>
  );
}

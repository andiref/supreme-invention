import DigestMiniChart from './DigestMiniChart.jsx';
import { YIELD_TARGET, DPPM_LIMIT } from '../../brain/index.js';

// rank 1/2/3 bar colors — red, orange, yellow — matching the old digest
const DEFECT_BAR_COLORS = ['#dc2626', '#f59e0b', '#eab308'];

function DefectBar({ rank, defect, count, model, comp, maxCount }) {
  const pct = maxCount ? Math.max(6, Math.round((count / maxCount) * 100)) : 0;
  const color = DEFECT_BAR_COLORS[rank - 1] || '#999999';
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#000000' }}>
        <span>{rank}. {defect}</span>
        <span>{count}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 3, marginTop: 6, marginBottom: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#555555', lineHeight: 1.7 }}>
        TOP Contr. Model: <span style={{ color: '#000000' }}>{model || '—'}</span><br />
        TOP Contr. Comp: <span style={{ color: '#000000' }}>{comp || '—'}</span>
      </div>
    </div>
  );
}

/**
 * One customer's card in the printable digest — a fixed light/white
 * "email document" palette (not the app's dark/light theme toggle), a
 * bordered card with a colored left accent, and three columns:
 *   1. identity + the two headline KPIs
 *   2. TOP 3 DEFECTS with proportional bars + top contributing model/comp
 *   3. mini Yield + DPPM trend charts, stacked
 * — matching the old vanilla-JS canvas digest 1:1.
 *
 * @param {string} customer
 * @param {object} data       result of computeCustomerReportData()
 * @param {string} color      accent color for the left bar + trend lines
 * @param {string} weekBadge  the digest's reference week (range.to) — shown
 *                            under every customer's name, same for all of
 *                            them (not each customer's own latest week)
 * @param {boolean} [first=false]  first card gets no top margin
 */
export default function DigestCard({ customer, data, color, weekBadge, first = false }) {
  const hasCurrentData = data.latestTotalInsp > 0;

  return (
    <div style={{
      display: 'flex', marginTop: first ? 0 : 16, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, overflow: 'hidden', background: '#ffffff',
    }}
    >
      <div style={{ width: 5, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', gap: 24, padding: '16px 24px' }}>
        {/* column 1: identity + headline KPIs */}
        <div style={{ width: 185, flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#000000' }}>{customer}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#666666', marginBottom: 16 }}>{weekBadge}</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#888888' }}>THIS WEEK&apos;S YIELD</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#000000' }}>{hasCurrentData ? `${data.latestYieldOverall.toFixed(2)}%` : '—'}</div>
            <div style={{ fontSize: 9, color: '#888888' }}>{hasCurrentData ? `Target: ${YIELD_TARGET}%` : 'No data this week'}</div>
          </div>

          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#888888' }}>DPPM</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#000000' }}>{hasCurrentData ? Math.round(data.latestDppm).toLocaleString() : '—'}</div>
            <div style={{ fontSize: 9, color: '#888888' }}>{hasCurrentData ? `Limit: ${DPPM_LIMIT.toLocaleString()}` : ''}</div>
          </div>
        </div>

        {/* column 2: top 3 defects, proportional bars */}
        <div style={{ width: 230, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#888888', paddingBottom: 6, marginBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.15)' }}>TOP 3 DEFECTS</div>
          {data.t3.length ? (
            data.t3.map(([defect, count], i) => (
              <DefectBar
                key={defect}
                rank={i + 1}
                defect={defect}
                count={count}
                model={data.topOf(defect, 'model')}
                comp={data.topOf(defect, 'comp')}
                maxCount={data.t3[0][1]}
              />
            ))
          ) : (
            <div style={{ fontSize: 10, color: '#999999' }}>No defects recorded this period.</div>
          )}
        </div>

        {/* column 3: mini yield + dppm trend charts, stacked */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DigestMiniChart
            title="Yield Trend"
            values={data.trendYieldSeries}
            labels={data.trendLabels}
            target={YIELD_TARGET}
            targetColor="#16a34a"
            isYield
            metricLabel="Yield"
            targetText={`${YIELD_TARGET}% target`}
          />
          <DigestMiniChart
            title="DPPM Trend"
            values={data.trendDppmSeries}
            labels={data.trendLabels}
            target={DPPM_LIMIT}
            targetColor="#dc2626"
            isYield={false}
            metricLabel="DPPM"
            targetText={`${DPPM_LIMIT.toLocaleString()} limit`}
          />
        </div>
      </div>
    </div>
  );
}

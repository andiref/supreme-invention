import { useMemo } from 'react';
import TrendLineChart, { computeZoomedDomain } from '../charts/TrendLineChart.jsx';
import { YIELD_TARGET, DPPM_LIMIT } from '../../brain/index.js';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

const DEFECT_BAR_COLORS = ['#ef4444', '#f59e0b', '#cbd5e1'];

function DefectBar({ rank, defect, count, model, comp, maxCount }) {
  const pct = maxCount ? Math.max(6, Math.round((count / maxCount) * 100)) : 0;
  const color = DEFECT_BAR_COLORS[rank - 1] || '#cbd5e1';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--yc-text)' }}>
        <span>{rank}. {defect}</span>
        <span>{count}</span>
      </div>
      <div style={{ height: 5, background: 'var(--yc-border)', borderRadius: 3, marginTop: 3, marginBottom: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 9, color: 'var(--yc-muted)', lineHeight: 1.6 }}>
        TOP Contr. Model: <strong style={{ color: 'var(--yc-muted2)' }}>{model || '—'}</strong><br />
        TOP Contr. Comp: <strong style={{ color: 'var(--yc-muted2)' }}>{comp || '—'}</strong>
      </div>
    </div>
  );
}

/**
 * One customer's digest block, laid out the way the old vanilla-JS canvas
 * digest (SMT_Digest_*.png) used to: a bordered card with a colored left
 * accent, split into three columns —
 *   1. identity + the two headline KPIs
 *   2. TOP 3 DEFECTS with proportional bars + top contributing model/comp
 *   3. mini Yield + DPPM trend charts, stacked
 * — instead of the single-customer report's two-column layout.
 *
 * @param {string} customer
 * @param {object} data   result of computeCustomerReportData()
 * @param {string} color  accent color for the left bar + trend lines
 * @param {boolean} [first=false]  first card in the digest gets no top margin
 */
export default function DigestCard({ customer, data, color, first = false }) {
  const hasCurrentData = data.latestTotalInsp > 0;
  const yieldDomain = useMemo(
    () => computeZoomedDomain([{ values: data.trendYieldSeries }], YIELD_TARGET),
    [data.trendYieldSeries]
  );

  return (
    <div style={{
      display: 'flex', marginTop: first ? 0 : 16, border: '1px solid var(--yc-border)', borderRadius: 8, overflow: 'hidden',
    }}
    >
      <div style={{ width: 5, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', gap: 20, padding: '16px 20px' }}>
        {/* column 1: identity + headline KPIs */}
        <div style={{ width: 190, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{customer}</div>
          <div style={{ fontSize: 10, color: 'var(--yc-muted)', marginBottom: 14 }}>{weekLabel(data.lw)}</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: 'var(--yc-muted)', letterSpacing: '0.05em' }}>OVERALL YIELD</div>
            {hasCurrentData ? (
              <>
                <div style={{ fontSize: 21, fontWeight: 700, color: data.latestYieldOverall >= YIELD_TARGET ? '#22c55e' : '#ef4444' }}>{data.latestYieldOverall.toFixed(2)}%</div>
                <div style={{ fontSize: 9, color: 'var(--yc-muted)' }}>Target: {YIELD_TARGET}%</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, color: 'var(--yc-muted)' }}>—</div>
                <div style={{ fontSize: 9, color: 'var(--yc-muted)' }}>No data this week</div>
              </>
            )}
          </div>

          <div>
            <div style={{ fontSize: 9, color: 'var(--yc-muted)', letterSpacing: '0.05em' }}>DPPM</div>
            {hasCurrentData ? (
              <>
                <div style={{ fontSize: 21, fontWeight: 700, color: data.latestDppm <= DPPM_LIMIT ? '#22c55e' : '#ef4444' }}>{Math.round(data.latestDppm).toLocaleString()}</div>
                <div style={{ fontSize: 9, color: 'var(--yc-muted)' }}>Limit: {DPPM_LIMIT.toLocaleString()}</div>
              </>
            ) : (
              <div style={{ fontSize: 18, color: 'var(--yc-muted)' }}>—</div>
            )}
          </div>
        </div>

        {/* column 2: top 3 defects, proportional bars */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--yc-muted)', letterSpacing: '0.05em', paddingBottom: 6, marginBottom: 10, borderBottom: '1px solid var(--yc-border)' }}>TOP 3 DEFECTS</div>
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
            <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No defects recorded this period.</div>
          )}
        </div>

        {/* column 3: mini yield + dppm trend charts, stacked */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--yc-muted2)', marginBottom: 2 }}>Yield Trend</div>
          <TrendLineChart
            labels={data.trendLabels}
            series={[{ name: 'Yield', color, values: data.trendYieldSeries }]}
            target={YIELD_TARGET}
            valueSuffix="%"
            height={118}
            domain={yieldDomain}
          />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--yc-muted2)', margin: '8px 0 2px' }}>DPPM Trend</div>
          <TrendLineChart
            labels={data.trendLabels}
            series={[{ name: 'DPPM', color, values: data.trendDppmSeries }]}
            target={DPPM_LIMIT}
            height={118}
            domain={[0, 'auto']}
          />
        </div>
      </div>
    </div>
  );
}

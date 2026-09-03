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
    <div style={{ marginBottom: 10 }}>
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
 * One customer's KPI + top-3-defects + yield/DPPM trend block. Shared by
 * ReportSnapshot (single customer) and DigestSnapshot (all customers,
 * stacked) so both PNG exports render with the exact same layout.
 *
 * @param {string} customer
 * @param {object} data      result of computeCustomerReportData()
 * @param {string} color     accent color for the left bar + trend lines
 * @param {boolean} [bordered=true]  draw the top divider (off for the first/only section)
 */
export default function CustomerSection({ customer, data, color, bordered = true }) {
  const hasCurrentData = data.latestTotalInsp > 0;
  const yieldDomain = useMemo(
    () => computeZoomedDomain([{ values: data.trendYieldSeries }], YIELD_TARGET),
    [data.trendYieldSeries]
  );

  return (
    <div style={{ display: 'flex', borderTop: bordered ? '1px solid var(--yc-border)' : 'none', paddingTop: bordered ? 16 : 0, marginTop: bordered ? 16 : 0 }}>
      <div style={{ width: 4, background: color, borderRadius: 2, marginRight: 16, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', gap: 20 }}>
        {/* left column: identity, KPIs, top-3 defects */}
        <div style={{ width: '36%', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{customer}</div>
          <div style={{ fontSize: 10, color: 'var(--yc-muted)', marginBottom: 12 }}>{weekLabel(data.lw)}</div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--yc-muted)', letterSpacing: '0.05em' }}>OVERALL YIELD</div>
            {hasCurrentData ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: data.latestYieldOverall >= YIELD_TARGET ? '#22c55e' : '#ef4444' }}>{data.latestYieldOverall.toFixed(2)}%</div>
                <div style={{ fontSize: 9, color: 'var(--yc-muted)' }}>Target: {YIELD_TARGET}%</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, color: 'var(--yc-muted)' }}>—</div>
                <div style={{ fontSize: 9, color: 'var(--yc-muted)' }}>No data this week</div>
              </>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--yc-muted)', letterSpacing: '0.05em' }}>DPPM</div>
            {hasCurrentData ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: data.latestDppm <= DPPM_LIMIT ? '#22c55e' : '#ef4444' }}>{Math.round(data.latestDppm).toLocaleString()}</div>
                <div style={{ fontSize: 9, color: 'var(--yc-muted)' }}>Limit: {DPPM_LIMIT.toLocaleString()}</div>
              </>
            ) : (
              <div style={{ fontSize: 18, color: 'var(--yc-muted)' }}>—</div>
            )}
          </div>

          <div style={{ fontSize: 9, color: 'var(--yc-muted)', letterSpacing: '0.05em', marginBottom: 6 }}>TOP 3 DEFECTS</div>
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

        {/* right column: yield + dppm trend, stacked */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--yc-muted2)', marginBottom: 2 }}>Yield Trend</div>
          <TrendLineChart
            labels={data.trendLabels}
            series={[{ name: 'Yield', color, values: data.trendYieldSeries }]}
            target={YIELD_TARGET}
            valueSuffix="%"
            height={130}
            domain={yieldDomain}
          />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--yc-muted2)', margin: '8px 0 2px' }}>DPPM Trend</div>
          <TrendLineChart
            labels={data.trendLabels}
            series={[{ name: 'DPPM', color, values: data.trendDppmSeries }]}
            target={DPPM_LIMIT}
            height={130}
            domain={[0, 'auto']}
          />
        </div>
      </div>
    </div>
  );
}

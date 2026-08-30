import { forwardRef, useMemo } from 'react';
import TrendLineChart, { computeZoomedDomain } from '../charts/TrendLineChart.jsx';
import { YIELD_TARGET, DPPM_LIMIT } from '../../brain/index.js';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

const ReportSnapshot = forwardRef(function ReportSnapshot({ customer, range, data, author }, ref) {
  const yieldDomain = useMemo(
    () => computeZoomedDomain([{ values: data.yieldSeries }], YIELD_TARGET),
    [data.yieldSeries]
  );

  return (
    <div ref={ref} style={{ background: 'var(--yc-bg)', color: 'var(--yc-text)', padding: 20, borderRadius: 10, fontFamily: "'Courier New', monospace" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>⚙️ SMT Weekly Quality Report — {customer}</div>
        <div style={{ fontSize: 10, color: 'var(--yc-muted)' }}>{weekLabel(range.from)} – {weekLabel(range.to)}</div>
      </div>
      {author && <div style={{ fontSize: 10, color: 'var(--yc-muted)', marginBottom: 12 }}>Prepared by {author} · {new Date().toLocaleDateString()}</div>}

      <div className="kpi-row">
        {[
          { l: 'YIELD OVERALL', v: `${data.yieldOverall.toFixed(3)}%`, c: data.yieldOverall >= YIELD_TARGET ? '#22c55e' : '#ef4444' },
          { l: 'DPPM', v: Math.round(data.dppm).toLocaleString(), c: data.dppm <= DPPM_LIMIT ? '#22c55e' : '#ef4444' },
          { l: 'TOTAL INSPECTED', v: data.totalInsp.toLocaleString(), c: '#3b82f6' },
          { l: 'TOTAL FAILED', v: data.totalFailed.toLocaleString(), c: '#a78bfa' },
        ].map((k) => (
          <div key={k.l} className="kpi" style={{ background: `${k.c}12`, border: `1px solid ${k.c}50` }}>
            <div className="kpi-n" style={{ color: k.c }}>{k.v}</div>
            <div className="kpi-l">{k.l}</div>
          </div>
        ))}
      </div>

      {data.labels.length > 1 && (
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <TrendLineChart
            labels={data.labels}
            series={[{ name: 'Yield %', color: '#3b82f6', values: data.yieldSeries }]}
            target={YIELD_TARGET}
            valueSuffix="%"
            height={160}
            domain={yieldDomain}
          />
        </div>
      )}

      <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginTop: 12, marginBottom: 6, letterSpacing: '0.05em' }}>
        TOP 3 DEFECTS — WEEK {weekLabel(data.lw)}
      </div>
      {data.t3.length ? (
        <table style={{ width: '100%', fontSize: 11 }}>
          <thead>
            <tr><th>#</th><th>Defect</th><th>Count</th><th>Top Model</th><th>Top Ref</th></tr>
          </thead>
          <tbody>
            {data.t3.map(([defect, count], i) => (
              <tr key={defect}>
                <td>{i + 1}</td>
                <td>{defect}</td>
                <td className="num">{count}</td>
                <td>{data.topOf(defect, 'model')}</td>
                <td>{data.topOf(defect, 'comp')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No defects recorded in week {weekLabel(data.lw)}.</div>
      )}
    </div>
  );
});

export default ReportSnapshot;

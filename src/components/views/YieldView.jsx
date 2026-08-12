import { useMemo, useState } from 'react';
import {
  calcMetrics, findUnmatchedDefectCombos, filterMetrics, filterDefectRows,
  distinctWeeks, distinctCustomers, distinctModels, aggregateKpis,
  paretoByDefectType, topFailingComponents, CHART_COLORS, YIELD_TARGET, DPPM_LIMIT,
} from '../../brain/index.js';
import { Card, KpiRow } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import ImportPanel from '../common/ImportPanel.jsx';
import RecentImportsList from '../common/RecentImportsList.jsx';
import TrendLineChart from '../charts/TrendLineChart.jsx';
import SimpleBarChart from '../charts/SimpleBarChart.jsx';

function weekLabel(w) {
  const m = w.match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

export default function YieldView({ defectRows, prodVolRows, userEmail, showToast, showConfirm }) {
  const [showImport, setShowImport] = useState(null); // null | 'defect' | 'prodvol'
  const [filters, setFilters] = useState({ week: 'ALL', customer: 'ALL', model: 'ALL' });
  const [trendMode, setTrendMode] = useState('overall'); // 'overall' | 'byCustomer'
  const [importsRefreshKey, setImportsRefreshKey] = useState(0);

  const metrics = useMemo(() => calcMetrics(defectRows, prodVolRows, { yieldTarget: YIELD_TARGET, dppmLimit: DPPM_LIMIT }), [defectRows, prodVolRows]);
  const unmatched = useMemo(() => findUnmatchedDefectCombos(defectRows, prodVolRows), [defectRows, prodVolRows]);

  const weeks = useMemo(() => distinctWeeks(metrics), [metrics]);
  const customers = useMemo(() => distinctCustomers(metrics), [metrics]);
  const models = useMemo(() => distinctModels(metrics), [metrics]);

  const filteredMetrics = useMemo(() => filterMetrics(metrics, filters), [metrics, filters]);
  const filteredDefects = useMemo(() => filterDefectRows(defectRows, filters), [defectRows, filters]);
  const kpi = useMemo(() => aggregateKpis(filteredMetrics), [filteredMetrics]);

  const kpiCards = filteredMetrics.length ? [
    { label: 'YIELD OVERALL', value: `${kpi.yieldOverall.toFixed(3)}%`, color: kpi.yieldOverall >= YIELD_TARGET ? '#22c55e' : '#ef4444', sub: `Target ≥${YIELD_TARGET}%  ${kpi.yieldOverall >= YIELD_TARGET ? '✅' : '❌'}` },
    { label: 'YIELD TOP', value: kpi.yieldTOP != null ? `${kpi.yieldTOP.toFixed(3)}%` : '—', color: kpi.yieldTOP != null && kpi.yieldTOP >= YIELD_TARGET ? '#22c55e' : '#ef4444', sub: `Insp:${kpi.inspTOP.toLocaleString()} Fail:${kpi.failedTOP}` },
    { label: 'YIELD BOT', value: kpi.yieldBOT != null ? `${kpi.yieldBOT.toFixed(3)}%` : '—', color: kpi.yieldBOT != null && kpi.yieldBOT >= YIELD_TARGET ? '#22c55e' : '#a78bfa', sub: `Insp:${kpi.inspBOT.toLocaleString()} Fail:${kpi.failedBOT}` },
    { label: 'DPPM', value: Math.round(kpi.dppm).toLocaleString(), color: kpi.dppm <= DPPM_LIMIT ? '#22c55e' : '#ef4444', sub: `Limit ≤${DPPM_LIMIT.toLocaleString()}  ${kpi.dppm <= DPPM_LIMIT ? '✅' : '❌'}` },
    { label: 'DEFECT RECORDS', value: String(kpi.totalDefects), color: '#a78bfa', sub: 'Total defect rows' },
  ] : [];

  // ── Trend charts: always across every week (ignores week filter — that's what makes it a trend), respects model filter ──
  const trendMetrics = useMemo(() => filterMetrics(metrics, { week: 'ALL', customer: 'ALL', model: filters.model }), [metrics, filters.model]);
  const trendWeeks = useMemo(() => distinctWeeks(trendMetrics), [trendMetrics]);
  const trendCustomers = useMemo(() => distinctCustomers(trendMetrics), [trendMetrics]);

  const yieldSeries = useMemo(() => {
    if (trendMode === 'overall') {
      return [{ name: 'Yield %', color: '#3b82f6', values: trendWeeks.map((wk) => {
        const rows = trendMetrics.filter((m) => m.week === wk);
        return rows.length ? aggregateKpis(rows).yieldOverall : null;
      }) }];
    }
    return trendCustomers.map((cu, i) => ({
      name: cu, color: CHART_COLORS[i % CHART_COLORS.length],
      values: trendWeeks.map((wk) => {
        const rows = trendMetrics.filter((m) => m.week === wk && m.customer === cu);
        return rows.length ? aggregateKpis(rows).yieldOverall : null;
      }),
    }));
  }, [trendMode, trendWeeks, trendCustomers, trendMetrics]);

  const dppmSeries = useMemo(() => {
    if (trendMode === 'overall') {
      return [{ name: 'DPPM', color: '#f59e0b', values: trendWeeks.map((wk) => {
        const rows = trendMetrics.filter((m) => m.week === wk);
        return rows.length ? aggregateKpis(rows).dppm : null;
      }) }];
    }
    return trendCustomers.map((cu, i) => ({
      name: cu, color: CHART_COLORS[i % CHART_COLORS.length],
      values: trendWeeks.map((wk) => {
        const rows = trendMetrics.filter((m) => m.week === wk && m.customer === cu);
        return rows.length ? aggregateKpis(rows).dppm : null;
      }),
    }));
  }, [trendMode, trendWeeks, trendCustomers, trendMetrics]);

  const pareto = useMemo(() => paretoByDefectType(filteredDefects).slice(0, 10), [filteredDefects]);
  const topComponents = useMemo(() => topFailingComponents(filteredDefects, 15), [filteredDefects]);

  function handleImported(result, type) {
    setShowImport(null);
    setImportsRefreshKey((k) => k + 1);
    showToast(`✓ Imported ${result.count ?? ''} ${type === 'defect' ? 'defect rows' : 'production volume rows'}${result.duplicates ? ` (${result.duplicates} duplicates skipped)` : ''}`);
  }

  return (
    <div id="yc-root">
      <div id="tab-yield">
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>IMPORT:</span>
          <button className="btn bg" onClick={() => setShowImport(showImport === 'defect' ? null : 'defect')}>📋 DEFECT DATA</button>
          <button className="btn bb" onClick={() => setShowImport(showImport === 'prodvol' ? null : 'prodvol')}>📊 PRODUCTION VOLUME</button>
        </div>

        {showImport && (
          <ImportPanel type={showImport} userEmail={userEmail} onImported={handleImported} onClose={() => setShowImport(null)} />
        )}

        <Card title="🕘 RECENT IMPORTS">
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>Imported the wrong file or wrong data by mistake? Undo it here.</div>
          <RecentImportsList userEmail={userEmail} refreshKey={importsRefreshKey} onUndo={() => setImportsRefreshKey((k) => k + 1)} onShowConfirm={showConfirm} />
        </Card>

        {unmatched.length > 0 && (
          <div className="dk" style={{ fontSize: 11, color: '#f59e0b' }}>
            ⚠ {unmatched.length} Week+Customer+Model combo(s) have Defect Data but no matching Production Volume, so they're excluded from Yield/DPPM below:
            <div style={{ marginTop: 6, color: '#94a3b8' }}>
              {unmatched.slice(0, 8).map((c) => `${c.week} / ${c.customer} / ${c.model}`).join('  •  ')}
              {unmatched.length > 8 && ` …and ${unmatched.length - 8} more`}
            </div>
          </div>
        )}

        <div className="dk" style={{ fontSize: 11, color: '#94a3b8', lineHeight: 2.2 }}>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>YIELD TOP   </span>= ( InspTOP − Unique Failed SN(TOP) ) ÷ InspTOP × 100<br />
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>YIELD BOT   </span>= ( InspBOT − Unique Failed SN(BOT) ) ÷ InspBOT × 100<br />
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>YIELD OVERALL</span>= ( InspTOP+InspBOT − Total Failed SN+Side ) ÷ ( InspTOP+InspBOT ) × 100<br />
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>DPPM        </span>= Total Failed SN+Side ÷ ( InspTOP+InspBOT ) × 1,000,000
        </div>

        <div className="fw" style={{ marginBottom: 14 }}>
          <FilterField label="WEEK" value={filters.week} onChange={(v) => setFilters((f) => ({ ...f, week: v }))}
            options={[{ value: 'ALL', label: 'All Weeks' }, ...weeks.map((w) => ({ value: w, label: weekLabel(w) }))]} />
          <FilterField label="CUSTOMER" value={filters.customer} onChange={(v) => setFilters((f) => ({ ...f, customer: v }))}
            options={[{ value: 'ALL', label: 'All Customers' }, ...customers]} />
          <FilterField label="MODEL" value={filters.model} onChange={(v) => setFilters((f) => ({ ...f, model: v }))}
            options={[{ value: 'ALL', label: 'All Models' }, ...models]} />
        </div>

        <KpiRow kpis={kpiCards} />

        <Card title="📈 YIELD % TREND">
          <div className="fw" style={{ marginBottom: 8 }}>
            <FilterField label="VIEW" value={trendMode} onChange={setTrendMode} width={160}
              options={[{ value: 'overall', label: 'Overall' }, { value: 'byCustomer', label: 'By Customer' }]} />
          </div>
          {trendWeeks.length ? (
            <TrendLineChart labels={trendWeeks.map(weekLabel)} series={yieldSeries} target={YIELD_TARGET} valueSuffix="%" />
          ) : <div style={{ fontSize: 11, color: '#64748b' }}>No data yet.</div>}
        </Card>

        <Card title="📉 DPPM TREND">
          {trendWeeks.length ? (
            <TrendLineChart labels={trendWeeks.map(weekLabel)} series={dppmSeries} target={DPPM_LIMIT} />
          ) : <div style={{ fontSize: 11, color: '#64748b' }}>No data yet.</div>}
        </Card>

        <Card title="🔻 DEFECT PARETO (filtered)">
          {pareto.length ? (
            <SimpleBarChart data={pareto.map(([name, value]) => ({ name, value }))} defaultColor="#ef4444" />
          ) : <div style={{ fontSize: 11, color: '#64748b' }}>No defects match the current filters.</div>}
        </Card>

        <Card title="🔧 TOP FAILING COMPONENTS (filtered)">
          {topComponents.length ? (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>#</th><th>Ref</th><th>Fails</th><th>Top Defect</th><th>Models</th><th>Sides</th></tr></thead>
                <tbody>
                  {topComponents.map((c) => (
                    <tr key={c.comp}>
                      <td>{c.rank}</td>
                      <td>{c.comp}</td>
                      <td className="num">{c.count}</td>
                      <td>{c.topDefect} ({c.topDefectCount})</td>
                      <td>{c.models.join(', ')}</td>
                      <td>{c.sides.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={{ fontSize: 11, color: '#64748b' }}>No defects match the current filters.</div>}
        </Card>
      </div>
    </div>
  );
}

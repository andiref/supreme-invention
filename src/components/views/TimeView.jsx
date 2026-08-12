import { useMemo, useState } from 'react';
import {
  filterDefectRows, distinctWeeks, distinctCustomers, distinctModels,
  shiftBreakdown, dayOfWeekBreakdown, hourlyBreakdown, topDefectPerShift, dailyFailedTrend,
} from '../../brain/index.js';
import { Card } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import SimpleBarChart from '../charts/SimpleBarChart.jsx';
import TrendLineChart from '../charts/TrendLineChart.jsx';
import HourlyHeatmap from '../charts/HourlyHeatmap.jsx';

function weekLabel(w) {
  const m = w.match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

export default function TimeView({ defectRows }) {
  const [filters, setFilters] = useState({ week: 'ALL', customer: 'ALL', model: 'ALL' });

  const weeks = useMemo(() => distinctWeeks(defectRows), [defectRows]);
  const customers = useMemo(() => distinctCustomers(defectRows), [defectRows]);
  const models = useMemo(() => distinctModels(defectRows), [defectRows]);

  const filtered = useMemo(() => filterDefectRows(defectRows, filters), [defectRows, filters]);

  const shifts = useMemo(() => shiftBreakdown(filtered), [filtered]);
  const dow = useMemo(() => dayOfWeekBreakdown(filtered), [filtered]);
  const hourly = useMemo(() => hourlyBreakdown(filtered), [filtered]);
  const perShift = useMemo(() => topDefectPerShift(filtered), [filtered]);
  const daily = useMemo(() => dailyFailedTrend(filtered), [filtered]);

  return (
    <div id="yc-root">
      <div className="fw" style={{ marginBottom: 14 }}>
        <FilterField label="WEEK" value={filters.week} onChange={(v) => setFilters((f) => ({ ...f, week: v }))}
          options={[{ value: 'ALL', label: 'All Weeks' }, ...weeks.map((w) => ({ value: w, label: weekLabel(w) }))]} />
        <FilterField label="CUSTOMER" value={filters.customer} onChange={(v) => setFilters((f) => ({ ...f, customer: v }))}
          options={[{ value: 'ALL', label: 'All Customers' }, ...customers]} />
        <FilterField label="MODEL" value={filters.model} onChange={(v) => setFilters((f) => ({ ...f, model: v }))}
          options={[{ value: 'ALL', label: 'All Models' }, ...models]} />
      </div>

      {!filtered.length ? (
        <Card><div style={{ fontSize: 11, color: '#64748b' }}>No defect data matches the current filters.</div></Card>
      ) : (
        <>
          <Card title="🕐 DEFECTS BY SHIFT">
            <SimpleBarChart data={shifts.map((s) => ({ name: `${s.label}`, value: s.count, color: s.color }))} />
            <div className="tbl-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Shift</th><th>Defects</th><th>% of Total</th><th>Failed Units</th></tr></thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.name}>
                      <td><span className="dot" style={{ background: s.color }} />{s.name}</td>
                      <td className="num">{s.count}</td>
                      <td className="num">{s.pctOfTotal}%</td>
                      <td className="num">{s.failedUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="🎯 TOP DEFECT PER SHIFT">
            <div className="row">
              {perShift.map((s) => (
                <div key={s.shift} className="col" style={{ minWidth: 200 }}>
                  <div className="dk">
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.shift}</div>
                    {s.topDefect ? (
                      <>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{s.topDefect} <span style={{ color: '#64748b' }}>({s.count}, {s.pctOfShift}%)</span></div>
                        <div style={{ fontSize: 10, color: 'var(--yc-muted2)' }}>{s.insight}</div>
                      </>
                    ) : <div style={{ fontSize: 11, color: '#64748b' }}>No defects this shift.</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="📅 DEFECTS BY DAY OF WEEK">
            <SimpleBarChart data={dow.map((d) => ({ name: d.name.slice(0, 3), value: d.count }))} defaultColor="#a78bfa" />
          </Card>

          <Card title="🔥 HOURLY HEATMAP (24h)">
            <HourlyHeatmap hourly={hourly} />
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: 'var(--yc-muted2)' }}>
              <span><span className="dot" style={{ background: '#3b82f6' }} /> Morning (07-15)</span>
              <span><span className="dot" style={{ background: '#f59e0b' }} /> Afternoon (15-23)</span>
              <span><span className="dot" style={{ background: '#a78bfa' }} /> Night (23-07)</span>
            </div>
          </Card>

          <Card title="📈 DAILY FAILED-UNIT TREND">
            {daily.length ? (
              <TrendLineChart
                labels={daily.map((d) => d.dateStr)}
                series={[{ name: 'Failed Units', color: '#ef4444', values: daily.map((d) => d.failedUnits) }]}
              />
            ) : <div style={{ fontSize: 11, color: '#64748b' }}>Not enough data.</div>}
          </Card>
        </>
      )}
    </div>
  );
}

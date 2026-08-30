import { useMemo } from 'react';
import { buildDataHealth } from '../../brain/index.js';
import { Card, KpiRow } from '../common/Kpi.jsx';

function HealthKpi({ label, value, sub, tone = 'blue' }) {
  const colors = { blue: '#3b82f6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', teal: '#14b8a6' };
  const color = colors[tone] || colors.blue;
  return <div className="kpi" style={{ background: `${color}12`, border: `1px solid ${color}50` }}><div className="kpi-n" style={{ color }}>{value}</div><div className="kpi-l">{label}</div><div className="kpi-s">{sub}</div></div>;
}

function IssueRow({ level, title, detail }) {
  return <div className={`health-issue health-${level}`}><div><strong>{title}</strong><div className="health-detail">{detail}</div></div><span>{level === 'ok' ? '✓' : '!'}</span></div>;
}

export default function DataHealthView({ defectRows, prodVolRows, capaRecords }) {
  const health = useMemo(() => buildDataHealth(defectRows, prodVolRows, capaRecords), [defectRows, prodVolRows, capaRecords]);
  const s = health.summary;

  return (
    <div id="yc-root">
      <Card title="🛡 DATA HEALTH — V3">
        <div className="data-health-banner">
          <div>
            <div className="health-score">{s.warnings === 0 ? 'HEALTHY' : `${s.warnings} ITEM${s.warnings > 1 ? 'S' : ''} TO REVIEW`}</div>
            <div className="health-detail">Validation across imported defects, production volume, CAPA, and join integrity.</div>
          </div>
          <div className="health-stamp">{new Date(health.generatedAt).toLocaleString()}</div>
        </div>
        <div className="kpi-row">
          <HealthKpi label="DEFECT ROWS" value={s.defectRows.toLocaleString()} sub="Realtime records" />
          <HealthKpi label="PROD ROWS" value={s.productionRows.toLocaleString()} sub="Realtime records" />
          <HealthKpi label="MATCHED COMBOS" value={s.matchedCombos.toLocaleString()} sub="Yield-ready joins" tone="green" />
          <HealthKpi label="WARNINGS" value={s.warnings.toLocaleString()} sub="Require review" tone={s.warnings ? 'amber' : 'green'} />
        </div>
      </Card>

      <Card title="🔗 JOIN INTEGRITY">
        <div className="health-grid">
          <IssueRow level={s.unmatchedCombos ? 'warning' : 'ok'} title="Defect rows without Production Volume" detail={s.unmatchedCombos ? `${s.unmatchedCombos} Week + Customer + Model combo(s) are excluded from Yield/DPPM.` : 'All defect combinations have matching production volume.'} />
          <IssueRow level={s.duplicateProdCombos ? 'warning' : 'ok'} title="Duplicate Production Volume keys" detail={s.duplicateProdCombos ? `${s.duplicateProdCombos} duplicate normalized combo record(s) detected; calculations sum them.` : 'No duplicate normalized production keys detected.'} />
          <IssueRow level={s.zeroVolumeRows ? 'warning' : 'ok'} title="Zero-volume Production rows" detail={s.zeroVolumeRows ? `${s.zeroVolumeRows} row(s) have zero total inspection volume.` : 'No zero-volume rows.'} />
          <IssueRow level={s.invalidVolumeRows ? 'critical' : 'ok'} title="Negative inspection volume" detail={s.invalidVolumeRows ? `${s.invalidVolumeRows} row(s) contain negative inspection counts.` : 'No negative inspection counts detected.'} />
        </div>
      </Card>

      <Card title="🛠 CAPA HEALTH">
        <div className="kpi-row">
          <HealthKpi label="OPEN" value={health.capa.open} sub="Active chains" tone={health.capa.open ? 'amber' : 'green'} />
          <HealthKpi label="OVERDUE" value={health.capa.overdue} sub="Past due date" tone={health.capa.overdue ? 'red' : 'green'} />
          <HealthKpi label="MONITORING" value={health.capa.monitoring} sub="Effectiveness check" tone="amber" />
          <HealthKpi label="EFFECTIVE" value={health.capa.effective} sub="Verified improvement" tone="teal" />
          <HealthKpi label="CLOSED" value={health.capa.closed} sub="Completed chains" tone="green" />
        </div>
        <div className="health-detail" style={{ marginTop: 8 }}>{health.capa.total ? `${health.capa.total} CAPA chain(s) currently stored.` : 'No CAPA chains stored yet.'}</div>
      </Card>

      <Card title="🔥 CHRONIC DEFECT SIGNAL">
        <div className="kpi-row"><HealthKpi label="CHRONIC DEFECTS" value={health.chronic.count} sub="Top-3 in ≥2 of last 4 weeks" tone={health.chronic.count ? 'red' : 'green'} /></div>
        {health.chronic.details.length ? (
          <div className="tbl-wrap"><table><thead><tr><th>Customer</th><th>Defect</th><th>Top-3 Weeks</th></tr></thead><tbody>{health.chronic.details.slice(0, 20).map((x) => <tr key={`${x.customer}|${x.defect}`}><td>{x.customer}</td><td>{x.defect}</td><td className="num">{x.weeksInTop3}</td></tr>)}</tbody></table></div>
        ) : <div className="health-detail">No chronic Top-3 defect pattern detected in the available last four weeks.</div>}
      </Card>

      {health.unmatched.length > 0 && <Card title="⚠ UNMATCHED COMBINATIONS"><div className="tbl-wrap"><table><thead><tr><th>Week</th><th>Customer</th><th>Model</th></tr></thead><tbody>{health.unmatched.slice(0, 50).map((x) => <tr key={`${x.week}|${x.customer}|${x.model}`}><td>{x.week}</td><td>{x.customer}</td><td>{x.model}</td></tr>)}</tbody></table></div>{health.unmatched.length > 50 && <div className="health-detail" style={{ marginTop: 8 }}>Showing first 50 of {health.unmatched.length} unmatched combinations.</div>}</Card>}
    </div>
  );
}

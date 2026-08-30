import { useMemo, useState } from 'react';
import { analyzeQualityData, answerQualityQuestion, distinctCustomers, distinctModels, distinctWeeks } from '../../brain/index.js';
import FilterField from '../common/FilterField.jsx';
import { Card } from '../common/Kpi.jsx';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

const tone = {
  'ACTION REQUIRED': '#ef4444',
  'MONITOR': '#f59e0b',
  STABLE: '#22c55e',
  'NO DATA': '#64748b',
};

export default function QualityAssistantView({ defectRows, prodVolRows, capaRecords }) {
  const weeks = useMemo(() => distinctWeeks(defectRows).sort(), [defectRows]);
  const customers = useMemo(() => distinctCustomers(defectRows), [defectRows]);
  const models = useMemo(() => distinctModels(defectRows), [defectRows]);
  const [week, setWeek] = useState('ALL');
  const [customer, setCustomer] = useState('ALL');
  const [model, setModel] = useState('ALL');
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');

  const analysis = useMemo(
    () => analyzeQualityData(defectRows, prodVolRows, capaRecords, { week, customer, model }),
    [defectRows, prodVolRows, capaRecords, week, customer, model]
  );

  const answer = useMemo(() => asked ? answerQualityQuestion(asked, analysis) : '', [asked, analysis]);
  const primary = analysis.primaryDefect;

  function ask(q = question) {
    if (!q.trim()) return;
    setAsked(q.trim());
    setQuestion(q.trim());
  }

  return (
    <div id="yc-root">
      <Card>
        <div className="data-health-banner" style={{ marginBottom: 0 }}>
          <div>
            <div className="health-score">🤖 SMT QUALITY ENGINEER ASSISTANT</div>
            <div className="health-detail">Analyze the current yield + defect data, identify the real drivers, connect them to the SMT defect library, and surface practical checks before you write the report.</div>
          </div>
          <div className="health-stamp">Deterministic analysis · {new Date(analysis.generatedAt).toLocaleTimeString()}</div>
        </div>
      </Card>

      <Card title="🔎 ANALYSIS SCOPE">
        <div className="fw">
          <FilterField label="WEEK" value={week} onChange={setWeek} width={140}
            options={[{ value: 'ALL', label: 'Latest Week' }, ...weeks.map((w) => ({ value: w, label: weekLabel(w) }))]} />
          <FilterField label="CUSTOMER" value={customer} onChange={setCustomer} width={170}
            options={[{ value: 'ALL', label: 'All Customers' }, ...customers]} />
          <FilterField label="MODEL" value={model} onChange={setModel} width={180}
            options={[{ value: 'ALL', label: 'All Models' }, ...models]} />
          <button className="btn bb" onClick={() => { setAsked(''); }}>↻ REFRESH ANALYSIS</button>
        </div>
      </Card>

      <div className="ai-status" style={{ borderColor: `${tone[analysis.status]}55`, background: `${tone[analysis.status]}12` }}>
        <div>
          <div className="ai-kicker">STATUS</div>
          <div className="ai-status-value" style={{ color: tone[analysis.status] }}>{analysis.status}</div>
        </div>
        <div className="ai-headline">{analysis.headline}</div>
        <div className="ai-scope">{analysis.filters.week === 'ALL' ? 'Latest available week' : weekLabel(analysis.filters.week)} · {analysis.filters.customer === 'ALL' ? 'All customers' : analysis.filters.customer} · {analysis.filters.model === 'ALL' ? 'All models' : analysis.filters.model}</div>
      </div>

      <Card title="📌 QUALITY SNAPSHOT">
        <div className="kpi-row">
          {[
            ['YIELD', analysis.kpis.totalInsp ? `${analysis.kpis.yieldOverall.toFixed(2)}%` : '—'],
            ['DPPM', analysis.kpis.totalInsp ? Math.round(analysis.kpis.dppm).toLocaleString() : '—'],
            ['INSPECTED', analysis.kpis.totalInsp.toLocaleString()],
            ['FAILED', analysis.kpis.totalFailed.toLocaleString()],
          ].map(([label, value]) => <div key={label} className="kpi ai-kpi"><div className="kpi-n">{value}</div><div className="kpi-l">{label}</div></div>)}
        </div>
      </Card>

      <div className="row">
        <div className="col">
          <Card title="🚨 PRIORITY FINDINGS">
            {analysis.risks.length ? analysis.risks.map((r, i) => (
              <div className="ai-risk" key={`${r.title}-${i}`}>
                <span className="badge" style={{ color: tone[r.level === 'HIGH' ? 'ACTION REQUIRED' : 'MONITOR'], border: `1px solid ${tone[r.level === 'HIGH' ? 'ACTION REQUIRED' : 'MONITOR']}55`, background: `${tone[r.level === 'HIGH' ? 'ACTION REQUIRED' : 'MONITOR']}12` }}>{r.level}</span>
                <div><strong>{r.title}</strong><div>{r.detail}</div></div>
              </div>
            )) : <div style={{ color: 'var(--yc-muted)' }}>No material risks were detected.</div>}
          </Card>
        </div>
        <div className="col">
          <Card title="✅ RECOMMENDED CHECKS">
            {analysis.recommendations.length ? analysis.recommendations.map((r, i) => <div className="ai-action" key={r}><span>{i + 1}</span><div>{r}</div></div>) : <div style={{ color: 'var(--yc-muted)' }}>No action is recommended from the current data.</div>}
          </Card>
        </div>
      </div>

      <Card title="📊 TOP DEFECT DRIVERS">
        {analysis.topDefects.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>#</th><th>Defect</th><th>Count</th><th>Share</th><th>Trend</th><th>Risk</th><th>Known Category</th></tr></thead>
              <tbody>{analysis.topDefects.map((d) => (
                <tr key={d.defect}>
                  <td>{d.rank}</td><td>{d.defect}</td><td className="num">{d.count}</td><td className="num">{d.sharePct.toFixed(1)}%</td>
                  <td>{d.trend.rising ? '↑ Rising' : d.trend.falling ? '↓ Falling' : '→ Stable'}</td>
                  <td><span className="badge" style={{ color: d.risk === 'HIGH' ? '#ef4444' : d.risk === 'MEDIUM' ? '#f59e0b' : '#22c55e', background: 'transparent' }}>{d.risk}</span></td>
                  <td>{d.category}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div style={{ color: 'var(--yc-muted)' }}>No defects match this analysis scope.</div>}
      </Card>

      {primary && (
        <Card title={`🧠 PRIMARY DEFECT — ${primary.defect}`}>
          <div className="row">
            <div className="col">
              <div className="ai-subtitle">POSSIBLE CAUSES</div>
              {primary.causes.length ? primary.causes.map((c) => <div className="ai-line" key={c}>• {c}</div>) : <div className="ai-line muted">No library match yet. Use the defect Library tab to add context.</div>}
            </div>
            <div className="col">
              <div className="ai-subtitle">STANDARD CHECKS</div>
              {primary.actions.length ? primary.actions.map((a) => <div className="ai-line" key={a}>• {a}</div>) : <div className="ai-line muted">No standard action is mapped.</div>}
            </div>
          </div>
          {primary.capa && <div className="ai-memory"><strong>CAPA MEMORY:</strong> {primary.capa.monitoring || 'Open'}{primary.capa.correctiveAction ? ` · ${primary.capa.correctiveAction}` : ''}{primary.capa.rootCause ? ` · Root cause: ${primary.capa.rootCause}` : ''}</div>}
          {primary.prevention && <div className="ai-memory"><strong>PREVENTION:</strong> {primary.prevention}</div>}
        </Card>
      )}

      <Card title="💬 ASK THE ASSISTANT">
        <div className="fw" style={{ alignItems: 'stretch' }}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} placeholder="Why did yield drop? / What should I check? / Show CAPA history…" />
          <button className="btn bb" onClick={() => ask()}>ASK</button>
        </div>
        <div className="ai-prompts">
          {['Why did yield drop?', 'What are the top defects?', 'What should I check?', 'Show CAPA history'].map((q) => <button key={q} className="ai-prompt" onClick={() => ask(q)}>{q}</button>)}
        </div>
        {asked && <div className="ai-answer"><div className="ai-subtitle">ANSWER</div><div style={{ whiteSpace: 'pre-line' }}>{answer}</div></div>}
      </Card>
    </div>
  );
}

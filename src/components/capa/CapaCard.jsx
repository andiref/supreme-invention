import { useEffect, useMemo, useState } from 'react';
import { capaStatusColor, CAPA_STATUSES, findLibraryEntry, capaEffectiveness } from '../../brain/index.js';
import { saveCapa, deleteCapa } from '../../api/client.js';

const WHY_LABELS = ['WHY 1', 'WHY 2', 'WHY 3', 'WHY 4', 'WHY 5 / ROOT CAUSE'];

export default function CapaCard({ customer, card, capaRecords, defectRows, week, showToast, showConfirm, onDataChanged }) {
  const rec = capaRecords[card.key] || {};
  const [expanded, setExpanded] = useState(false);
  // Structured 5-Why chain. A brand-new chain (no rec.whys yet) starts
  // scaffolded from the Library's generic template for this defect type —
  // a concrete starting point to edit into what actually happened here,
  // rather than 5 blank boxes. Once the chain has its own saved whys,
  // those always win over the template.
  const libraryEntry = useMemo(() => findLibraryEntry(card.defect), [card.defect]);
  const scaffold = libraryEntry?.whys || ['', '', '', '', ''];
  const [whys, setWhys] = useState(rec.whys && rec.whys.length ? rec.whys : scaffold);
  const [correctiveAction, setCorrectiveAction] = useState(rec.correctiveAction || '');
  const [dueDate, setDueDate] = useState(rec.dueDate || '');
  const [pic, setPic] = useState(rec.pic || '');
  const [status, setStatus] = useState(rec.monitoring || 'Open');
  const [saving, setSaving] = useState(false);

  const effectiveness = useMemo(() => capaEffectiveness(rec, defectRows), [rec, defectRows]);

  // Keep local edit fields in sync with the latest loaded snapshot while collapsed.
  useEffect(() => {
    if (!expanded) {
      setWhys(rec.whys && rec.whys.length ? rec.whys : scaffold);
      setCorrectiveAction(rec.correctiveAction || '');
      setDueDate(rec.dueDate || '');
      setPic(rec.pic || '');
      setStatus(rec.monitoring || 'Open');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.whys, rec.correctiveAction, rec.dueDate, rec.pic, rec.monitoring, expanded]);

  const color = capaStatusColor(rec.monitoring || 'Open');
  const weeksTracked = rec.history ? Object.keys(rec.history).length : 0;

  function setWhy(i, value) {
    setWhys((w) => { const next = [...w]; next[i] = value; return next; });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCapa({
        customer, defect: card.defect, week,
        rank: card.rank, count: card.count, model: card.model, comp: card.comp,
        whys, rootCause: whys[4] || '', correctiveAction, dueDate, pic, monitoring: status,
      });
      showToast('✓ CAPA saved');
      onDataChanged?.();
      setExpanded(false);
    } catch (err) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    showConfirm(
      'Delete this CAPA chain?',
      `All history for "${card.defect}" / ${card.model} / ${card.comp} will be removed.`,
      async () => {
        try {
          await deleteCapa({ customer, defect: card.defect, model: card.model, comp: card.comp });
          showToast('Chain deleted');
          onDataChanged?.();
        } catch (err) {
          showToast(err.message);
        }
      },
      'Delete Chain'
    );
  }

  return (
    <div className="dk" style={{ borderColor: `${color}50`, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--yc-text)' }}>
            {card.rank ? `#${card.rank}  ` : ''}{card.defect}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {card.model || '—'} / {card.comp || '—'} · {card.modelCount ?? card.count ?? 0} this week
            {weeksTracked > 0 && ` · tracked ${weeksTracked} wk${weeksTracked > 1 ? 's' : ''}`}
          </div>
          {effectiveness && !effectiveness.insufficientData && (
            <div style={{ fontSize: 10, marginTop: 2, color: effectiveness.improved ? '#22c55e' : effectiveness.worsened ? '#ef4444' : '#f59e0b' }}>
              {effectiveness.improved ? '📉' : effectiveness.worsened ? '📈' : '→'} {effectiveness.deltaPct >= 0 ? '+' : ''}{effectiveness.deltaPct.toFixed(0)}% since action ({effectiveness.beforeAvg.toFixed(1)}/wk → {effectiveness.afterAvg.toFixed(1)}/wk)
            </div>
          )}
        </div>
        <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
          {rec.monitoring || 'Open'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          {effectiveness && (
            <div className="ai-memory" style={{ marginBottom: 8 }}>
              {effectiveness.insufficientData ? (
                <>⏳ Action taken in {effectiveness.actionWeek} — not enough data on either side yet to check if it worked.</>
              ) : (
                <>
                  <strong>EFFECTIVENESS CHECK</strong> — action taken {effectiveness.actionWeek}. Before: {effectiveness.beforeAvg.toFixed(1)}/wk avg ({effectiveness.beforeWeeks} wk{effectiveness.beforeWeeks > 1 ? 's' : ''}). After: {effectiveness.afterAvg.toFixed(1)}/wk avg ({effectiveness.afterWeeks} wk{effectiveness.afterWeeks > 1 ? 's' : ''}).{' '}
                  {effectiveness.improved ? '✅ Trending down — looks like it worked.' : effectiveness.worsened ? '⚠ Trending up despite the recorded action — worth re-checking the fix.' : '→ Roughly flat so far.'}
                  <div style={{ fontSize: 9, color: 'var(--yc-muted)', marginTop: 4 }}>Raw occurrence counts for this exact combo, not a volume-weighted DPPM — a directional signal, not a certified rate.</div>
                </>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9 }}>5-WHY ROOT CAUSE ANALYSIS{libraryEntry ? ' (scaffolded from Library — edit to match what actually happened)' : ''}</label>
            {WHY_LABELS.map((label, i) => (
              <input
                key={label}
                value={whys[i] || ''}
                onChange={(e) => setWhy(i, e.target.value)}
                placeholder={label}
                style={{ marginBottom: i < 4 ? 6 : 0 }}
              />
            ))}
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9 }}>CORRECTIVE ACTION</label>
            <textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="What was/will be done…" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label style={{ fontSize: 9 }}>DUE DATE</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label style={{ fontSize: 9 }}>OWNER (PIC)</label>
              <input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Name" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9 }}>STATUS</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {CAPA_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn bg" onClick={handleSave} disabled={saving}>{saving ? 'SAVING…' : 'SAVE'}</button>
            <button className="btn br" onClick={handleDelete} disabled={saving}>DELETE CHAIN</button>
          </div>
        </div>
      )}
    </div>
  );
}

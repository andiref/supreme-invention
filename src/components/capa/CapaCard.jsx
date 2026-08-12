import { useEffect, useState } from 'react';
import { capaStatusColor, CAPA_STATUSES } from '../../brain/index.js';
import { saveCapa, deleteCapa } from '../../api/client.js';

export default function CapaCard({ customer, card, capaRecords, week, userEmail, showToast, showConfirm }) {
  const rec = capaRecords[card.key] || {};
  const [expanded, setExpanded] = useState(false);
  const [rootCause, setRootCause] = useState(rec.rootCause || '');
  const [correctiveAction, setCorrectiveAction] = useState(rec.correctiveAction || '');
  const [dueDate, setDueDate] = useState(rec.dueDate || '');
  const [pic, setPic] = useState(rec.pic || '');
  const [status, setStatus] = useState(rec.monitoring || 'Open');
  const [saving, setSaving] = useState(false);

  // Keep local edit fields in sync if the realtime record changes underneath us
  // (another device saved) while this card is collapsed.
  useEffect(() => {
    if (!expanded) {
      setRootCause(rec.rootCause || '');
      setCorrectiveAction(rec.correctiveAction || '');
      setDueDate(rec.dueDate || '');
      setPic(rec.pic || '');
      setStatus(rec.monitoring || 'Open');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.rootCause, rec.correctiveAction, rec.dueDate, rec.pic, rec.monitoring, expanded]);

  const color = capaStatusColor(rec.monitoring || 'Open');
  const weeksTracked = rec.history ? Object.keys(rec.history).length : 0;

  async function handleSave() {
    setSaving(true);
    try {
      await saveCapa(userEmail, {
        customer, defect: card.defect, week,
        rank: card.rank, count: card.count, model: card.model, comp: card.comp,
        rootCause, correctiveAction, dueDate, pic, monitoring: status,
      });
      showToast('✓ CAPA saved');
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
          await deleteCapa(userEmail, { customer, defect: card.defect, model: card.model, comp: card.comp });
          showToast('Chain deleted');
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
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
            {card.rank ? `#${card.rank}  ` : ''}{card.defect}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {card.model || '—'} / {card.comp || '—'} · {card.modelCount ?? card.count ?? 0} this week
            {weeksTracked > 0 && ` · tracked ${weeksTracked} wk${weeksTracked > 1 ? 's' : ''}`}
          </div>
        </div>
        <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
          {rec.monitoring || 'Open'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9 }}>ROOT CAUSE</label>
            <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="5-why or direct root cause…" />
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

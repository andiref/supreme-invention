import { useState } from 'react';
import { sortEquipment, equipmentStatusColor, equipmentPriorityColor, isEquipmentDone, EQUIPMENT_STATUSES } from '../../brain/index.js';
import { addEquipment, updateEquipment, deleteEquipment } from '../../api/client.js';
import { timeAgo } from '../../brain/datetime.js';

const PRIORITIES = ['Low', 'Medium', 'High'];

export default function EquipmentView({ equipment, userEmail, showToast, showConfirm }) {
  const [partName, setPartName] = useState('');
  const [machine, setMachine] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const sorted = sortEquipment(equipment);

  async function handleAdd() {
    if (!partName.trim() || !machine.trim()) {
      showToast('Part Name and Equipment/Machine are required');
      return;
    }
    setSubmitting(true);
    try {
      await addEquipment(userEmail, { partName: partName.trim(), equipment: machine.trim(), priority, notes: notes.trim() });
      setPartName(''); setMachine(''); setPriority('Medium'); setNotes('');
      showToast('✓ Part added');
    } catch (err) {
      showToast(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(item, status) {
    setBusyId(item._id);
    try {
      await updateEquipment(userEmail, item._id, { status });
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(item) {
    showConfirm(
      'Delete this part follow-up?',
      `"${item.partName}" for ${item.equipment} will be permanently removed.`,
      async () => {
        setBusyId(item._id);
        try {
          await deleteEquipment(userEmail, item._id);
          showToast('Deleted');
        } catch (err) {
          showToast(err.message);
        } finally {
          setBusyId(null);
        }
      },
      'Delete'
    );
  }

  return (
    <>
      <div className="form-card">
        <div className="form-title">🔧 Add Part Follow-Up</div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Part Name *</label>
            <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="e.g. Feeder Sensor Board" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Equipment/Machine *</label>
            <input value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="e.g. Line 2 - Mounter #3" />
          </div>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Waiting on vendor quote, lead time ~2 weeks" />
        </div>
        <button className="submit-btn" onClick={handleAdd} disabled={submitting}>
          {submitting ? 'Adding…' : '➕ Add Part'}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="summary-title" style={{ padding: '0 4px 8px' }}>🔧 Parts to Follow Up</div>
        {!sorted.length && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 4px' }}>No parts being tracked.</div>}
        {sorted.map((item) => (
          <div
            key={item._id}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: 14, marginBottom: 10, opacity: isEquipmentDone(item.status) ? 0.65 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.partName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.equipment}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: `${equipmentPriorityColor(item.priority)}22`, color: equipmentPriorityColor(item.priority),
                border: `1px solid ${equipmentPriorityColor(item.priority)}55`,
              }}>{item.priority}</span>
            </div>
            {item.notes && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
              <select
                value={item.status}
                onChange={(e) => handleStatusChange(item, e.target.value)}
                disabled={busyId === item._id}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 8,
                  color: equipmentStatusColor(item.status), border: `1px solid ${equipmentStatusColor(item.status)}55`,
                  background: 'var(--surface2)',
                }}
              >
                {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(item.updated || item.created)}</span>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={busyId === item._id}
                  style={{ background: 'none', border: 'none', color: 'var(--critical)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                >🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

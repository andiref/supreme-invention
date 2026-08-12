import { useEffect, useState } from 'react';
import { listRecentImports, undoImport } from '../../api/client.js';
import { timeAgo } from '../../brain/index.js';

export default function RecentImportsList({ userEmail, refreshKey, onUndo, onShowConfirm }) {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRecentImports(userEmail)
      .then((list) => { if (!cancelled) setImports(list); })
      .catch(() => { /* best-effort — don't block the tab on this */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userEmail, refreshKey]);

  function handleUndoClick(imp) {
    onShowConfirm(
      'Undo this import?',
      `This removes ${imp.type === 'defects' ? 'all rows' : 'the changes'} from "${imp.fileName || imp.importId}". This can't be undone.`,
      async () => {
        setUndoingId(imp.importId);
        try {
          await undoImport(userEmail, imp.importId);
          setImports((prev) => prev.map((x) => (x.importId === imp.importId ? { ...x, undone: true } : x)));
          onUndo();
        } catch (err) {
          alert(err.message);
        } finally {
          setUndoingId(null);
        }
      },
      'Undo Import'
    );
  }

  if (loading) return <div style={{ fontSize: 11, color: '#64748b' }}>Loading…</div>;
  if (!imports.length) return <div style={{ fontSize: 11, color: '#64748b' }}>No imports yet.</div>;

  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr><th>When</th><th>Type</th><th>File</th><th>Rows</th><th></th></tr>
        </thead>
        <tbody>
          {imports.map((imp) => (
            <tr key={imp.importId}>
              <td>{timeAgo(imp.created)}</td>
              <td>{imp.type === 'defects' ? 'Defect Data' : 'Prod Volume'}</td>
              <td>{imp.fileName || '—'}</td>
              <td className="num">
                {imp.type === 'defects' ? (imp.count ?? '—') : `${imp.createdCount ?? 0} new / ${imp.updatedCount ?? 0} upd`}
              </td>
              <td>
                {imp.undone ? (
                  <span style={{ color: '#64748b', fontSize: 10 }}>Undone</span>
                ) : (
                  <button
                    className="btn br"
                    style={{ padding: '3px 8px', fontSize: 10 }}
                    onClick={() => handleUndoClick(imp)}
                    disabled={undoingId === imp.importId}
                  >
                    {undoingId === imp.importId ? '…' : 'Undo'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

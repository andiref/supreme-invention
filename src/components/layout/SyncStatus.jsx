export default function SyncStatus({ syncing, lastSyncedAt, mobile, onRefresh }) {
  const label = syncing ? 'Syncing…' : lastSyncedAt ? 'Cloud synced' : 'Ready';
  const timeStr = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  const button = (
    <button
      className="btn bx"
      onClick={onRefresh}
      disabled={syncing}
      style={{ padding: '3px 8px', fontSize: 10, marginLeft: 8 }}
      title="Read the latest data from Firebase"
    >
      {syncing ? '…' : '↻ Refresh'}
    </button>
  );

  if (mobile) {
    return (
      <div id="sync-bar-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)', padding: '4px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="sync-dot ready" />
        <span>{label}</span>
        <span style={{ marginLeft: 'auto' }}>{timeStr}</span>
        {button}
      </div>
    );
  }

  return (
    <div id="sync-bar" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
      <div className="sync-dot ready" />
      <span>{label}</span>
      <span style={{ marginLeft: 8, color: 'var(--muted)' }}>{timeStr}</span>
      {button}
    </div>
  );
}

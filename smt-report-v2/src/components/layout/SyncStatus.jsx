import { useEffect, useState } from 'react';

/** Small "Connecting… / Live" dot + label, matching #sync-dot's .live/.error states. */
export default function SyncStatus({ connected, mobile }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const dotClass = connected === null ? '' : connected ? 'live' : 'error';
  const label = connected === null ? 'Connecting…' : connected ? 'Live' : 'Reconnecting…';
  const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (mobile) {
    return (
      <div id="sync-bar-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)', padding: '4px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className={`sync-dot ${dotClass}`} />
        <span>{label}</span>
        <span style={{ marginLeft: 'auto' }}>{timeStr}</span>
      </div>
    );
  }

  return (
    <div id="sync-bar" style={{ flex: 1 }}>
      <div className={`sync-dot ${dotClass}`} />
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{timeStr}</span>
    </div>
  );
}

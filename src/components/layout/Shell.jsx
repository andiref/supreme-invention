import SyncStatus from './SyncStatus.jsx';

const VIEWS = [
  { id: 'yield', label: '📊 Yield' },
  { id: 'time', label: '⏱ Time' },
  { id: 'library', label: '📖 Library' },
  { id: 'report', label: '📧 Report' },
  { id: 'equipment', label: '🔧 Equipment' },
  { id: 'health', label: '🛡 Data Health' },
  { id: 'assistant', label: '🤖 Quality Assistant' },
];

export default function Shell({ user, currentView, onNavigate, syncing, lastSyncedAt, onRefresh, isLight, onToggleTheme, onLogout, children }) {
  const initial = (user?.email || 'U')[0].toUpperCase();
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <div id="sidebar">
        <div id="sidebar-logo">
          <div className="s-title">⚙️ SMT Quality Engineer</div>
          <div className="s-sub">{dateLabel}</div>
        </div>
        <div id="sidebar-nav">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`snav-btn ${currentView === v.id ? 'active' : ''}`}
              onClick={() => onNavigate(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div id="sidebar-bottom">
          <div className="sb-user">
            <div className="user-avatar">{initial}</div>
            <div>
              <div className="sb-name">{user?.email}</div>
              <div className="sb-role">Owner</div>
            </div>
          </div>
          <button className="sb-theme-toggle" onClick={onToggleTheme}>
            {isLight ? '🌙 Dark mode' : '☀️ Light mode'}
          </button>
          <button className="sb-logout" onClick={onLogout}>🚪 Logout</button>
        </div>
      </div>

      {/* ─── Desktop right column ─── */}
      <div id="desktop-right">
        <div id="desktop-topbar">
          <SyncStatus syncing={syncing} lastSyncedAt={lastSyncedAt} onRefresh={onRefresh} />
          <div id="desktop-counts">
            <button className="theme-toggle" onClick={onToggleTheme} title="Toggle light/dark mode">
              {isLight ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <SyncStatus syncing={syncing} lastSyncedAt={lastSyncedAt} onRefresh={onRefresh} mobile />

        <div id="header">
          <div className="header-top">
            <div>
              <div className="header-label">{dateLabel}</div>
              <div className="header-title">SMT Quality Engineer</div>
            </div>
            <div className="header-counts">
              <div className="user-menu">
                <div className="user-avatar">{initial}</div>
                <span className="user-name-tag">{user?.email}</span>
                <button className="theme-toggle" onClick={onToggleTheme} title="Toggle light/dark mode">
                  {isLight ? '☀️' : '🌙'}
                </button>
                <button className="logout-btn-visible" onClick={onLogout}>🚪 Logout</button>
              </div>
            </div>
          </div>
        </div>

        <div id="nav">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`nav-btn ${currentView === v.id ? 'active' : ''}`}
              onClick={() => onNavigate(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div id="main">{children}</div>
      </div>
    </>
  );
}

import { Component } from 'react';

// Without this, any uncaught error during render — a bad row in Firebase
// with a missing field, a future bug, anything — unmounts the entire React
// tree and leaves a blank white page with nothing but a browser console
// error to go on. This catches that at the top level and shows a
// recoverable message instead. It does NOT fix the underlying error; it's
// a last-resort net so a future issue degrades gracefully instead of
// looking like the site is completely broken.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught render error:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ marginBottom: 8 }}>⚠ Something went wrong</h2>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            The app hit an unexpected error while rendering. This is usually caused by one malformed
            record rather than the app itself being broken. Try refreshing — if it keeps happening,
            check Data Health for rows with missing fields once the app loads again.
          </p>
          <details style={{ marginBottom: 16, fontSize: 12, color: '#94a3b8' }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{String(this.state.error?.message || this.state.error)}</pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 20px', borderRadius: 8, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

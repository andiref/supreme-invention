import { useState } from 'react';

export default function LoginScreen({ onLogin, onResetPassword, error, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setResetMessage('');
    if (email.trim() && password) onLogin(email.trim(), password);
  }

  async function handleReset() {
    try {
      setResetMessage('');
      await onResetPassword(email);
      setResetMessage('Password reset email sent.');
    } catch (err) {
      setResetMessage(err.message || 'Could not send reset email.');
    }
  }

  return (
    <div id="login-overlay">
      <div id="login-box">
        <div className="logo">⚙️ SMT Report</div>
        <div className="sub">Shift &amp; Quality · <span>Secure Login</span></div>
        <form id="login-form" autoComplete="on" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" placeholder="you@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <div className="login-error">{error}</div>}
          {resetMessage && <div className="login-role-hint">{resetMessage}</div>}
          <button className="login-btn" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In →'}</button>
          <button type="button" className="login-link-btn" onClick={handleReset} disabled={loading}>Forgot password?</button>
        </form>
        <div className="login-role-hint">Access is verified by Firebase Authentication and restricted to the configured owner account.</div>
      </div>
    </div>
  );
}

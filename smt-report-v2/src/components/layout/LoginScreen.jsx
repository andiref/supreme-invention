import { useState } from 'react';

export default function LoginScreen({ onLogin, error, loading }) {
  const [email, setEmail] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (email.trim()) onLogin(email.trim());
  }

  return (
    <div id="login-overlay">
      <div id="login-box">
        <div className="logo">⚙️ SMT Report</div>
        <div className="sub">Shift &amp; Quality · <span>Login</span></div>
        <form id="login-form" autoComplete="off" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@email.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}

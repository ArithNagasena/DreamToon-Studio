import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate />;

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login({ identifier, password });
      nav(loc.state?.from?.pathname || '/', { replace: true });
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit} noValidate>
        <div className="auth__mark" aria-hidden="true">C</div>
        <h1 className="auth__title">Character Designer</h1>
        <p className="auth__sub">Sign in to continue</p>

        {err && <div style={{ background: 'var(--danger-soft)', border: '1px solid #E7C4BF', color: 'var(--danger)',
                              borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 'var(--t-sm)',
                              marginBottom: 'var(--s4)', fontWeight: 500 }} role="alert" data-testid="login-error">{err}</div>}

        <label className="field">
          <span className="field__label">Email or username</span>
          <input className="input" type="text" value={identifier} autoComplete="username"
                 onChange={e => setIdentifier(e.target.value)} data-testid="email" required />
          <span className="field__hint">Whichever you remember — both work.</span>
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input className="input" type="password" value={password} autoComplete="current-password"
                 onChange={e => setPassword(e.target.value)} data-testid="password" required />
        </label>

        <button className="btn btn--primary btn--lg btn--block" disabled={busy} data-testid="login-submit">
          {busy ? 'Signing in…' : 'Log in'}
        </button>

        <p className="auth__alt">
          New here? <Link to="/register" className="linkbtn">Create an account</Link>
        </p>
      </form>
    </div>
  );
}

function Navigate() {
  const nav = useNavigate();
  React.useEffect(() => { nav('/', { replace: true }); }, [nav]);
  return null;
}

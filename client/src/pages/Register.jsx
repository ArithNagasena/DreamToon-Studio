import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';

const score = (p) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
};
const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const COLORS = ['#A32B22', '#B4530A', '#B4530A', '#2F6B4F', '#2F6B4F'];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', username: '', email: '', password: '', confirm: '', role: 'designer' });
  // Until the designer types one, the handle follows the email — most people
  // want the obvious thing, and nobody should have to invent two names.
  const [handleEdited, setHandleEdited] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const s = useMemo(() => score(f.password), [f.password]);
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const setUsername = (e) => {
    setHandleEdited(true);
    setF(v => ({ ...v, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }));
  };
  const setEmail = (e) => {
    const email = e.target.value;
    setF(v => ({
      ...v, email,
      username: handleEdited ? v.username
        : email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24),
    }));
  };
  const blur = (k) => () => setTouched(t => ({ ...t, [k]: true }));

  const emailBad = touched.email && f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email);
  const handleBad = touched.username && f.username && !/^[a-z0-9._-]{3,24}$/.test(f.username);
  const emailOk  = touched.email && f.email && !emailBad;
  const mismatch = touched.confirm && f.confirm && f.confirm !== f.password;

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    if (f.confirm !== f.password) { setErrors({ confirm: 'The two passwords do not match.' }); return; }
    setBusy(true);
    try {
      await register({ name: f.name, username: f.username, email: f.email, password: f.password, role: f.role });
      nav('/', { replace: true });
    } catch (ex) {
      setErrors(ex.errors || { form: ex.message });
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit} noValidate style={{ maxWidth: 460 }}>
        <h1 className="auth__title">Create your account</h1>
        <p className="auth__sub">A few fields. You can change every one of them later.</p>

        {errors.form && <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>{errors.form}</div>}

        <label className="field">
          <span className="field__label">Full name</span>
          <input className={`input ${errors.name ? 'input--error' : ''}`} value={f.name}
                 onChange={set('name')} onBlur={blur('name')} data-testid="reg-name" required />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>

        <label className="field">
          <span className="field__label">Work email</span>
          <input className={`input ${(emailBad || errors.email) ? 'input--error' : ''}`} type="email" value={f.email}
                 onChange={setEmail} onBlur={blur('email')} data-testid="reg-email" required />
          {(emailBad || errors.email) && <span className="field__error" data-testid="reg-email-error">
            {errors.email || 'Add a domain — for example name@company.com'}</span>}
          {emailOk && !errors.email && <span className="field__ok">Looks right</span>}
        </label>

        <label className="field">
          <span className="field__label">Username</span>
          <input className={`input ${(handleBad || errors.username) ? 'input--error' : ''}`} value={f.username}
                 onChange={setUsername} onBlur={blur('username')} data-testid="reg-username"
                 autoComplete="username" maxLength={24} required />
          {(handleBad || errors.username)
            ? <span className="field__error" data-testid="reg-username-error">
                {errors.username || '3–24 characters: letters, numbers, dot, underscore or hyphen.'}</span>
            : <span className="field__hint">You can sign in with this instead of your email.</span>}
        </label>

        <label className="field">
          <span className="field__label">Password</span>
          <input className={`input ${errors.password ? 'input--error' : ''}`} type="password" value={f.password}
                 onChange={set('password')} onBlur={blur('password')} data-testid="reg-password" required />
          {f.password && (
            <>
              <div className="strength"><div className="strength__fill"
                   style={{ width: `${((s + 1) / 5) * 100}%`, background: COLORS[s] }} /></div>
              <span className="field__hint" style={{ color: COLORS[s], fontWeight: 500 }}>{LABELS[s]}</span>
            </>
          )}
          {errors.password && <span className="field__error">{errors.password}</span>}
        </label>

        <label className="field">
          <span className="field__label">Confirm password</span>
          <input className={`input ${(mismatch || errors.confirm) ? 'input--error' : ''}`} type="password"
                 value={f.confirm} onChange={set('confirm')} onBlur={blur('confirm')} data-testid="reg-confirm" required />
          {(mismatch || errors.confirm) && <span className="field__error">{errors.confirm || 'The two passwords do not match.'}</span>}
        </label>

        <label className="field">
          <span className="field__label">Role</span>
          <select className="input" value={f.role} onChange={set('role')} data-testid="reg-role">
            <option value="designer">Designer</option>
            <option value="artlead">Art lead</option>
          </select>
        </label>

        <button className="btn btn--primary btn--lg btn--block" disabled={busy} data-testid="reg-submit">
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="auth__alt">Already have an account? <Link to="/login" className="linkbtn">Log in</Link></p>
      </form>
    </div>
  );
}

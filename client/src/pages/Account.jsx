import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Avatar from '../components/Avatar.jsx';
import { useAuth } from '../lib/useAuth.jsx';
import { api } from '../lib/api.js';
import { useToasts } from '../lib/useToasts.jsx';
import { fileToAvatarDataUrl } from '../lib/image.js';

export default function Account() {
  const { user, stats, logout, updateProfile } = useAuth();
  const nav = useNavigate();
  const { push } = useToasts();

  const [profile, setProfile] = useState({ name: user.name, username: user.username ?? '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const dirty = profile.name !== user.name || profile.username !== (user.username ?? '');

  async function saveProfile(e) {
    e.preventDefault();
    setProfileErrors({}); setSavingProfile(true);
    try {
      await updateProfile({ name: profile.name, username: profile.username });
      push({ message: 'Profile updated' });
    } catch (ex) {
      setProfileErrors(ex.errors || { form: ex.message });
    } finally { setSavingProfile(false); }
  }

  async function pickPicture(e) {
    const file = e.target.files?.[0];
    e.target.value = '';           // choosing the same file twice must still fire
    if (!file) return;
    setUploading(true);
    try {
      const avatar = await fileToAvatarDataUrl(file);
      await updateProfile({ avatar });
      push({ message: 'Profile picture updated' });
    } catch (ex) {
      push({ message: ex.errors?.avatar || ex.message, tone: 'error' });
    } finally { setUploading(false); }
  }

  async function removePicture() {
    setUploading(true);
    try {
      await updateProfile({ avatar: null });
      push({ message: 'Profile picture removed' });
    } catch (ex) {
      push({ message: ex.message, tone: 'error' });
    } finally { setUploading(false); }
  }

  async function change(e) {
    e.preventDefault();
    setErrors({}); setBusy(true);
    try {
      await api.changePassword(pw);
      setPw({ currentPassword: '', newPassword: '' });
      push({ message: 'Password updated' });
    } catch (ex) {
      setErrors(ex.errors || { form: ex.message });
    } finally { setBusy(false); }
  }

  const since = stats?.memberSince ? new Date(stats.memberSince).toLocaleDateString() : null;

  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <div className="page__inner" style={{ maxWidth: 760 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => nav('/')} style={{ marginBottom: 16 }}>
            ← Back to library
          </button>
          <h1 className="page__title" style={{ marginBottom: 24 }}>Account</h1>

          {/* ---- picture and the size of the account's work ---- */}
          <section className="card" style={{ padding: 24, marginBottom: 20 }}>
            <span className="field__label">Profile picture</span>
            <div className="profilerow">
              <Avatar user={user} size={88} className="avatar--lg" />
              <div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn--sm" disabled={uploading}
                          onClick={() => fileRef.current?.click()} data-testid="avatar-upload">
                    {uploading ? 'Working…' : user.avatar ? 'Change picture' : 'Upload picture'}
                  </button>
                  {user.avatar && (
                    <button className="btn btn--sm btn--danger" disabled={uploading}
                            onClick={removePicture} data-testid="avatar-remove">Remove</button>
                  )}
                </div>
                <p className="field__hint" style={{ marginTop: 10 }}>
                  PNG, JPEG or WebP. It is cropped square and scaled to 256 px before it leaves this machine.
                </p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
                   onChange={pickPicture} className="sr-only" data-testid="avatar-input" />

            <div className="statrow" data-testid="profile-stats">
              <Stat label="Saved characters" value={stats?.characterCount ?? '—'} testId="stat-characters" />
              <Stat label="Saved templates" value={stats?.templateCount ?? '—'} testId="stat-templates" />
              <Stat label="Member since" value={since ?? '—'} />
            </div>
          </section>

          {/* ---- name and handle ---- */}
          <form className="card" style={{ padding: 24, marginBottom: 20 }} onSubmit={saveProfile}>
            <span className="field__label">Profile</span>
            {profileErrors.form && <p className="field__error">{profileErrors.form}</p>}
            <div className="formgrid" style={{ marginTop: 12 }}>
              <label className="field">
                <span className="field__label">Full name</span>
                <input className={`input ${profileErrors.name ? 'input--error' : ''}`} value={profile.name}
                       onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                       data-testid="profile-name" maxLength={80} />
                {profileErrors.name && <span className="field__error">{profileErrors.name}</span>}
              </label>
              <label className="field">
                <span className="field__label">Username</span>
                <input className={`input ${profileErrors.username ? 'input--error' : ''}`} value={profile.username}
                       onChange={e => setProfile(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                       data-testid="profile-username" maxLength={24} />
                {profileErrors.username
                  ? <span className="field__error">{profileErrors.username}</span>
                  : <span className="field__hint">Also signs you in.</span>}
              </label>
            </div>
            <label className="field">
              <span className="field__label">Work email</span>
              <input className="input" value={user.email} readOnly />
              <span className="field__hint">Your art lead changes the email on an account.</span>
            </label>
            <label className="field" style={{ marginBottom: 16 }}>
              <span className="field__label">Role</span>
              <input className="input" value={user.role === 'artlead' ? 'Art lead' : 'Designer'} readOnly />
            </label>
            <button className="btn" disabled={savingProfile || !dirty} data-testid="save-profile">
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>

          <form className="card" style={{ padding: 24, marginBottom: 20 }} onSubmit={change}>
            <span className="field__label">Password</span>
            {errors.form && <p className="field__error">{errors.form}</p>}
            <div className="formgrid" style={{ marginTop: 12 }}>
              <label className="field">
                <span className="field__label">Current password</span>
                <input className={`input ${errors.currentPassword ? 'input--error' : ''}`} type="password"
                       value={pw.currentPassword} data-testid="cur-pw"
                       onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} />
                {errors.currentPassword && <span className="field__error">{errors.currentPassword}</span>}
              </label>
              <label className="field">
                <span className="field__label">New password</span>
                <input className={`input ${errors.newPassword ? 'input--error' : ''}`} type="password"
                       value={pw.newPassword} data-testid="new-pw"
                       onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} />
                {errors.newPassword && <span className="field__error">{errors.newPassword}</span>}
              </label>
            </div>
            <button className="btn" disabled={busy} data-testid="change-pw">Update password</button>
          </form>

          <section className="card" style={{ padding: 24 }}>
            <span className="field__label">Access</span>
            <p style={{ color: 'var(--text-2)', margin: '12px 0 18px', fontSize: 'var(--t-base)' }}>
              You are {user.role === 'artlead' ? 'an art lead' : 'a designer'}. You can see only your own
              characters.{user.role === 'artlead' && ' Art leads can also manage designer accounts.'}
            </p>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => nav('/settings')} data-testid="go-settings">Settings</button>
              {user.role === 'artlead' && (
                <button className="btn" onClick={() => nav('/admin')} data-testid="go-admin">Manage designers</button>
              )}
              <button className="btn btn--danger" onClick={() => { logout(); nav('/login'); }}>Log out</button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, testId }) {
  return (
    <div className="stat">
      <span className="stat__value" data-testid={testId}>{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Avatar from '../components/Avatar.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/useAuth.jsx';
import { useToasts } from '../lib/useToasts.jsx';

const when = (iso) => {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};

/** FR14 — the art lead controls access. Deactivation is not deletion. */
export default function Admin() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { push } = useToasts();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers((await api.adminUsers()).users); }
    catch (e) { push({ message: e.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  async function apply(u, status) {
    setConfirm(null);
    try {
      await api.setUserStatus(u._id, status);
      setUsers(list => list.map(x => (x._id === u._id ? { ...x, status } : x)));
      push({ message: `${u.name} ${status === 'active' ? 'reactivated' : 'deactivated'}` });
    } catch (e) { push({ message: e.message, tone: 'error' }); }
  }

  const active = users.filter(u => u.status === 'active').length;

  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <div className="page__inner">
          <button className="btn btn--ghost btn--sm" onClick={() => nav('/')} style={{ marginBottom: 16 }}>
            ← Back to library
          </button>
          <div className="page__head">
            <div>
              <h1 className="page__title">Designers</h1>
              <p className="page__sub">{loading ? 'Loading…' : `${users.length} accounts · ${active} active`}</p>
            </div>
          </div>

          <table className="table" data-testid="admin-table">
            <thead>
              <tr>
                <th>Designer</th><th>Email</th><th>Role</th><th>Status</th>
                <th>Characters</th><th>Last active</th><th />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar user={u} size={28} />
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {u.name}{u._id === user._id && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}
                        </div>
                        {u.username && <div className="muted" style={{ fontSize: 'var(--t-xs)' }}>@{u.username}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>{u.role === 'artlead' ? 'Art lead' : 'Designer'}</td>
                  <td><span className={`badge ${u.status === 'active' ? 'badge--ok' : 'badge--off'}`}>
                    {u.status === 'active' ? 'Active' : 'Deactivated'}</span></td>
                  <td>{u.characterCount}</td>
                  <td className="muted">{when(u.lastActiveAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {u._id !== user._id && (
                      <button className={`btn btn--sm ${u.status === 'active' ? 'btn--danger' : ''}`}
                              onClick={() => (u.status === 'active' ? setConfirm(u) : apply(u, 'active'))}
                              data-testid={`toggle-${u.email}`}>
                        {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="note" style={{ marginTop: 20, maxWidth: 720 }}>
            <strong>Deactivation is not deletion.</strong> A deactivated designer cannot sign in, but every
            character they made stays in the library and keeps its history.
          </div>
        </div>
      </main>

      {confirm && (
        <div className="scrim" role="dialog" aria-modal="true"
             onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="modal">
            <h2 className="modal__title">Deactivate {confirm.name}?</h2>
            <p className="modal__body">
              They will not be able to sign in. Their {confirm.characterCount} character
              {confirm.characterCount === 1 ? '' : 's'} stay in the library and you can reactivate them at any time.
            </p>
            <div className="modal__foot">
              <button className="btn btn--primary" autoFocus onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={() => apply(confirm, 'deactivated')}
                      data-testid="confirm-deactivate">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

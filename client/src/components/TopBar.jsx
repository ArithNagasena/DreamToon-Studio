import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import Avatar from './Avatar.jsx';

export default function TopBar({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, []);

  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="topbar__mark" aria-hidden="true">D</span>
        <span>DreamToon Studio</span>
      </Link>
      {children}
      <div className="spacer" />
      <div className="usermenu" ref={ref}>
        <button className="usermenu__btn" aria-haspopup="menu" aria-expanded={open}
                onClick={() => setOpen(o => !o)} data-testid="usermenu">
          <Avatar user={user} size={26} />
          <span style={{ fontSize: 'var(--t-sm)' }}>{user?.name?.split(' ')[0]}</span>
          <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>▾</span>
        </button>
        {open && (
          <div className="usermenu__panel" role="menu">
            <div className="row" style={{ gap: 10, padding: '8px 12px 10px', borderBottom: '1px solid var(--line)', marginBottom: 6 }}>
              <Avatar user={user} size={38} />
              <div>
              <div style={{ fontWeight: 600 }}>{user?.name}</div>
              <div className="muted" style={{ fontSize: 'var(--t-xs)' }}>{user?.username ? '@' + user.username : user?.email}</div>
              <div className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 2 }}>
                {user?.role === 'artlead' ? 'Art lead' : 'Designer'}
              </div>
              </div>
            </div>
            <button className="menuitem" role="menuitem" onClick={() => { setOpen(false); nav('/account'); }}>
              Account and profile
            </button>
            <button className="menuitem" role="menuitem" onClick={() => { setOpen(false); nav('/settings'); }}
                    data-testid="menu-settings">
              Settings
            </button>
            {user?.role === 'artlead' && (
              <button className="menuitem" role="menuitem" onClick={() => { setOpen(false); nav('/admin'); }}
                      data-testid="menu-admin">
                Manage designers
              </button>
            )}
            <button className="menuitem menuitem--danger" role="menuitem"
                    onClick={() => { logout(); nav('/login'); }} data-testid="menu-logout">
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

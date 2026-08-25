import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/useAuth.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Library from './pages/Library.jsx';
import NewCharacter from './pages/NewCharacter.jsx';
import Editor from './pages/Editor.jsx';
import Account from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';
import Settings from './pages/Settings.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';

function Protected({ children, artLeadOnly = false }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="auth"><span className="muted">Loading…</span></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (artLeadOnly && user.role !== 'artlead') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/"            element={<Protected><Library /></Protected>} />
        <Route path="/new"         element={<Protected><NewCharacter /></Protected>} />
        <Route path="/c/:id"       element={<Protected><Editor /></Protected>} />
        <Route path="/account"     element={<Protected><Account /></Protected>} />
        <Route path="/settings"    element={<Protected><Settings /></Protected>} />
        <Route path="/admin"       element={<Protected artLeadOnly><Admin /></Protected>} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

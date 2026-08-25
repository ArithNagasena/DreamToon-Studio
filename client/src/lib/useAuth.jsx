import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // How much work the account holds — shown on the profile, refreshed after
  // anything that changes the count rather than polled.
  const [stats, setStats] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.me()
      .then(d => { setUser(d.user); setStats(d.stats ?? null); })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const d = await api.me();
      setUser(d.user); setStats(d.stats ?? null);
      return d.user;
    } catch { return null; }
  }, []);

  const login = useCallback(async (creds) => {
    const d = await api.login(creds);
    setToken(d.token); setUser(d.user);
    refresh();
    return d.user;
  }, [refresh]);

  const register = useCallback(async (body) => {
    const d = await api.register(body);
    setToken(d.token); setUser(d.user);
    refresh();
    return d.user;
  }, [refresh]);

  const updateProfile = useCallback(async (patch) => {
    const d = await api.updateProfile(patch);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); setStats(null); }, []);

  return (
    <Ctx.Provider value={{ user, stats, ready, login, register, logout, updateProfile, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

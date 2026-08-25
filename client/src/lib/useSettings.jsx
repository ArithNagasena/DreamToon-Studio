import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Application preferences.
 *
 * These are per-machine choices about how the tool behaves, not part of any
 * character, so they live in localStorage rather than on the account: a
 * designer at a shared studio workstation should not inherit someone else's
 * grid setting, and the editor must be able to read them before the profile
 * request has come back.
 */
const KEY = 'cd.settings';

export const DEFAULT_SETTINGS = {
  theme: 'system',          // system | light | dark
  defaultView: '2d',        // which view a character opens in
  defaultPose: 'auto',      // 'auto' opens whichever pose the shape is drawn in
  showGrid: true,
  snapCm: 0.5,              // 0 turns snapping off
  autosaveSeconds: 60,      // 0 turns autosave off
  confirmDelete: true,
  lockRatio: false,
  exportResolution: 'screen',
  defaultCanvas: { width: 20, height: 20 },
  rulerUnit: 'cm',          // cm | mm | inch
};

export const UNIT_CHOICES = [
  { value: 'cm', label: 'Centimetres (cm)' },
  { value: 'mm', label: 'Millimetres (mm)' },
  { value: 'inch', label: 'Inches (in)' },
];

export const AUTOSAVE_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
];

export const SNAP_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 0.25, label: '0.25 cm' },
  { value: 0.5, label: '0.5 cm' },
  { value: 1, label: '1 cm' },
];

const Ctx = createContext(null);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      defaultCanvas: { ...DEFAULT_SETTINGS.defaultCanvas, ...(raw.defaultCanvas || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  // The theme is an attribute on <html> so the CSS can answer it without any
  // component knowing which elements need repainting.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }, [settings]);

  const set = useCallback((patch) => setSettings(s => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  const value = useMemo(() => ({ settings, set, reset }), [settings, set, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx) ?? { settings: DEFAULT_SETTINGS, set: () => {}, reset: () => {} };

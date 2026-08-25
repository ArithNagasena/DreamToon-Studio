import React from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { useSettings, AUTOSAVE_CHOICES, SNAP_CHOICES, DEFAULT_SETTINGS } from '../lib/useSettings.jsx';
import { useToasts } from '../lib/useToasts.jsx';
import { CANVAS_LIMITS, POSES } from '@shared/character.js';

/**
 * Preferences that decide how the tool behaves before a designer touches
 * anything: which view a character opens in, whether the grid is on, how
 * often work is saved. Every one of them is still changeable inside the
 * editor — this page only chooses the starting position.
 */
export default function Settings() {
  const nav = useNavigate();
  const { settings, set, reset } = useSettings();
  const { push } = useToasts();
  const [lo, hi] = CANVAS_LIMITS.width;

  const setCanvas = (key) => (e) => {
    const n = Number(e.target.value);
    set({ defaultCanvas: { ...settings.defaultCanvas, [key]: Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 20)) } });
  };

  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <div className="page__inner" style={{ maxWidth: 760 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => nav('/')} style={{ marginBottom: 16 }}>
            ← Back to library
          </button>
          <div className="page__head" style={{ marginBottom: 24 }}>
            <div>
              <h1 className="page__title">Settings</h1>
              <p className="page__sub">
                Kept on this computer, so a shared workstation never hands your setup to the next designer.
              </p>
            </div>
          </div>

          <section className="card settings__card" data-testid="settings-appearance">
            <h2 className="settings__title">Appearance</h2>
            <Choice
              label="Theme"
              hint="Follow the operating system, or pin one."
              value={settings.theme}
              onChange={v => set({ theme: v })}
              testId="set-theme"
              options={[
                { value: 'system', label: 'Match system' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </section>

          <section className="card settings__card" data-testid="settings-editor">
            <h2 className="settings__title">Editor defaults</h2>

            <Choice
              label="Open characters in"
              hint="The view a character shows first."
              value={settings.defaultView}
              onChange={v => set({ defaultView: v })}
              testId="set-view"
              options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]}
            />

            <Choice
              label="2D pose"
              hint="Automatic opens each shape in the elevation it was drawn in — a quadruped in profile, a person facing you."
              value={settings.defaultPose}
              onChange={v => set({ defaultPose: v })}
              testId="set-pose"
              options={[
                { value: 'auto', label: 'Automatic' },
                ...POSES.map(p => ({ value: p.key, label: p.label })),
              ]}
            />

            <Toggle
              label="Show the grid"
              hint="Rules both canvases in centimetres."
              checked={settings.showGrid}
              onChange={v => set({ showGrid: v })}
              testId="set-grid"
            />

            <Choice
              label="Snap to grid"
              hint="How far apart the positions a drag can land on are."
              value={String(settings.snapCm)}
              onChange={v => set({ snapCm: Number(v) })}
              testId="set-snap"
              options={SNAP_CHOICES.map(c => ({ value: String(c.value), label: c.label }))}
            />

            <Toggle
              label="Lock aspect ratio when resizing elements"
              hint="Off lets width and height move independently."
              checked={settings.lockRatio}
              onChange={v => set({ lockRatio: v })}
              testId="set-lock"
            />
          </section>

          <section className="card settings__card" data-testid="settings-safety">
            <h2 className="settings__title">Saving and safety</h2>

            <Choice
              label="Autosave"
              hint="Explicit saving and undo work the same whatever this says."
              value={String(settings.autosaveSeconds)}
              onChange={v => set({ autosaveSeconds: Number(v) })}
              testId="set-autosave"
              options={AUTOSAVE_CHOICES.map(c => ({ value: String(c.value), label: c.label }))}
            />

            <Toggle
              label="Ask before deleting a character"
              hint="Deleting can be undone for ten seconds either way."
              checked={settings.confirmDelete}
              onChange={v => set({ confirmDelete: v })}
              testId="set-confirm"
            />
          </section>

          <section className="card settings__card" data-testid="settings-new">
            <h2 className="settings__title">New projects</h2>
            <div className="settings__row">
              <div className="settings__label">
                <span>Default artboard</span>
                <span className="settings__hint">The size a blank project starts at, in centimetres.</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input className="num" type="number" min={lo} max={hi} step="0.5"
                       value={settings.defaultCanvas.width} onChange={setCanvas('width')}
                       aria-label="Default canvas width in centimetres" data-testid="set-canvas-w" />
                <span aria-hidden="true" className="muted">×</span>
                <input className="num" type="number" min={lo} max={hi} step="0.5"
                       value={settings.defaultCanvas.height} onChange={setCanvas('height')}
                       aria-label="Default canvas height in centimetres" data-testid="set-canvas-h" />
                <span className="muted">cm</span>
              </div>
            </div>

            <Choice
              label="Export image size"
              hint="Which resolution the export dialog offers first."
              value={settings.exportResolution}
              onChange={v => set({ exportResolution: v })}
              testId="set-res"
              options={[{ value: 'screen', label: 'Standard' }, { value: 'print', label: 'High' }]}
            />
          </section>

          <div className="row" style={{ gap: 12, marginTop: 24 }}>
            <button className="btn btn--danger" data-testid="settings-reset"
                    onClick={() => { reset(); push({ message: 'Settings restored to their defaults' }); }}>
              Restore defaults
            </button>
            <span className="muted" style={{ fontSize: 'var(--t-xs)' }}>
              Defaults: {DEFAULT_SETTINGS.theme} theme, {DEFAULT_SETTINGS.defaultView.toUpperCase()} view,
              autosave every {DEFAULT_SETTINGS.autosaveSeconds} seconds.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

function Choice({ label, hint, value, onChange, options, testId }) {
  return (
    <div className="settings__row">
      <div className="settings__label">
        <span>{label}</span>
        {hint && <span className="settings__hint">{hint}</span>}
      </div>
      <div className="seg" role="group" aria-label={label} data-testid={testId}>
        {options.map(o => (
          <button key={o.value} className="seg__btn" aria-pressed={value === o.value}
                  onClick={() => onChange(o.value)} data-testid={`${testId}-${o.value}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, testId }) {
  return (
    <label className="settings__row settings__row--click">
      <div className="settings__label">
        <span>{label}</span>
        {hint && <span className="settings__hint">{hint}</span>}
      </div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
             data-testid={testId} />
    </label>
  );
}

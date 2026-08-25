import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Character2D from '../components/Character2D.jsx';
import Character3D from '../components/Character3D.jsx';
import { api } from '../lib/api.js';
import { useToasts } from '../lib/useToasts.jsx';
import { useAuth } from '../lib/useAuth.jsx';
import { useSettings } from '../lib/useSettings.jsx';
import {
  PALETTE, PALETTE_BY_NAME, partsOf, colorOf, colorTokenOf, colorLabel, hexOf,
  isHexColor, SHAPES,
  ELEMENT_KINDS, ELEMENT_KEYS, MAX_ELEMENTS, makeElement,
  canvasOf, cmToUnits, unitsToCm, CANVAS_LIMITS, DEFAULT_CANVAS,
  offsetOf, alignOffset, DEFAULT_OFFSET, boundsOf,
  variantAxesOf, variantsOf, hiddenOf, optionalPartsOf, groupsOf, bulkPartsOf,
  POSES, drawnPoseOf, isDrawnPose,
} from '@shared/character.js';
import { characterStats, blobToDataUrl, downloadBlob, slug } from '../lib/stats.js';

// The PNG/PDF pipeline pulls in jsPDF, so it is fetched only when someone
// actually exports rather than on every page load.
const loadExporters = () => import('../lib/exporters.js');

const isElementSel = (sel) => typeof sel === 'string' && sel.startsWith('element:');
const selIdOf = (sel) => (isElementSel(sel) ? sel.slice('element:'.length) : null);

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { push } = useToasts();
  const { refresh } = useAuth();
  const { settings } = useSettings();

  const [character, setCharacter] = useState(null);
  const [view, setView] = useState(settings.defaultView);
  const [pose, setPose] = useState(settings.defaultPose === 'auto' ? 'front' : settings.defaultPose);
  const [selected, setSelected] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [fps, setFps] = useState(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [lockRatio, setLockRatio] = useState(settings.lockRatio);
  const [panel, setPanel] = useState('parts');
  const [dropHint, setDropHint] = useState(false);
  const [showGrid, setShowGrid] = useState(settings.showGrid);
  const [showRulers, setShowRulers] = useState(true);
  const [showTemplate, setShowTemplate] = useState(false);
  // the grid setting the exports use — seeded from the canvas toggle when the
  // dialog opens, then owned by the dialog so one checkbox governs both images
  const [exportGrid, setExportGrid] = useState(true);
  const [snapCm, setSnapCm] = useState(settings.snapCm);
  const [rulerUnit, setRulerUnit] = useState(settings.rulerUnit ?? 'cm');

  // undo / redo history (FR12, US15)
  const past = useRef([]); const future = useRef([]);
  const [histVer, setHistVer] = useState(0);
  // Mirrors `character` synchronously. History bookkeeping must happen OUTSIDE
  // the state updater — React invokes updaters twice under StrictMode, which
  // would push every snapshot onto the undo stack twice.
  const charRef = useRef(null);
  const snap = (c) => ({
    name: c.name, scale: c.scale,
    colors: { ...c.colors },
    variants: { ...variantsOf(c) },
    hidden: [...hiddenOf(c)],
    elements: (c.elements ?? []).map(e => ({ ...e })),
    canvas: { ...canvasOf(c) },
    offset: { ...offsetOf(c) },
  });

  useEffect(() => {
    let live = true;
    api.get(id)
      .then(({ character: c }) => {
        if (!live) return;
        const withEls = {
          ...c,
          elements: c.elements ?? [],
          canvas: canvasOf(c),
          offset: offsetOf(c),
          variants: variantsOf(c),
          hidden: hiddenOf(c),
        };
        setCharacter(withEls); charRef.current = withEls;
        // "Automatic" resolves once the shape is known — a quadruped opens in
        // the profile it was drawn in, a child facing the viewer.
        if (settings.defaultPose === 'auto') setPose(drawnPoseOf(withEls));
        const parts = partsOf(c.shape);
        setSelected(parts[0] ?? null);
        setPanel(parts.length ? 'parts' : 'elements');
        past.current = []; future.current = []; setHistVer(v => v + 1);
      })
      .catch(e => { push({ message: e.message, tone: 'error' }); nav('/', { replace: true }); });
    return () => { live = false; };
    // settings.defaultPose is read once, at load: changing the preference must
    // not yank the canvas out from under someone mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nav, push]);

  /** Every discrete mutation goes through here so undo always has a snapshot. */
  const mutate = useCallback((patch, label) => {
    const prev = charRef.current;
    if (!prev) return;
    past.current.push({ snapshot: snap(prev), label });
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    const next = {
      ...prev, ...patch,
      colors: { ...prev.colors, ...(patch.colors || {}) },
      variants: { ...variantsOf(prev), ...(patch.variants || {}) },
      hidden: patch.hidden ?? prev.hidden ?? [],
      elements: patch.elements ?? prev.elements ?? [],
      canvas: patch.canvas ?? prev.canvas ?? { ...DEFAULT_CANVAS },
      offset: patch.offset ?? prev.offset ?? { ...DEFAULT_OFFSET },
    };
    charRef.current = next;
    setCharacter(next);
    setDirty(true);
    setHistVer(v => v + 1);
  }, []);

  /* A gesture — a canvas drag or a slider scrub — is many updates but ONE
     undo step. Snapshot on the way in, push it once on the way out. */
  const view3dApi = useRef(null);
  const onApi3D = useCallback((api) => { view3dApi.current = api; }, []);

  const gestureRef = useRef(null);
  const startGesture = useCallback(() => {
    if (charRef.current) gestureRef.current = snap(charRef.current);
  }, []);
  const applyGesture = useCallback((patch) => {
    const prev = charRef.current;
    if (!prev) return;
    const next = { ...prev, ...patch };
    charRef.current = next;
    setCharacter(next);
    setDirty(true);
  }, []);
  const endGesture = useCallback((label) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    past.current.push({ snapshot: g, label });
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setHistVer(v => v + 1);
  }, []);
  const cancelGesture = useCallback(() => { gestureRef.current = null; }, []);

  const undo = useCallback(() => {
    const entry = past.current.pop();
    const prev = charRef.current;
    if (!entry || !prev) return;
    future.current.push({ snapshot: snap(prev), label: entry.label });
    const next = { ...prev, ...entry.snapshot };
    charRef.current = next;
    setCharacter(next);
    setDirty(true);
    setHistVer(v => v + 1);
  }, []);

  const redo = useCallback(() => {
    const entry = future.current.pop();
    const prev = charRef.current;
    if (!entry || !prev) return;
    past.current.push({ snapshot: snap(prev), label: entry.label });
    const next = { ...prev, ...entry.snapshot };
    charRef.current = next;
    setCharacter(next);
    setDirty(true);
    setHistVer(v => v + 1);
  }, []);

  const save = useCallback(async (quiet = false) => {
    if (!character) return;
    setSaving(true);
    try {
      const { character: c } = await api.update(character._id, {
        name: character.name, scale: character.scale,
        colors: character.colors, elements: character.elements ?? [],
        variants: variantsOf(character), hidden: hiddenOf(character),
        canvas: canvasOf(character), offset: offsetOf(character),
        materials: character.materials ?? {},
        lighting: character.lighting ?? {},
      });
      setCharacter(prev => { const n = { ...prev, updatedAt: c.updatedAt }; charRef.current = n; return n; });
      setDirty(false); setSavedAt(new Date());
      if (!quiet) push({ message: 'Saved' });
    } catch (e) {
      push({ message: e.message, tone: 'error' });
    } finally { setSaving(false); }
  }, [character, push]);

  /* ---------------- element operations ---------------- */
  const elements = character?.elements ?? [];
  const selectedEl = useMemo(
    () => elements.find(e => e.id === selIdOf(selected)) ?? null,
    [elements, selected]
  );

  const addElement = useCallback((key, x = 0, y = 0) => {
    const prev = charRef.current;
    if (!prev) return;
    const els = prev.elements ?? [];
    if (els.length >= MAX_ELEMENTS) {
      push({ message: `A character can hold ${MAX_ELEMENTS} elements.`, tone: 'error' });
      return;
    }
    const topZ = els.reduce((m, e) => Math.max(m, e.z ?? 0), 0);
    const el = makeElement(key, x, y, 'Sky Blue');
    el.z = Math.min(200, topZ + 1);
    mutate({ elements: [...els, el] }, `add ${ELEMENT_KINDS[key].label.toLowerCase()}`);
    setSelected('element:' + el.id);
    setPanel('elements');
  }, [mutate, push]);

  const patchElement = useCallback((elId, patch, label) => {
    const els = charRef.current?.elements ?? [];
    mutate({ elements: els.map(e => (e.id === elId ? { ...e, ...patch } : e)) }, label);
  }, [mutate]);

  const removeElement = useCallback((elId) => {
    const prev = charRef.current;
    if (!prev) return;
    const els = prev.elements ?? [];
    const materials = { ...(prev.materials ?? {}) };
    delete materials[elId];
    mutate({ elements: els.filter(e => e.id !== elId), materials }, 'delete element');
    setSelected(null);
  }, [mutate]);

  const duplicateElement = useCallback((elId) => {
    const prev = charRef.current;
    if (!prev) return;
    const els = prev.elements ?? [];
    const src = els.find(e => e.id === elId);
    if (!src || els.length >= MAX_ELEMENTS) return;
    const copy = { ...src, id: makeElement(src.el).id, x: src.x + 18, y: src.y + 18 };
    
    const materials = { ...(prev.materials ?? {}) };
    if (materials[elId]) {
      materials[copy.id] = { ...materials[elId] };
    }
    mutate({ elements: [...els, copy], materials }, 'duplicate element');
    setSelected('element:' + copy.id);
  }, [mutate]);

  /* live drag from the canvas — one undo step for the whole gesture */
  const onElementDragStart = useCallback(() => startGesture(), [startGesture]);
  const onElementDrag = useCallback((elId, x, y) => {
    const prev = charRef.current;
    if (!prev) return;
    applyGesture({
      elements: (prev.elements ?? []).map(e => (e.id === elId ? { ...e, x, y } : e)),
    });
  }, [applyGesture]);
  const onElementDragEnd = useCallback((_elId, moved) => {
    if (moved) endGesture('move element'); else cancelGesture();
  }, [endGesture, cancelGesture]);

  /* the same gesture contract, driven from the 3D canvas */
  const onElementMove3D = useCallback((elId, pos) => {
    const prev = charRef.current;
    if (!prev) return;
    applyGesture({ elements: (prev.elements ?? []).map(e => (e.id === elId ? { ...e, ...pos } : e)) });
  }, [applyGesture]);

  const onElementResize3D = useCallback((elId, size) => {
    const prev = charRef.current;
    if (!prev) return;
    applyGesture({
      elements: (prev.elements ?? []).map(e => (
        e.id === elId ? { ...e, ...size, d: Math.min(size.w, size.h) } : e
      )),
    });
  }, [applyGesture]);

  const onElementGestureEnd3D = useCallback((_elId, moved, mode) => {
    if (moved) endGesture(mode === 'resize' ? 'resize element' : 'move element');
    else cancelGesture();
  }, [endGesture, cancelGesture]);

  /* placing the whole composition — same gesture contract as element drags */
  const onPlaceStart = useCallback(() => startGesture(), [startGesture]);
  const onPlace = useCallback((pos) => {
    const prev = charRef.current;
    if (!prev) return;
    applyGesture({ offset: { ...offsetOf(prev), ...pos } });
  }, [applyGesture]);
  const onPlaceEnd = useCallback((moved) => {
    if (moved) endGesture('move character'); else cancelGesture();
  }, [endGesture, cancelGesture]);

  const setOffset = useCallback((patch, label) => {
    const prev = charRef.current;
    if (!prev) return;
    mutate({ offset: { ...offsetOf(prev), ...patch } }, label ?? 'place character');
  }, [mutate]);

  const alignTo = useCallback((where) => {
    const prev = charRef.current;
    if (!prev) return;
    mutate({ offset: alignOffset(prev, where) }, 'align character');
  }, [mutate]);

  /* ---------------- shape, parts and templates ---------------- */

  /** Choose an option on one variant axis — body shape, head shape, face. */
  const setVariant = useCallback((axis, key, label) => {
    mutate({ variants: { [axis]: key } }, `change ${label.toLowerCase()}`);
  }, [mutate]);

  /** Switch an optional part on or off. Nothing is destroyed either way. */
  const togglePart = useCallback((part) => {
    const prev = charRef.current;
    if (!prev) return;
    const hidden = hiddenOf(prev);
    const off = hidden.includes(part);
    mutate(
      { hidden: off ? hidden.filter(p => p !== part) : [...hidden, part] },
      `${off ? 'add' : 'remove'} ${part}`
    );
    if (!off && selected === part) setSelected(null);
  }, [mutate, selected]);

  const setCanvasSize = useCallback((patch) => {
    const prev = charRef.current;
    if (!prev) return;
    const next = { ...canvasOf(prev), ...patch };
    mutate({ canvas: next }, 'resize artboard');
  }, [mutate]);

  // autosave — NFR4. Turning it off in settings never disables Ctrl+S, the
  // Save button or the warning on leaving, so work still cannot be lost by
  // accident; it only stops the periodic write.
  useEffect(() => {
    if (!dirty || !settings.autosaveSeconds) return;
    const t = setTimeout(() => save(true), settings.autosaveSeconds * 1000);
    return () => clearTimeout(t);
  }, [dirty, save, settings.autosaveSeconds]);

  // keyboard shortcuts — NFR3 (full keyboard access), US15
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
      if (e.key === 'Escape' && !typing) { setSelected(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && isElementSel(selected)) {
        e.preventDefault(); removeElement(selIdOf(selected)); return;
      }
      // arrow keys nudge by one snap step (shift = 1 cm): the selected element
      // if there is one, otherwise the character's placement on the board
      if (!typing && e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? cmToUnits(1) : (snapCm > 0 ? cmToUnits(snapCm) : 1);
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (!dx && !dy) return;
        const cur = (charRef.current?.elements ?? []).find(x => x.id === selIdOf(selected));
        e.preventDefault();
        if (cur) {
          patchElement(cur.id, { x: Math.round(cur.x + dx), y: Math.round(cur.y + dy) }, 'nudge element');
        } else {
          const o = offsetOf(charRef.current);
          setOffset({ x: Math.round(o.x + dx), y: Math.round(o.y + dy) }, 'nudge character');
        }
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key.toLowerCase() === 'd' && isElementSel(selected)) { e.preventDefault(); duplicateElement(selIdOf(selected)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, save, selected, removeElement, duplicateElement, patchElement, setOffset, snapCm]);

  // warn before losing unsaved work
  useEffect(() => {
    const before = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  if (!character) {
    return (
      <div className="shell"><TopBar />
        <div className="ebody">
          <div className="panel panel--l" /><div className="stage" /><div className="panel panel--r" />
        </div>
      </div>
    );
  }

  const parts = partsOf(character.shape);
  const optional = optionalPartsOf(character.shape);
  const hidden = hiddenOf(character);
  const axes = variantAxesOf(character.shape);
  const chosen = variantsOf(character);
  const groups = groupsOf(character.shape);
  const shapeLabel = SHAPES[character.shape]?.label ?? character.shape;
  const isPartSel = selected != null && !isElementSel(selected);
  const currentColor = isPartSel
    ? colorTokenOf(character, selected)
    : selectedEl?.color ?? null;

  const setPartColor = (token) => {
    if (selectedEl) patchElement(selectedEl.id, { color: token }, 'recolour element');
    else if (isPartSel) mutate({ colors: { ...character.colors, [selected]: token } }, `recolour ${selected}`);
  };

  const setMaterialProp = (prop, value) => {
    const key = selectedEl ? selectedEl.id : selected;
    if (!key) return;
    const currentMat = character.materials?.[key] ?? {};
    mutate({
       materials: {
         ...character.materials,
         [key]: { ...currentMat, [prop]: value }
       }
    }, `update ${prop}`);
  };
  const currentMaterial = character.materials?.[selectedEl ? selectedEl.id : selected] ?? {};

  // "Whole character" skips the parts a shape marks as exempt — flooding a
  // face's eyes with the coat colour is never what the button was reached for.
  const setAllColors = (token) =>
    mutate({ colors: Object.fromEntries(bulkPartsOf(character.shape).map(p => [p, token])) },
           'recolour whole character');
  /** Recolour one named group — Skin, Clothes, Hair, Coat, Foliage… */
  const setGroupColors = (name, token) =>
    mutate({ colors: Object.fromEntries((groups[name] ?? []).map(p => [p, token])) },
           `recolour ${name.toLowerCase()}`);

  return (
    <div className="shell">
      <TopBar />
      <div className="editor">
        {/* ---------------- toolbar ---------------- */}
        <div className="etoolbar">
          <input className="ename" value={character.name} aria-label="Character name"
                 data-testid="char-name"
                 onChange={e => mutate({ name: e.target.value }, 'rename')} />
          <span className="savestate" data-testid="save-state">
            <span className={`dot ${dirty ? 'dot--dirty' : 'dot--saved'}`} />
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'All changes saved'}
          </span>

          <div className="spacer" />
          <div className="seg" role="group" aria-label="View">
            <button className="seg__btn" aria-pressed={view === '2d'} onClick={() => setView('2d')} data-testid="view-2d">2D</button>
            <button className="seg__btn" aria-pressed={view === '3d'} onClick={() => setView('3d')} data-testid="view-3d">3D</button>
          </div>
          {view === '2d' && (
            <div className="seg" role="group" aria-label="2D pose">
              {POSES.map(p => (
                <button key={p.key} className="seg__btn" aria-pressed={pose === p.key}
                        title={p.hint} onClick={() => setPose(p.key)} data-testid={`pose-${p.key}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="spacer" />

          <button className="btn btn--icon" onClick={undo} disabled={!past.current.length}
                  title="Undo (Ctrl+Z)" aria-label="Undo" data-testid="undo">↶</button>
          <button className="btn btn--icon" onClick={redo} disabled={!future.current.length}
                  title="Redo (Ctrl+Shift+Z)" aria-label="Redo" data-testid="redo">↷</button>
          <button className="btn" onClick={() => save()} disabled={saving} data-testid="save">Save</button>
          <button className="btn" onClick={() => setShowTemplate(true)} data-testid="save-template">
            Save as template
          </button>
          <button className="btn" onClick={() => { setExportGrid(showGrid); setShowExport(true); }}
                  data-testid="export">Export</button>
          <button className="btn btn--primary" onClick={async () => { if (dirty) await save(true); nav('/'); }}
                  data-testid="done">Done</button>
        </div>

        {/* ---------------- body ---------------- */}
        <div className="ebody">
          {/* parts + element library */}
          <aside className="panel panel--l">
            <div className="paneltabs" role="tablist" aria-label="Left panel">
              <button role="tab" className="paneltab" aria-selected={panel === 'parts'}
                      onClick={() => setPanel('parts')} data-testid="tab-parts">
                Outliner
              </button>
              {!!Object.keys(axes).length && (
                <button role="tab" className="paneltab" aria-selected={panel === 'shape'}
                        onClick={() => setPanel('shape')} data-testid="tab-shape">
                  Shape
                </button>
              )}
              <button role="tab" className="paneltab" aria-selected={panel === 'elements'}
                      onClick={() => setPanel('elements')} data-testid="tab-elements">
                Library
              </button>
              {view === '3d' && (
                <button role="tab" className="paneltab" aria-selected={panel === 'lighting'}
                        onClick={() => setPanel('lighting')} data-testid="tab-lighting">
                  Lighting
                </button>
              )}
            </div>

            <div className="panel__body">
              {panel === 'parts' ? (
                <>
                  <div className="panel__section" style={{ paddingBottom: 4 }}>
                    <span className="field__label">Body Parts ({parts.length})</span>
                  </div>
                  {parts.length ? (
                    <>
                      {parts.map(p => {
                        const off = hidden.includes(p);
                        const canToggle = optional.includes(p);
                        return (
                          <div key={p} className={`partrow__wrap${off ? ' is-off' : ''}`}>
                            <button className="partrow" aria-pressed={selected === p} disabled={off}
                                    onClick={() => setSelected(p)} data-testid={`part-${p}`}>
                              <span className="swatchdot" style={{ background: colorOf(character, p) }} />
                              <span className="partrow__name">{p}</span>
                              <span className="partrow__col">{colorLabel(colorTokenOf(character, p))}</span>
                            </button>
                            {canToggle && (
                              <button className="partrow__toggle" aria-pressed={!off}
                                      title={off ? `Add ${p}` : `Remove ${p}`}
                                      aria-label={off ? `Add ${p}` : `Remove ${p}`}
                                      onClick={() => togglePart(p)} data-testid={`toggle-${p}`}>
                                {off ? '+' : '−'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="panel__section">
                      <p className="muted" style={{ fontSize: 'var(--t-xs)', lineHeight: 1.5, padding: '0 12px' }}>
                        This is a blank canvas. Open the <b>Library</b> tab to drag shapes onto the artboard.
                      </p>
                    </div>
                  )}

                  <div className="panel__section" style={{ marginTop: 16, paddingBottom: 4, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    <span className="field__label">Elements ({elements.length})</span>
                  </div>
                  {elements.length > 0 ? (
                    [...elements].slice().reverse().map(e => {
                      const sel = selected === 'element:' + e.id;
                      return (
                        <div key={e.id} className="partrow partrow--el" aria-pressed={sel} style={{ padding: '0 12px', borderBottom: 'none' }}>
                          <button className="partrow__main" aria-pressed={sel}
                                  onClick={() => setSelected('element:' + e.id)}
                                  data-testid={`el-${e.id}`}>
                            <span className="swatchdot" style={{ background: PALETTE_BY_NAME[e.color] }} />
                            <span className="partrow__name">{ELEMENT_KINDS[e.el]?.label ?? e.el}</span>
                            <span className="partrow__col" style={{ fontSize: '10px' }}>{Math.round(e.x/10)}, {Math.round(e.y/10)}</span>
                          </button>
                          <button className="btn btn--icon btn--sm" onClick={(ev) => { ev.stopPropagation(); removeElement(e.id); }}
                                  title="Delete element" aria-label={`Delete ${ELEMENT_KINDS[e.el]?.label ?? 'element'}`}>×</button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="muted" style={{ fontSize: 'var(--t-xs)', lineHeight: 1.5, padding: '0 12px' }}>
                      No elements added.
                    </p>
                  )}
                </>
              ) : panel === 'shape' ? (
                <ShapePanel axes={axes} chosen={chosen} onChoose={setVariant} />
              ) : panel === 'lighting' ? (
                <LightingPanel 
                  lighting={character.lighting ?? {}} 
                  onChange={(prop, val) => mutate({ lighting: { ...(character.lighting ?? {}), [prop]: val } }, `update ${prop}`)} 
                />
              ) : (
                <ElementPanel
                  elements={elements}
                  selected={selected}
                  onSelect={setSelected}
                  onAdd={addElement}
                  onRemove={removeElement}
                  view={view}
                />
              )}
            </div>
          </aside>

          {/* stage */}
          <section className="stage">
            <div className="stage__view">
              {view === '2d' ? (
                <div className={`artboard${dropHint ? ' artboard--drop' : ''}`}
                     onClick={() => setSelected(null)}
                     onDragOver={(e) => { e.preventDefault(); setDropHint(true); }}
                     onDragLeave={() => setDropHint(false)}
                     onDrop={() => setDropHint(false)}>
                  <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 4,
                                padding: 12, boxShadow: 'var(--shadow-sm)' }}>
                    <Character2D character={character} selected={selected} onSelect={setSelected}
                                 size={430} interactive pose={pose}
                                 showGrid={showGrid} showRulers={showRulers} rulerUnit={rulerUnit} snapCm={snapCm}
                                 onElementDragStart={onElementDragStart}
                                 onElementDrag={onElementDrag}
                                 onElementDragEnd={onElementDragEnd}
                                 onElementDrop={addElement}
                                 onPlaceStart={onPlaceStart}
                                 onPlace={onPlace}
                                 onPlaceEnd={onPlaceEnd} />
                  </div>
                </div>
              ) : (
                <Character3D character={character} selected={selected} onSelect={setSelected}
                             onFps={setFps} resetSignal={resetSignal}
                             showGrid={showGrid} snapCm={snapCm} lockRatio={lockRatio}
                             onElementDragStart={onElementDragStart}
                             onElementDrag={onElementMove3D}
                             onElementResize={onElementResize3D}
                             onElementDragEnd={onElementGestureEnd3D}
                             onElementDrop={addElement}
                             onPlaceStart={onPlaceStart}
                             onPlace={onPlace}
                             onPlaceEnd={onPlaceEnd}
                             onApi={onApi3D} />
              )}
            </div>

            <div className="stage__hud">
              {view === '3d' && (
                <button className="btn btn--sm" onClick={() => setResetSignal(n => n + 1)} data-testid="reset-camera">
                  ⌂ Reset camera
                </button>
              )}
              <button className="btn btn--sm" aria-pressed={showGrid}
                      onClick={() => setShowGrid(g => !g)} data-testid="toggle-grid">
                {showGrid ? '▦ Grid on' : '▢ Grid off'}
              </button>
              {view === '2d' && (
                <>
                  <button className="btn btn--sm" aria-pressed={showRulers}
                          onClick={() => setShowRulers(r => !r)} data-testid="toggle-rulers">
                    {showRulers ? '📏 Rulers on' : '📏 Rulers off'}
                  </button>
                  {showRulers && (
                    <select className="input" style={{ width: 60, height: 28, padding: '0 4px', fontSize: '11px' }}
                            value={rulerUnit} onChange={(e) => setRulerUnit(e.target.value)}
                            aria-label="Ruler Unit">
                      <option value="cm">cm</option>
                      <option value="mm">mm</option>
                      <option value="inch">in</option>
                    </select>
                  )}
                </>
              )}
              <button className="btn btn--sm" aria-pressed={snapCm > 0}
                      onClick={() => setSnapCm(v => (v > 0 ? 0 : 0.5))} data-testid="toggle-snap">
                {snapCm > 0 ? `⇥ Snap ${snapCm} cm` : '⇥ Snap off'}
              </button>
              <span className="pill">
                {view === '3d'
                  ? 'Drag the character to place it · drag an element to move it · alt-drag to resize · drag the background to orbit'
                  : !isDrawnPose(character, pose)
                    ? `Projected ${pose} elevation — switch to ${drawnPoseOf(character)} to move anything`
                    : 'Drag the character to place it · drag an element to move it · arrows nudge · Delete removes'}
              </span>
            </div>
            <div className="stage__hud stage__hud--r">
              <span className="pill" data-testid="stage-meta">
                {shapeLabel} · {view === '2d' ? `${pose} · ` : ''}{canvasOf(character).width}×{canvasOf(character).height} cm · {Math.round((character.scale ?? 1) * 100)}%
                {elements.length ? ` · ${elements.length} element${elements.length === 1 ? '' : 's'}` : ''}
                {view === '3d' && fps != null && ` · ${fps} fps`}
              </span>
            </div>
          </section>

          {/* properties */}
          <aside className="panel panel--r">
            <div className="panel__head">Properties</div>
            <div className="panel__body">
              <div className="field">
                <span className="field__label">Selection</span>
                <div className="row" style={{ gap: 10, padding: '8px 10px', background: 'var(--surface-sunk)',
                                              borderRadius: 'var(--r-md)', textTransform: 'capitalize', fontWeight: 600 }}
                     data-testid="selected-part">
                  {selectedEl ? (
                    <><span className="swatchdot" style={{ background: PALETTE_BY_NAME[selectedEl.color] }} />
                      {ELEMENT_KINDS[selectedEl.el]?.label ?? 'Element'}</>
                  ) : isPartSel ? (
                    <><span className="swatchdot" style={{ background: colorOf(character, selected) }} />{selected}</>
                  ) : <span className="muted" style={{ fontWeight: 400 }}>Nothing selected</span>}
                </div>
              </div>

              <div className="field">
                <span className="field__label">Colour {currentColor ? `— ${colorLabel(currentColor)}` : ''}</span>
                <div className="swatches" role="group" aria-label="Colour palette">
                  {PALETTE.map(c => (
                    <button key={c.name} className="swatch" title={c.name} aria-label={c.name}
                            aria-pressed={currentColor === c.name}
                            style={{ background: c.hex }} disabled={!selected}
                            onClick={() => setPartColor(c.name)}
                            data-testid={`swatch-${c.name.replace(/\s+/g, '-')}`} />
                  ))}
                </div>
                <span className="field__hint">
                  Every swatch is named as well as coloured, so the palette works without relying on colour alone.
                </span>

                {/* The custom picker is deliberately second: a named swatch is
                    what the game team can ask for by name, so it stays the
                    obvious choice and a bespoke colour is the deliberate one. */}
                <label className="customcolour">
                  <input type="color" value={hexOf(currentColor, '#4E86C7')} disabled={!selected}
                         onChange={e => setPartColor(e.target.value.toLowerCase())}
                         aria-label="Custom colour" data-testid="custom-colour" />
                  <span>
                    Custom colour
                    {isHexColor(currentColor) && <b className="customcolour__hex"> {currentColor.toUpperCase()}</b>}
                  </span>
                </label>

                {parts.length > 0 && (
                  <button className="btn btn--sm btn--block" style={{ marginTop: 12 }}
                          disabled={!isPartSel} onClick={() => setAllColors(currentColor)}
                          data-testid="apply-all">
                    Apply {currentColor ? colorLabel(currentColor) : 'colour'} to whole character
                  </button>
                )}

                {Object.keys(groups).length > 0 && (
                  <div className="panel__section" style={{ paddingTop: 12 }}>
                    <span className="field__label">Apply to a group</span>
                    <div className="groupgrid">
                      {Object.entries(groups).map(([name, members]) => (
                        <button key={name} className="btn btn--sm" disabled={!currentColor}
                                title={members.join(', ')}
                                onClick={() => setGroupColors(name, currentColor)}
                                data-testid={`group-${name.toLowerCase()}`}>
                          <span className="swatchdot" style={{ background: colorOf(character, members[0]) }} />
                          {name}
                        </button>
                      ))}
                    </div>
                    <span className="field__hint">
                      One click recolours every part of that group — all the clothing, or all the skin.
                    </span>
                  </div>
                )}
              </div>

              {view === '3d' && (
                <div className="field">
                  <span className="field__label">Material Properties (3D)</span>
                  <div className="panel__section">
                    <span className="field__label" style={{ fontWeight: 400, fontSize: '12px' }}>
                      Roughness — {Math.round((currentMaterial.roughness ?? 0.66) * 100)}%
                    </span>
                    <input className="slider" type="range" min="0" max="1" step="0.05"
                           value={currentMaterial.roughness ?? 0.66}
                           onChange={e => setMaterialProp('roughness', Number(e.target.value))}
                           disabled={!selected} aria-label="Roughness" />
                    
                    <span className="field__label" style={{ fontWeight: 400, fontSize: '12px', marginTop: 10 }}>
                      Metalness — {Math.round((currentMaterial.metalness ?? 0.02) * 100)}%
                    </span>
                    <input className="slider" type="range" min="0" max="1" step="0.05"
                           value={currentMaterial.metalness ?? 0.02}
                           onChange={e => setMaterialProp('metalness', Number(e.target.value))}
                           disabled={!selected} aria-label="Metalness" />
                    <span className="field__hint">
                      Adjust how shiny or metallic the surface appears in the 3D view.
                    </span>
                  </div>
                </div>
              )}

              {selectedEl ? (
                <ElementProperties
                  el={selectedEl}
                  lockRatio={lockRatio}
                  onLockRatio={setLockRatio}
                  onPatch={(patch, label) => patchElement(selectedEl.id, patch, label)}
                  onGestureStart={startGesture}
                  onGesture={(patch) => {
                    const prev = charRef.current;
                    applyGesture({
                      elements: (prev.elements ?? []).map(e => (e.id === selectedEl.id ? { ...e, ...patch } : e)),
                    });
                  }}
                  onGestureEnd={endGesture}
                  onDuplicate={() => duplicateElement(selectedEl.id)}
                  onRemove={() => removeElement(selectedEl.id)}
                />
              ) : (
                <div className="panel__section">
                  <span className="field__label">Size</span>
                  <input className="slider" type="range" min="25" max="200" step="5"
                         value={Math.round((character.scale ?? 1) * 100)}
                         onPointerDown={startGesture}
                         onPointerUp={() => endGesture('resize')}
                         onChange={e => applyGesture({ scale: Number(e.target.value) / 100 })}
                         aria-label="Scale percent" data-testid="scale-slider" />
                  <div className="numrow">
                    <input className="num" type="number" min="25" max="200"
                           value={Math.round((character.scale ?? 1) * 100)}
                           onChange={e => {
                             const v = Math.max(25, Math.min(200, Number(e.target.value) || 100));
                             mutate({ scale: v / 100 }, 'resize');
                           }}
                           aria-label="Scale percent" data-testid="scale-number" />
                    <span className="muted">%</span>
                    <div className="spacer" />
                    <button className="btn btn--sm" onClick={() => mutate({ scale: 1 }, 'reset size')}
                            data-testid="reset-scale">Reset to 100%</button>
                  </div>
                  <label className="checkrow">
                    <input type="checkbox" checked={lockRatio} onChange={e => setLockRatio(e.target.checked)} />
                    Lock aspect ratio when resizing elements
                  </label>
                </div>
              )}

              <PlacementSection character={character} offset={offsetOf(character)}
                                onChange={setOffset} onAlign={alignTo}
                                onGestureStart={startGesture} onGestureEnd={endGesture}
                                onGesture={(patch) => applyGesture({ offset: { ...offsetOf(charRef.current), ...patch } })} />

              <ArtboardSection canvas={canvasOf(character)} onChange={setCanvasSize}
                               snapCm={snapCm} onSnapCm={setSnapCm}
                               showGrid={showGrid} onShowGrid={setShowGrid} />
            </div>
          </aside>
        </div>

        <div className="statusbar">
          {/* The same four actions as the toolbar, within reach of the panels
              a designer is already working in at the bottom of the screen. */}
          <div className="statusbar__actions" role="group" aria-label="Quick actions">
            <button className="btn btn--sm" onClick={() => save()} disabled={saving} data-testid="save-bottom">Save</button>
            <button className="btn btn--sm" onClick={undo} disabled={!past.current.length}
                    aria-label="Undo" data-testid="undo-bottom">↶ Undo</button>
            <button className="btn btn--sm" onClick={redo} disabled={!future.current.length}
                    aria-label="Redo" data-testid="redo-bottom">↷ Redo</button>
            <button className="btn btn--sm" onClick={() => { setExportGrid(showGrid); setShowExport(true); }}
                    data-testid="export-bottom">Export</button>
          </div>
          <span data-testid="status-autosave">
            {settings.autosaveSeconds
              ? `Autosaves every ${settings.autosaveSeconds} seconds`
              : 'Autosave is off — Ctrl+S saves'}
            {savedAt ? ` · last saved ${savedAt.toLocaleTimeString()}` : ''}
          </span>
          <div className="spacer" />
          <span>{past.current.length} undo step{past.current.length === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>Ctrl+Z undo · Ctrl+S save · Del removes an element</span>
        </div>
      </div>

      {/* Kept off screen so exporting either elevation works whichever view is
          open. They are the same component, so an export cannot drift from the
          canvas — and the side sheet is available even from the 3D view. */}
      <div id="export-2d" className="offscreen" aria-hidden="true">
        <Character2D character={character} size={900} showGrid={exportGrid} showSelection={false} pose="front" />
      </div>
      <div id="export-2d-side" className="offscreen" aria-hidden="true">
        <Character2D character={character} size={900} showGrid={exportGrid} showSelection={false} pose="side" />
      </div>

      {showExport && (
        <ExportDialog character={character}
                      withGrid={exportGrid} onWithGrid={setExportGrid}
                      defaultResolution={settings.exportResolution}
                      get3DCamera={() => view3dApi.current?.getCamera?.() ?? null}
                      onClose={() => setShowExport(false)} />
      )}

      {showTemplate && (
        <TemplateDialog character={character}
                        onSaved={() => { setShowTemplate(false); refresh(); }}
                        onClose={() => setShowTemplate(false)} />
      )}
    </div>
  );
}

/* ---------------- shape variants ----------------
 * Body shape, head shape and face style. Each axis is a small set of named
 * options rather than a slider: designers in testing wanted "a rounder dog",
 * not a number, and a named option is something two people can agree on
 * across a desk. Every option is reversible — picking one never discards
 * anything, it re-reads the same primitive list a different way.
 */
function ShapePanel({ axes, chosen, onChoose }) {
  return (
    <>
      {Object.entries(axes).map(([key, axis]) => (
        <div className="panel__section" key={key}>
          <span className="field__label">{axis.label}</span>
          <div className="optgrid" role="group" aria-label={axis.label}>
            {axis.options.map(o => (
              <button key={o.key} className="optbtn" aria-pressed={chosen[key] === o.key}
                      onClick={() => onChoose(key, o.key, axis.label)}
                      data-testid={`variant-${key}-${o.key}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="panel__section">
        <p className="muted" style={{ fontSize: 'var(--t-xs)', lineHeight: 1.5, padding: '0 12px' }}>
          Both views follow the same choice, so a character shaped here reads the same in 2D and
          in 3D. Every change is one undo step.
        </p>
      </div>
    </>
  );
}

/* ---------------- save as a template ----------------
 * The fast path a beginner asked for is only fast if there is something in it,
 * so any finished character can become a starting point for the next one.
 * Placement is deliberately left behind: where this artwork sat on this board
 * says nothing about where the next one belongs.
 */
function TemplateDialog({ character, onSaved, onClose }) {
  const { push } = useToasts();
  const [name, setName] = useState(character.name);
  const [blurb, setBlurb] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.saveTemplate({ characterId: character._id, name: name.trim(), blurb: blurb.trim() });
      push({ message: `“${name.trim()}” saved as a template` });
      onSaved();
    } catch (ex) {
      setError(ex.message);
      setBusy(false);
    }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="tpl-title"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={save}>
        <h2 className="modal__title" id="tpl-title">Save as a template</h2>
        <p className="modal__body">
          Its colours, shape choices, switched-off parts and placed elements become the starting
          point for a new character. This character is not changed.
        </p>
        {error && <p className="field__error" role="alert">{error}</p>}

        <div className="row" style={{ gap: 16, alignItems: 'flex-start', margin: '4px 0 8px' }}>
          <div style={{ width: 110, height: 110, background: 'var(--canvas)', borderRadius: 8,
                        display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Character2D character={character} size={104} scale={false} showSelection={false} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field">
              <span className="field__label">Template name</span>
              <input className="input" value={name} maxLength={60} autoFocus
                     onChange={e => setName(e.target.value)} data-testid="tpl-name" required />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field__label">Description <span className="muted">(optional)</span></span>
              <input className="input" value={blurb} maxLength={120} placeholder="what this template is for"
                     onChange={e => setBlurb(e.target.value)} data-testid="tpl-blurb" />
            </label>
          </div>
        </div>

        <div className="modal__foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy || !name.trim()} data-testid="tpl-save">
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- element library + placed list ---------------- */
function ElementPanel({ elements, selected, onSelect, onAdd, onRemove, view }) {
  return (
    <>
      <div className="panel__section">
        <span className="field__label">Drag a shape onto the canvas</span>
        <div className="ellib" data-testid="element-library">
          {ELEMENT_KEYS.map(key => {
            const def = ELEMENT_KINDS[key];
            return (
              <button
                key={key}
                className="ellib__item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-cd-element', key);
                  e.dataTransfer.setData('text/plain', key);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(key, 0, 0)}
                title={`${def.label} — drag onto the canvas, or click to add at the centre`}
                aria-label={`Add ${def.label}`}
                data-testid={`ellib-${key}`}
              >
                <ElementIcon kind={def.kind} />
                <span className="ellib__name">{def.label}</span>
              </button>
            );
          })}
        </div>
        <span className="field__hint">
          {view === '3d'
            ? 'Drag shapes onto the 3D canvas, or click to add at the centre.'
            : 'Or click a shape to drop it in the centre, then drag it where you want it.'}
        </span>
      </div>
    </>
  );
}

function LightingPanel({ lighting, onChange }) {
  const keyLight = lighting.keyLight ?? 2.0;
  const rimLight = lighting.rimLight ?? 0.7;
  const bounceLight = lighting.bounceLight ?? 0.35;
  const bgColor = lighting.bgColor ?? '#FFFFFF';

  return (
    <>
      <div className="panel__section">
        <span className="field__label">Key Light Intensity — {keyLight.toFixed(1)}</span>
        <input className="slider" type="range" min="0" max="5" step="0.1" value={keyLight}
               onChange={e => onChange('keyLight', Number(e.target.value))} aria-label="Key Light" />
        
        <span className="field__label" style={{ marginTop: 12 }}>Rim Light Intensity — {rimLight.toFixed(1)}</span>
        <input className="slider" type="range" min="0" max="3" step="0.1" value={rimLight}
               onChange={e => onChange('rimLight', Number(e.target.value))} aria-label="Rim Light" />
        
        <span className="field__label" style={{ marginTop: 12 }}>Bounce Light Intensity — {bounceLight.toFixed(2)}</span>
        <input className="slider" type="range" min="0" max="2" step="0.05" value={bounceLight}
               onChange={e => onChange('bounceLight', Number(e.target.value))} aria-label="Bounce Light" />

        <span className="field__label" style={{ marginTop: 12 }}>Background Tint</span>
        <label className="customcolour">
          <input type="color" value={bgColor}
                 onChange={e => onChange('bgColor', e.target.value)}
                 aria-label="Background tint" />
          <span>Custom tint <b className="customcolour__hex">{bgColor.toUpperCase()}</b></span>
        </label>

        <span className="field__hint" style={{ marginTop: 12 }}>
          Changes to lighting are visible immediately in the 3D view.
        </span>
      </div>
    </>
  );
}

/** Tiny SVG preview so the library reads as shapes, not words. */
function ElementIcon({ kind }) {
  const c = { fill: 'var(--accent, #4E86C7)', stroke: 'rgba(26,24,21,.45)', strokeWidth: 1.5 };
  return (
    <svg width="30" height="30" viewBox="-16 -16 32 32" aria-hidden="true">
      {kind === 'rect'     && <rect x="-12" y="-12" width="24" height="24" rx="4" {...c} />}
      {kind === 'capsule'  && <rect x="-14" y="-7" width="28" height="14" rx="7" {...c} />}
      {kind === 'cylinder' && <rect x="-7" y="-13" width="14" height="26" rx="3" {...c} />}
      {kind === 'cone'     && <polygon points="0,-13 12,11 -12,11" {...c} />}
      {kind === 'circle'   && <circle cx="0" cy="0" r="12" {...c} />}
      {kind === 'ellipse'  && <ellipse cx="0" cy="0" rx="14" ry="9" {...c} />}
      {kind === 'leaf'     && <path d="M -13 0 C -7 -10 7 -10 13 0 C 7 10 -7 10 -13 0 Z" {...c} />}
      {kind === 'torus'    && <path d="M -13 0 A 13 13 0 1 0 13 0 A 13 13 0 1 0 -13 0 Z M -6 0 A 6 6 0 1 1 6 0 A 6 6 0 1 1 -6 0 Z"
                                    fillRule="evenodd" {...c} />}
      {kind === 'star'     && <polygon points="0,-13 3.8,-4 13,-4 5.6,2 8.4,11 0,5.5 -8.4,11 -5.6,2 -13,-4 -3.8,-4" {...c} />}
    </svg>
  );
}

/* ---------------- per-element properties ---------------- */
function ElementProperties({
  el, lockRatio, onLockRatio, onPatch, onGestureStart, onGesture, onGestureEnd, onDuplicate, onRemove,
}) {
  // The ratio is captured when the gesture STARTS. Reading it from the live
  // element each render let rounding feed back into itself, so a locked drag
  // drifted; and with the lock off the two sliders must not touch each other.
  const ratioRef = useRef(el.h ? el.w / el.h : 1);
  const beginScrub = () => {
    ratioRef.current = el.h ? el.w / el.h : 1;
    onGestureStart();
  };

  const scrub = (key) => ({
    onPointerDown: beginScrub,
    onKeyDown: (e) => { if (e.key.startsWith('Arrow')) beginScrub(); },
    onPointerUp: () => onGestureEnd('resize element'),
    onBlur: () => onGestureEnd('resize element'),
    onChange: (e) => {
      const v = Number(e.target.value);
      const r = ratioRef.current || 1;
      if (!lockRatio) { onGesture({ [key]: v }); return; }
      if (key === 'w') onGesture({ w: v, h: clampSide(Math.round(v / r)) });
      else onGesture({ h: v, w: clampSide(Math.round(v * r)) });
    },
  });

  const setSide = (key) => (e) => {
    const v = clampSide(Math.round(cmToUnits(Number(e.target.value) || 0)));
    const r = el.h ? el.w / el.h : 1;
    if (!lockRatio) onPatch({ [key]: v }, 'resize element');
    else if (key === 'w') onPatch({ w: v, h: clampSide(Math.round(v / r)) }, 'resize element');
    else onPatch({ h: v, w: clampSide(Math.round(v * r)) }, 'resize element');
  };

  return (
    <>
      <div className="panel__section">
        <span className="field__label">Position — centimetres from the centre</span>
        <div className="numrow">
          <label className="numlabel">X
            <input className="num" type="number" step="0.5" value={round1(unitsToCm(el.x))}
                   min={-130} max={130}
                   onChange={e => onPatch({ x: Math.round(cmToUnits(Number(e.target.value) || 0)) }, 'move element')}
                   data-testid="el-x" />
          </label>
          <label className="numlabel">Y
            <input className="num" type="number" step="0.5" value={round1(unitsToCm(el.y))}
                   min={-130} max={130}
                   onChange={e => onPatch({ y: Math.round(cmToUnits(Number(e.target.value) || 0)) }, 'move element')}
                   data-testid="el-y" />
          </label>
        </div>
      </div>

      <div className="panel__section">
        <span className="field__label">Size — centimetres</span>
        <div className="numrow">
          <label className="numlabel">W
            <input className="num" type="number" step="0.5" min="0.3" max="23"
                   value={round1(unitsToCm(el.w))} onChange={setSide('w')} data-testid="el-w-num" />
          </label>
          <label className="numlabel">H
            <input className="num" type="number" step="0.5" min="0.3" max="23"
                   value={round1(unitsToCm(el.h))} onChange={setSide('h')} data-testid="el-h-num" />
          </label>
        </div>
        <span className="field__label" style={{ marginTop: 10 }}>Width</span>
        <input className="slider" type="range" min="6" max="460" step="2" value={el.w}
               aria-label="Element width" data-testid="el-w" {...scrub('w')} />
        <span className="field__label">Height</span>
        <input className="slider" type="range" min="6" max="460" step="2" value={el.h}
               aria-label="Element height" data-testid="el-h" {...scrub('h')} />
        <label className="checkrow">
          <input type="checkbox" checked={lockRatio} onChange={e => onLockRatio(e.target.checked)}
                 data-testid="lock-ratio" />
          Lock aspect ratio — width and height change together
        </label>
      </div>

      <div className="panel__section">
        <span className="field__label">Rotation — {el.rot}°</span>
        <input className="slider" type="range" min="-180" max="180" step="1" value={el.rot}
               aria-label="Element rotation" data-testid="el-rot" {...scrub('rot')} />
        <span className="field__label">Depth — {el.z}</span>
        <input className="slider" type="range" min="-200" max="200" step="1" value={el.z}
               aria-label="Element depth" data-testid="el-z" {...scrub('z')} />
        <span className="field__hint">
          Depth stacks elements in 2D and moves them toward or away from you in 3D.
        </span>
      </div>

      <div className="panel__section">
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--sm" style={{ flex: 1 }} onClick={onDuplicate} data-testid="el-duplicate">
            Duplicate
          </button>
          <button className="btn btn--sm btn--danger" style={{ flex: 1 }} onClick={onRemove} data-testid="el-delete">
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const clampSide = (n) => Math.max(6, Math.min(460, n));
const round1 = (n) => Math.round(n * 10) / 10;

/* ---------------- where the character sits on the board ---------------- */
const ANCHORS = [
  ['nw', 'Top left'], ['n', 'Top'], ['ne', 'Top right'],
  ['w', 'Left'], ['c', 'Centre'], ['e', 'Right'],
  ['sw', 'Bottom left'], ['s', 'Bottom'], ['se', 'Bottom right'],
];

function PlacementSection({ character, offset, onChange, onAlign, onGestureStart, onGesture, onGestureEnd }) {
  const b = boundsOf(character);
  const scrub = (key, label) => ({
    onPointerDown: onGestureStart,
    onPointerUp: () => onGestureEnd(label),
    onBlur: () => onGestureEnd(label),
    onChange: (e) => onGesture({ [key]: Number(e.target.value) }),
  });

  return (
    <div className="panel__section" data-testid="placement-section">
      <span className="field__label">Placement — centimetres from the centre</span>
      <div className="numrow">
        <label className="numlabel">X
          <input className="num" type="number" step="0.5" value={round1(unitsToCm(offset.x))}
                 onChange={e => onChange({ x: Math.round(cmToUnits(Number(e.target.value) || 0)) })}
                 aria-label="Character placement X in centimetres" data-testid="place-x" />
        </label>
        <label className="numlabel">Y
          <input className="num" type="number" step="0.5" value={round1(unitsToCm(offset.y))}
                 onChange={e => onChange({ y: Math.round(cmToUnits(Number(e.target.value) || 0)) })}
                 aria-label="Character placement Y in centimetres" data-testid="place-y" />
        </label>
      </div>

      <span className="field__label" style={{ marginTop: 10 }}>Depth (3D) — {round1(unitsToCm(offset.z))} cm</span>
      <input className="slider" type="range" min="-400" max="400" step="4" value={offset.z}
             aria-label="Character depth" data-testid="place-z" {...scrub('z', 'move character')} />

      <span className="field__label" style={{ marginTop: 10 }}>Align to the board</span>
      <div className="anchors" role="group" aria-label="Align character">
        {ANCHORS.map(([key, label]) => (
          <button key={key} className="anchor" title={label} aria-label={label}
                  onClick={() => onAlign(key)} data-testid={`align-${key}`}>
            <span className={`anchor__dot anchor__dot--${key}`} />
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn btn--sm" style={{ flex: 1 }}
                onClick={() => onChange({ x: 0, y: 0, z: 0 })} data-testid="place-reset">
          Reset to centre
        </button>
      </div>
      <span className="field__hint">
        Drag the character on either canvas to place it. Artwork measures{' '}
        {round1(unitsToCm(b.w))} × {round1(unitsToCm(b.h))} cm.
      </span>
    </div>
  );
}

/* ---------------- the artboard: physical size, grid and snapping ---------------- */
function ArtboardSection({ canvas, onChange, snapCm, onSnapCm, showGrid, onShowGrid }) {
  const [lo, hi] = CANVAS_LIMITS.width;
  const PRESETS = [
    { label: 'Square 20', w: 20, h: 20 },
    { label: 'Wide 30×20', w: 30, h: 20 },
    { label: 'A4 portrait', w: 21, h: 29.7 },
  ];
  return (
    <div className="panel__section" data-testid="artboard-section">
      <span className="field__label">Artboard — centimetres</span>
      <div className="numrow">
        <label className="numlabel">W
          <input className="num" type="number" min={lo} max={hi} step="0.5" value={canvas.width}
                 onChange={e => onChange({ width: clampNum(e.target.value, lo, hi) })}
                 aria-label="Canvas width in centimetres" data-testid="canvas-w" />
        </label>
        <label className="numlabel">H
          <input className="num" type="number" min={lo} max={hi} step="0.5" value={canvas.height}
                 onChange={e => onChange({ height: clampNum(e.target.value, lo, hi) })}
                 aria-label="Canvas height in centimetres" data-testid="canvas-h" />
        </label>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {PRESETS.map(p => (
          <button key={p.label} className="btn btn--sm" onClick={() => onChange({ width: p.w, height: p.h })}>
            {p.label}
          </button>
        ))}
      </div>
      <span className="field__hint">
        The board is what the game team receive. Between {lo} and {hi} cm on each side.
      </span>

      <label className="checkrow">
        <input type="checkbox" checked={showGrid} onChange={e => onShowGrid(e.target.checked)} />
        Show grid in both views
      </label>
      <label className="checkrow">
        <input type="checkbox" checked={snapCm > 0} onChange={e => onSnapCm(e.target.checked ? 0.5 : 0)} />
        Snap to the grid while dragging
      </label>
      {snapCm > 0 && (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {[0.25, 0.5, 1].map(v => (
            <button key={v} className="btn btn--sm" aria-pressed={snapCm === v}
                    onClick={() => onSnapCm(v)}>{v} cm</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- FR13 — export ---------------- */
const FORMATS = [
  { key: 'pdf',     label: 'PDF spec sheet',   hint: 'Every view, dimensions and statistics' },
  { key: 'png2d',   label: 'PNG — 2D front',   hint: 'Flat artwork at export resolution' },
  { key: 'png2ds',  label: 'PNG — 2D side',    hint: 'The side elevation, same resolution' },
  { key: 'png3d',   label: 'PNG — 3D view',    hint: 'Rendered at your current angle' },
  { key: 'svg',     label: 'SVG — 2D artwork', hint: 'Vector of the drawn elevation' },
  { key: 'glb',     label: 'GLB — 3D model',   hint: 'Real geometry for the game engine' },
  { key: 'gltf',    label: 'glTF — 3D model',  hint: 'The same model as readable JSON' },
  { key: 'json',    label: 'JSON definition',  hint: 'Rebuildable by the game' },
];

const IMAGE_FORMATS = new Set(['pdf', 'png2d', 'png2ds', 'png3d']);
const EXTENSION = { png2d: 'png', png2ds: 'png', png3d: 'png' };

const RESOLUTIONS = [
  { key: 'screen', label: 'Standard', width: 1200 },
  { key: 'print',  label: 'High',     width: 2000 },
];

function ExportDialog({ character, withGrid, onWithGrid, defaultResolution = 'screen', get3DCamera, onClose }) {
  const { push } = useToasts();
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(defaultResolution);

  const stats = useMemo(() => characterStats(character), [character]);
  const width = RESOLUTIONS.find(r => r.key === res)?.width ?? 1200;
  const name = slug(character.name);

  const find2DSvg = () =>
    document.querySelector('#export-2d svg') || document.querySelector('.artboard[data-pose="front"] svg')
    || document.querySelector('.artboard svg');
  const findSideSvg = () => document.querySelector('#export-2d-side svg');
  // The drawing itself, whichever elevation that is for this shape.
  const findDrawnSvg = () =>
    (drawnPoseOf(character) === 'side' ? findSideSvg() : find2DSvg()) ?? find2DSvg();

  async function run() {
    setBusy(true);
    try {
      if (format === 'glb' || format === 'gltf') {
        const { characterToGltfBlob } = await loadExporters();
        const binary = format === 'glb';
        downloadBlob(await characterToGltfBlob(character, { binary }), `${name}.${format}`);

      } else if (format === 'png2ds') {
        const { svgToPngBlob } = await loadExporters();
        downloadBlob(await svgToPngBlob(findSideSvg(), { width }), `${name}-2d-side.png`);

      } else if (format === 'json') {
        const res2 = await fetch(api.exportUrl(character._id), {
          headers: { Authorization: `Bearer ${localStorage.getItem('cd.token')}` },
        });
        if (!res2.ok) throw new Error('Export failed.');
        downloadBlob(await res2.blob(), `${name}.json`);

      } else if (format === 'svg') {
        const svg = findDrawnSvg();
        const src = svg ? new XMLSerializer().serializeToString(svg)
                        : '<svg xmlns="http://www.w3.org/2000/svg"/>';
        downloadBlob(new Blob([src], { type: 'image/svg+xml' }), `${name}.svg`);

      } else if (format === 'png2d') {
        const { svgToPngBlob } = await loadExporters();
        downloadBlob(await svgToPngBlob(find2DSvg(), { width }), `${name}-2d.png`);

      } else if (format === 'png3d') {
        const { render3DToPngBlob } = await loadExporters();
        const blob = await render3DToPngBlob(character, {
          width, height: Math.round(width * 0.78), showGrid: withGrid, camera: get3DCamera?.(),
        });
        downloadBlob(blob, `${name}-3d.png`);

      } else {
        // PDF — a missing 3D context must not lose the rest of the sheet
        const { svgToPngBlob, render3DToPngBlob, buildPdfBlob } = await loadExporters();
        const png2d = await blobToDataUrl(await svgToPngBlob(find2DSvg(), { width }));
        let png2dSide = null;
        try {
          png2dSide = await blobToDataUrl(await svgToPngBlob(findSideSvg(), { width }));
        } catch { /* the side elevation is a bonus panel, never the sheet */ }
        let png3d = null;
        try {
          png3d = await blobToDataUrl(await render3DToPngBlob(character, {
            width, height: Math.round(width * 0.78), showGrid: withGrid, camera: get3DCamera?.(),
          }));
        } catch (e) {
          push({ message: `3D image left out: ${e.message}`, tone: 'error' });
        }
        downloadBlob(await buildPdfBlob(character, { png2d, png2dSide, png3d, stats }), `${name}.pdf`);
      }

      push({ message: `Exported ${name}.${EXTENSION[format] ?? format}` });
      onClose();
    } catch (e) {
      push({ message: e.message, tone: 'error' });
    } finally { setBusy(false); }
  }

  const isImage = IMAGE_FORMATS.has(format);

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="exp-title"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal--export">
        <h2 className="modal__title" id="exp-title">Export character</h2>
        <p className="modal__body">
          The game team receive a file, not a screenshot. GLB and glTF carry the character as
          real geometry; the PDF carries both elevations and the render on one sheet.
        </p>

        <div className="exportgrid">
          <div>
            <span className="field__label">Format</span>
            <div className="fmtlist" role="group" aria-label="Export format">
              {FORMATS.map(f => (
                <button key={f.key} className="fmt" aria-pressed={format === f.key}
                        onClick={() => setFormat(f.key)} data-testid={`fmt-${f.key}`}>
                  <span className="fmt__name">{f.label}</span>
                  <span className="fmt__hint">{f.hint}</span>
                </button>
              ))}
            </div>

            {isImage && (
              <div className="panel__section" style={{ marginTop: 14 }}>
                <span className="field__label">Image size</span>
                <div className="row" style={{ gap: 6 }}>
                  {RESOLUTIONS.map(r => (
                    <button key={r.key} className="btn btn--sm" aria-pressed={res === r.key}
                            onClick={() => setRes(r.key)} data-testid={`res-${r.key}`}>
                      {r.label} · {r.width}px
                    </button>
                  ))}
                </div>
                <label className="checkrow">
                  <input type="checkbox" checked={withGrid} data-testid="export-grid"
                         onChange={e => onWithGrid(e.target.checked)} />
                  Include the centimetre grid
                </label>
              </div>
            )}
          </div>

          {/* the same numbers the PDF carries, shown here before you commit */}
          <div className="statcard" data-testid="export-stats">
            <span className="field__label">Dimensions</span>
            <dl className="statlist">
              <Row k="Artboard" v={`${stats.board.width} × ${stats.board.height} cm`} />
              <Row k="Artwork" v={stats.artwork.empty ? 'empty' : `${stats.artwork.w} × ${stats.artwork.h} cm`} />
              <Row k="Scale" v={`${stats.scalePercent}%`} />
              <Row k="Placement" v={`${stats.placement.x}, ${stats.placement.y} cm`} />
            </dl>

            <span className="field__label" style={{ marginTop: 12 }}>Statistics</span>
            <dl className="statlist">
              <Row k="Primitives 2D" v={stats.counts.prims2d} />
              <Row k="Primitives 3D" v={`${stats.counts.prims3d} (${stats.counts.meshes} meshes)`} />
              <Row k="Parts" v={stats.counts.parts} />
              <Row k="Elements" v={stats.counts.elements} />
            </dl>

            <span className="field__label" style={{ marginTop: 12 }}>
              Colours used ({stats.usedColours.length})
            </span>
            <div className="chiprow">
              {stats.usedColours.map(c => (
                <span key={c.name} className="chip" title={c.name}>
                  <span className="chip__dot" style={{ background: c.hex }} />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="modal__foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" onClick={run} disabled={busy} data-testid="run-export">
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="statlist__row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

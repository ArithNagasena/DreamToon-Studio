import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Character2D from '../components/Character2D.jsx';
import { api } from '../lib/api.js';
import { useToasts } from '../lib/useToasts.jsx';
import { useAuth } from '../lib/useAuth.jsx';
import { useSettings } from '../lib/useSettings.jsx';
import {
  SHAPES, defaultCharacter, characterFromTemplate,
  DEFAULT_CANVAS, CANVAS_LIMITS,
} from '@shared/character.js';

const TYPES = [
  { key: 'animal', label: 'Animal', blurb: 'cows, hens, fish' },
  { key: 'plant',  label: 'Plant',  blurb: 'trees, flowers, sprouts' },
  { key: 'human',  label: 'Human',  blurb: 'children, adults' },
  { key: 'custom', label: 'From scratch', blurb: 'an empty artboard' },
];
const SAMPLE = { animal: 'quadruped', plant: 'flower', human: 'child', custom: 'blank' };

/**
 * FR10 then FR1 — pick what you are making, then how it starts.
 *
 * Step two offers two routes to the same place: a finished template, which is
 * the fast path a beginner asked for, or a bare shape for someone who would
 * rather choose every colour themselves. Both land in the same editor, and a
 * template is only a starting point — nothing about it is locked afterwards.
 */
export default function NewCharacter() {
  const nav = useNavigate();
  const { push } = useToasts();
  const { refresh } = useAuth();
  const { settings } = useSettings();
  const [step, setStep] = useState(1);
  const [type, setType] = useState(null);
  const [source, setSource] = useState('templates');   // templates | shapes
  const [shape, setShape] = useState(null);
  const [template, setTemplate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canvas, setCanvas] = useState(settings.defaultCanvas);

  const shapes = useMemo(
    () => Object.entries(SHAPES).filter(([, s]) => s.type === type).map(([key, s]) => ({ key, ...s })),
    [type]
  );
  const forType = useMemo(() => templates.filter(t => t.type === type), [templates, type]);

  useEffect(() => { setShape(null); setTemplate(null); }, [type]);
  useEffect(() => { setCanvas(settings.defaultCanvas); }, [settings.defaultCanvas]);

  // A scratch project has no templates by definition, so it skips straight to
  // the artboard rather than showing an empty gallery.
  useEffect(() => {
    if (type === 'custom') { setSource('shapes'); setShape('blank'); }
    else setSource('templates');
  }, [type]);

  useEffect(() => {
    let live = true;
    setLoadingTemplates(true);
    api.templates()
      .then(d => { if (live) setTemplates(d.templates ?? []); })
      .catch(() => { if (live) setTemplates([]); })
      .finally(() => { if (live) setLoadingTemplates(false); });
    return () => { live = false; };
  }, []);

  const ready = source === 'templates' ? !!template : !!shape;

  async function create() {
    if (!ready) return;
    setBusy(true);
    try {
      const scratch = source === 'shapes' && !!SHAPES[shape]?.scratch;
      const body = source === 'templates'
        ? { template, canvas: DEFAULT_CANVAS }
        : {
            shape,
            name: scratch ? 'Untitled project' : `Untitled ${SHAPES[shape].label.toLowerCase()}`,
            canvas: scratch ? canvas : DEFAULT_CANVAS,
          };
      const { character } = await api.create(body);
      refresh();
      nav(`/c/${character._id}`, { replace: true });
    } catch (e) {
      push({ message: e.message, tone: 'error' });
      setBusy(false);
    }
  }

  async function removeTemplate(t) {
    try {
      await api.deleteTemplate(String(t.key).slice(5));
      setTemplates(list => list.filter(x => x.key !== t.key));
      if (template === t.key) setTemplate(null);
      refresh();
      push({ message: `Template “${t.name}” deleted` });
    } catch (e) {
      push({ message: e.message, tone: 'error' });
    }
  }

  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <div className="wizard">
          <nav className="crumbs" aria-label="Progress">
            <span>New character</span><span aria-hidden="true">›</span>
            {step === 1 ? <b>Type</b> : <><span>{TYPES.find(t => t.key === type)?.label}</span><span aria-hidden="true">›</span><b>Start</b></>}
          </nav>
          <div className="progress"><div className="progress__fill" style={{ width: step === 1 ? '50%' : '100%' }} /></div>

          {step === 1 ? (
            <>
              <h1 className="page__title" style={{ textAlign: 'center', marginBottom: 6 }}>What are you making?</h1>
              <p className="page__sub" style={{ textAlign: 'center', marginBottom: 'var(--s6)' }}>
                Your choice filters the templates and shapes on the next step.
              </p>
              <div className="choices">
                {TYPES.map(t => (
                  <button key={t.key} className="choice" aria-pressed={type === t.key}
                          onClick={() => setType(t.key)} data-testid={`type-${t.key}`}>
                    <div className="choice__art">
                      {t.key === 'custom'
                        ? <EmptyArt size={140} />
                        : <Character2D character={defaultCharacter(SAMPLE[t.key])} size={140} scale={false} showSelection={false} />}
                    </div>
                    <p className="choice__name">{t.label}</p>
                    <p className="choice__blurb">{t.blurb}</p>
                  </button>
                ))}
              </div>
              <div className="wizard__foot">
                <button className="btn" onClick={() => nav('/')}>Cancel</button>
                <button className="btn btn--primary btn--lg" disabled={!type}
                        onClick={() => setStep(2)} data-testid="wizard-next">Next →</button>
              </div>
            </>
          ) : (
            <>
              <h1 className="page__title" style={{ textAlign: 'center', marginBottom: 6 }}>
                {type === 'custom' ? 'Start a new project' : 'How do you want to start?'}
              </h1>
              <p className="page__sub" style={{ textAlign: 'center', marginBottom: 'var(--s5)' }}>
                {type === 'custom'
                  ? 'You get an empty artboard and the full shape library to drag from.'
                  : 'A template is a finished character you can change completely — colours, shape, parts and all.'}
              </p>

              {type !== 'custom' && (
                <div className="seg seg--center" role="group" aria-label="Starting point">
                  <button className="seg__btn" aria-pressed={source === 'templates'}
                          onClick={() => setSource('templates')} data-testid="source-templates">
                    Templates{forType.length ? ` (${forType.length})` : ''}
                  </button>
                  <button className="seg__btn" aria-pressed={source === 'shapes'}
                          onClick={() => setSource('shapes')} data-testid="source-shapes">
                    Blank shapes
                  </button>
                </div>
              )}

              {source === 'templates' ? (
                loadingTemplates ? (
                  <p className="muted" style={{ textAlign: 'center', padding: 'var(--s6)' }}>Loading templates…</p>
                ) : forType.length === 0 ? (
                  <div className="empty">
                    <p className="empty__title">No templates for this type yet</p>
                    <p className="empty__body">
                      Save any character as a template from the editor, and it appears here next time.
                    </p>
                    <button className="btn" onClick={() => setSource('shapes')}>Start from a blank shape</button>
                  </div>
                ) : (
                  <div className="choices" data-testid="template-gallery">
                    {forType.map(t => (
                      <div key={t.key} className="choicewrap">
                        <button className="choice" aria-pressed={template === t.key}
                                onClick={() => setTemplate(t.key)} data-testid={`template-${t.key}`}>
                          <div className="choice__art">
                            <Character2D character={characterFromTemplate(t)} size={150} scale={false} showSelection={false} />
                          </div>
                          <p className="choice__name">{t.name}</p>
                          <p className="choice__blurb">{t.blurb || SHAPES[t.shape]?.label}</p>
                          <span className={`tag ${t.builtIn ? '' : 'tag--mine'}`}>
                            {t.builtIn ? 'Built in' : 'Yours'}
                          </span>
                        </button>
                        {!t.builtIn && (
                          <button className="choice__del" onClick={() => removeTemplate(t)}
                                  aria-label={`Delete template ${t.name}`} data-testid={`del-template-${t.key}`}>
                            Delete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="choices">
                  {shapes.map(s => (
                    <button key={s.key} className="choice" aria-pressed={shape === s.key}
                            onClick={() => setShape(s.key)} data-testid={`shape-${s.key}`}>
                      <div className="choice__art">
                        {s.scratch
                          ? <EmptyArt size={150} />
                          : <Character2D character={defaultCharacter(s.key)} size={150} scale={false} showSelection={false} />}
                      </div>
                      <p className="choice__name">{s.label}</p>
                      <p className="choice__blurb">
                        {s.scratch ? 'no preset parts · drag your own shapes in' : `${s.parts.length} editable parts · ${s.blurb}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {source === 'shapes' && SHAPES[shape]?.scratch && (
                <CanvasSize canvas={canvas} onChange={setCanvas} />
              )}

              <div className="wizard__foot">
                <button className="btn" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn--accent btn--lg" disabled={!ready || busy}
                        onClick={create} data-testid="wizard-create">
                  {busy ? 'Creating…' : 'Create →'}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** Placeholder art for the blank-canvas option — an empty artboard reads
 *  as "you start with nothing", which is exactly the offer. */
function EmptyArt({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"
         style={{ display: 'block', maxWidth: '100%' }}>
      <rect x="12" y="12" width="76" height="76" rx="6"
            fill="#fff" stroke="var(--line, #d8d2c8)" strokeWidth="2" strokeDasharray="6 5" />
      <path d="M50 36 v28 M36 50 h28" stroke="var(--muted, #8a8279)"
            strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Physical size of a new project's artboard, in centimetres. */
function CanvasSize({ canvas, onChange }) {
  const [lo, hi] = CANVAS_LIMITS.width;
  const PRESETS = [
    { label: 'Square 20 × 20', w: 20, h: 20 },
    { label: 'Wide 30 × 20', w: 30, h: 20 },
    { label: 'Tall 20 × 30', w: 20, h: 30 },
    { label: 'A4 21 × 29.7', w: 21, h: 29.7 },
  ];
  const set = (key) => (e) => {
    const n = Number(e.target.value);
    onChange({ ...canvas, [key]: Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 20)) });
  };
  const active = (p) => canvas.width === p.w && canvas.height === p.h;

  return (
    <section className="canvassize" aria-labelledby="cs-title">
      <h2 className="canvassize__title" id="cs-title">Canvas size</h2>
      <p className="canvassize__sub">
        Give the artboard its physical size. The game team receive artwork at these dimensions,
        and the grid is ruled in the same centimetres.
      </p>

      <div className="canvassize__row">
        <label className="numlabel">Width
          <input className="num" type="number" min={lo} max={hi} step="0.5" value={canvas.width}
                 onChange={set('width')} aria-label="Canvas width in centimetres"
                 data-testid="new-canvas-w" />
        </label>
        <span className="canvassize__x" aria-hidden="true">×</span>
        <label className="numlabel">Height
          <input className="num" type="number" min={lo} max={hi} step="0.5" value={canvas.height}
                 onChange={set('height')} aria-label="Canvas height in centimetres"
                 data-testid="new-canvas-h" />
        </label>
        <span className="canvassize__unit">cm</span>
      </div>

      <div className="canvassize__presets">
        {PRESETS.map(p => (
          <button key={p.label} className="btn btn--sm" aria-pressed={active(p)}
                  onClick={() => onChange({ width: p.w, height: p.h })}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="canvassize__preview" aria-hidden="true">
        <div className="canvassize__paper"
             style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }} />
      </div>
    </section>
  );
}

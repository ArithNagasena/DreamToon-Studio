import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Character2D from '../components/Character2D.jsx';
import { api } from '../lib/api.js';
import { useToasts } from '../lib/useToasts.jsx';
import { useAuth } from '../lib/useAuth.jsx';
import { useSettings } from '../lib/useSettings.jsx';
import { UNDO_WINDOW_MS } from '@shared/character.js';

const TYPES = [
  { key: '', label: 'All' },
  { key: 'animal', label: 'Animal' },
  { key: 'plant', label: 'Plant' },
  { key: 'human', label: 'Human' },
  { key: 'custom', label: 'Scratch' },
];

const SORTS = [
  { key: 'updated', label: 'Last edited' },
  { key: 'created', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name', label: 'Name A–Z' },
];

/** Quick ranges, because "the last week" is how designers actually search. */
const RANGES = [
  { key: 'any', label: 'Any date', days: null },
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: 'custom', label: 'Custom…', days: null },
];

const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => isoDay(new Date(Date.now() - n * 86400000));

const when = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
};

export default function Library() {
  const nav = useNavigate();
  const { push } = useToasts();
  const { refresh } = useAuth();
  const { settings } = useSettings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('updated');
  const [range, setRange] = useState('any');
  const [dates, setDates] = useState({ createdFrom: '', createdTo: '' });
  const [confirm, setConfirm] = useState(null);

  // The quick ranges and the two date boxes are one filter, so the boxes show
  // what a quick range means rather than sitting empty and contradicting it.
  const bounds = useMemo(() => {
    const chosen = RANGES.find(r => r.key === range);
    if (chosen?.days) return { createdFrom: daysAgo(chosen.days), createdTo: isoDay(new Date()) };
    if (range === 'custom') return dates;
    return { createdFrom: '', createdTo: '' };
  }, [range, dates]);

  const filtered = !!(q || type || bounds.createdFrom || bounds.createdTo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.list({ q, type, sort, ...bounds })).items);
    } catch (e) {
      push({ message: e.message, tone: 'error' });
    } finally { setLoading(false); }
  }, [q, type, sort, bounds, push]);

  useEffect(() => { const t = setTimeout(load, q ? 220 : 0); return () => clearTimeout(t); }, [load, q]);

  function clearFilters() {
    setQ(''); setType(''); setRange('any'); setDates({ createdFrom: '', createdTo: '' });
  }

  async function doDelete(c) {
    setConfirm(null);
    try {
      await api.remove(c._id);
      setItems(list => list.filter(x => x._id !== c._id));
      refresh();
      push({
        message: `“${c.name}” deleted`,
        ttl: UNDO_WINDOW_MS,
        action: { label: 'Undo', onClick: async () => {
          try { await api.restore(c._id); load(); refresh(); push({ message: `“${c.name}” restored` }); }
          catch (e) { push({ message: e.message, tone: 'error' }); }
        } },
      });
    } catch (e) { push({ message: e.message, tone: 'error' }); }
  }

  // "Ask before deleting" off still gives the ten-second undo, so the safety
  // net is never actually removed — only the interruption is.
  const askThenDelete = (c) => (settings.confirmDelete ? setConfirm(c) : doDelete(c));

  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <div className="page__inner">
          <div className="page__head">
            <div>
              <h1 className="page__title">My characters</h1>
              <p className="page__sub" data-testid="library-count">
                {loading ? 'Loading…' : `${items.length} character${items.length === 1 ? '' : 's'}${filtered ? ' match this search' : ''}`}
              </p>
            </div>
            <div className="spacer" />
            <button className="btn btn--accent btn--lg" onClick={() => nav('/new')} data-testid="new-character">
              + New character
            </button>
          </div>

          <div className="command-bar">
            <div className="command-bar__row">
              <div className="search">
                <span className="search__icon" aria-hidden="true">⌕</span>
                <input className="input" placeholder="Search by name" value={q}
                       onChange={e => setQ(e.target.value)} aria-label="Search characters" data-testid="search" />
              </div>
              <div className="chips" role="group" aria-label="Filter by type">
                {TYPES.map(t => (
                  <button key={t.key} className="chip" aria-pressed={type === t.key}
                          onClick={() => setType(t.key)} data-testid={`filter-${t.label.toLowerCase()}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="spacer" />
              <label className="row" style={{ gap: 8, fontSize: 'var(--t-sm)', color: 'var(--text-3)', fontWeight: 600 }}>
                Sort
                <select className="input" style={{ width: 150, height: 36 }} value={sort}
                        onChange={e => setSort(e.target.value)} aria-label="Sort characters" data-testid="sort">
                  {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <div className="command-bar__row" data-testid="date-filter">
              <span className="field__label" style={{ margin: 0, paddingRight: 8 }}>Created</span>
              <div className="chips" role="group" aria-label="Filter by creation date">
                {RANGES.map(r => (
                  <button key={r.key} className="chip" aria-pressed={range === r.key}
                          onClick={() => setRange(r.key)} data-testid={`range-${r.key}`}>
                    {r.label}
                  </button>
                ))}
              </div>
              {range === 'custom' && (
                <div className="row" style={{ gap: 8, marginLeft: 8 }}>
                  <label className="row" style={{ gap: 6, fontSize: 'var(--t-sm)', color: 'var(--text-3)', fontWeight: 600 }}>
                    From
                    <input className="input" style={{ width: 150, height: 32 }} type="date"
                           value={dates.createdFrom} max={dates.createdTo || undefined}
                           onChange={e => setDates(d => ({ ...d, createdFrom: e.target.value }))}
                           aria-label="Created on or after" data-testid="created-from" />
                  </label>
                  <label className="row" style={{ gap: 6, fontSize: 'var(--t-sm)', color: 'var(--text-3)', fontWeight: 600 }}>
                    To
                    <input className="input" style={{ width: 150, height: 32 }} type="date"
                           value={dates.createdTo} min={dates.createdFrom || undefined}
                           onChange={e => setDates(d => ({ ...d, createdTo: e.target.value }))}
                           aria-label="Created on or before" data-testid="created-to" />
                  </label>
                </div>
              )}
              {filtered && (
                <>
                  <div className="spacer" />
                  <button className="btn btn--sm btn--ghost" onClick={clearFilters} data-testid="clear-filters">
                    Clear filters
                  </button>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="ccard" key={i}>
                  <div className="ccard__thumb"><div className="skel" style={{ width: '70%', height: '70%' }} /></div>
                  <div className="ccard__body">
                    <div className="skel" style={{ height: 13, width: '55%', marginBottom: 8 }} />
                    <div className="skel" style={{ height: 10, width: '35%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <p className="empty__title">{filtered ? 'Nothing matches that' : 'No characters yet'}</p>
              <p className="empty__body">
                {filtered ? 'Try a different search, a wider date range, or clear the filters.'
                          : 'Make your first one — it takes about a minute.'}
              </p>
              {filtered
                ? <button className="btn" onClick={clearFilters}>Clear filters</button>
                : <button className="btn btn--accent" onClick={() => nav('/new')}>+ New character</button>}
            </div>
          ) : (
            <div className="grid" data-testid="library-grid">
              {items.map(c => (
                <article className="ccard" key={c._id}>
                  <div className="ccard__thumb">
                    <Character2D character={c} size={190} scale={false} showSelection={false} />
                  </div>
                  <div className="ccard__body">
                    <h2 className="ccard__name">{c.name}</h2>
                    <p className="ccard__meta">
                      <span style={{ textTransform: 'capitalize' }}>{c.type}</span> · edited {when(c.updatedAt)}
                    </p>
                    <p className="ccard__meta" data-testid={`created-${c._id}`}>
                      Created {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                    <div className="ccard__actions">
                      <button className="btn btn--sm" onClick={() => nav(`/c/${c._id}`)}
                              data-testid={`open-${c.name.replace(/\s+/g, '-')}`}>Open</button>
                      <button className="btn btn--sm btn--danger" onClick={() => askThenDelete(c)}
                              data-testid={`delete-${c.name.replace(/\s+/g, '-')}`}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {confirm && (
        <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="del-title"
             onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="modal">
            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 96, height: 78, background: 'var(--canvas)', borderRadius: 8,
                            display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Character2D character={confirm} size={78} scale={false} showSelection={false} />
              </div>
              <div>
                <h2 className="modal__title" id="del-title">Delete “{confirm.name}”?</h2>
                <p className="modal__body">
                  This removes it from your library. You can undo for 10 seconds.
                </p>
              </div>
            </div>
            <div className="modal__foot">
              <button className="btn btn--primary" autoFocus onClick={() => setConfirm(null)}
                      data-testid="cancel-delete">Cancel</button>
              <button className="btn btn--danger" onClick={() => doDelete(confirm)}
                      data-testid="confirm-delete">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

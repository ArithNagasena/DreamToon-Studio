import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  validateCharacter, defaultCharacter, SHAPES, PALETTE,
  partsOf, UNDO_WINDOW_MS, ELEMENT_KINDS, MAX_ELEMENTS,
  CANVAS_LIMITS, DEFAULT_CANVAS, CM_UNITS, DEFAULT_OFFSET, OFFSET_LIMITS,
  BUILT_IN_TEMPLATES, TEMPLATES_BY_KEY, characterFromTemplate,
  variantAxesOf, optionalPartsOf, groupsOf, POSES, variantsOf, hiddenOf,
} from '../../../shared/character.js';

const SORTS = ['updated', 'name', 'created', 'oldest'];

export function characterRoutes(repo) {
  const r = Router();
  r.use(requireAuth(repo));

  const owns = (c, user) => c && String(c.owner) === String(user._id);

  /* Catalogue used by the create wizard and the colour panel. */
  r.get('/catalogue', (_req, res) => {
    res.json({
      palette: PALETTE,
      shapes: Object.entries(SHAPES).map(([key, s]) => ({
        key, label: s.label, type: s.type, blurb: s.blurb, parts: s.parts,
        scratch: !!s.scratch,
        optional: optionalPartsOf(key),
        groups: groupsOf(key),
        variants: variantAxesOf(key),
      })),
      elements: Object.entries(ELEMENT_KINDS).map(([key, e]) => ({
        key, label: e.label, kind: e.kind, w: e.w, h: e.h,
      })),
      templates: BUILT_IN_TEMPLATES,
      poses: POSES,
      maxElements: MAX_ELEMENTS,
      canvas: { limits: CANVAS_LIMITS, default: DEFAULT_CANVAS, unitsPerCm: CM_UNITS },
      offset: { limits: OFFSET_LIMITS, default: DEFAULT_OFFSET },
      sorts: SORTS,
    });
  });

  /* FR9 — the designer's own library, searchable and filterable. */
  r.get('/', async (req, res) => {
    const { q = '', type = '' } = req.query;
    const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'updated';
    // Date bounds are inclusive whole days: a designer looking for "work from
    // the 3rd" means all of the 3rd, not up to midnight at its start.
    const createdFrom = dayStart(req.query.createdFrom);
    const createdTo = dayEnd(req.query.createdTo);
    if (req.query.createdFrom && !createdFrom)
      return res.status(400).json({ error: 'Start date must be YYYY-MM-DD.' });
    if (req.query.createdTo && !createdTo)
      return res.status(400).json({ error: 'End date must be YYYY-MM-DD.' });

    const items = await repo.characters.listByOwner(req.user._id, { q, type, sort, createdFrom, createdTo });
    res.json({ items, total: items.length });
  });

  /* FR1, FR10 — create from a chosen type and shape, or from a template. */
  r.post('/', async (req, res) => {
    const { shape, name, canvas, template } = req.body || {};

    let base;
    if (template) {
      const tpl = TEMPLATES_BY_KEY[template] ?? await userTemplate(repo, req.user, template);
      if (!tpl) return res.status(400).json({ error: 'That template no longer exists.' });
      base = characterFromTemplate(tpl, name, canvas);
    } else {
      if (!SHAPES[shape]) return res.status(400).json({ error: 'Choose a starting shape.' });
      base = defaultCharacter(shape, name, canvas);
    }

    const { ok, errors, value } = validateCharacter(base);
    if (!ok) return res.status(400).json({ error: errors.join(' ') });
    const doc = await repo.characters.create({ ...value, owner: req.user._id });
    res.status(201).json({ character: doc });
  });

  r.get('/:id', async (req, res) => {
    const c = await repo.characters.findById(req.params.id);
    if (!owns(c, req.user) || c.deletedAt) return res.status(404).json({ error: 'Character not found.' });
    res.json({ character: c });
  });

  /* FR4, FR5, FR8, FR11 — save name, scale, per-part colours and variants. */
  r.put('/:id', async (req, res) => {
    const existing = await repo.characters.findById(req.params.id);
    if (!owns(existing, req.user) || existing.deletedAt)
      return res.status(404).json({ error: 'Character not found.' });

    const merged = {
      name:   req.body?.name   ?? existing.name,
      shape:  existing.shape,
      type:   existing.type,
      scale:  req.body?.scale  ?? existing.scale,
      colors: { ...existing.colors, ...(req.body?.colors || {}) },
      // Each variant axis is independent, so variants merge the way colours do:
      // naming one axis must not silently reset the others.
      variants: { ...existing.variants, ...(req.body?.variants || {}) },
      // The hidden list is one statement about which parts are off, so it is
      // replaced wholesale — the same contract as the element list.
      hidden:   req.body?.hidden   ?? existing.hidden   ?? [],
      // elements are replaced wholesale — the client owns layer order
      elements: req.body?.elements ?? existing.elements ?? [],
      canvas: req.body?.canvas ?? existing.canvas ?? undefined,
      offset: req.body?.offset ?? existing.offset ?? undefined,
      materials: req.body?.materials ?? existing.materials ?? {},
      lighting: req.body?.lighting ?? existing.lighting ?? {},
    };
    const { ok, errors, value } = validateCharacter(merged);
    if (!ok) return res.status(400).json({ error: errors.join(' ') });

    const updated = await repo.characters.update(req.params.id, {
      name: value.name, scale: value.scale, colors: value.colors,
      variants: value.variants, hidden: value.hidden,
      elements: value.elements ?? [],
      canvas: value.canvas,
      offset: value.offset,
      materials: value.materials,
      lighting: value.lighting,
    });
    res.json({ character: updated });
  });

  /* FR6 + FR12 — soft delete so the 10-second undo is real. */
  r.delete('/:id', async (req, res) => {
    const c = await repo.characters.findById(req.params.id);
    if (!owns(c, req.user) || c.deletedAt) return res.status(404).json({ error: 'Character not found.' });
    await repo.characters.softDelete(req.params.id);
    res.json({ ok: true, undoWindowMs: UNDO_WINDOW_MS, id: req.params.id });
  });

  r.post('/:id/restore', async (req, res) => {
    const c = await repo.characters.findById(req.params.id);
    if (!owns(c, req.user)) return res.status(404).json({ error: 'Character not found.' });
    if (!c.deletedAt) return res.json({ character: c });
    if (Date.now() - new Date(c.deletedAt).getTime() > UNDO_WINDOW_MS)
      return res.status(410).json({ error: 'The undo window has closed.' });
    res.json({ character: await repo.characters.restore(req.params.id) });
  });

  /* FR13 — export the character definition for the game team. */
  r.get('/:id/export', async (req, res) => {
    const c = await repo.characters.findById(req.params.id);
    if (!owns(c, req.user) || c.deletedAt) return res.status(404).json({ error: 'Character not found.' });
    const format = String(req.query.format || 'json').toLowerCase();
    const safe = c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    if (format === 'json') {
      const payload = {
        name: c.name, type: c.type, shape: c.shape, scale: c.scale,
        colors: c.colors, parts: partsOf(c.shape), elements: c.elements ?? [],
        variants: variantsOf(c), hidden: hiddenOf(c),
        canvas: c.canvas ?? DEFAULT_CANVAS, unitsPerCm: CM_UNITS,
        offset: c.offset ?? DEFAULT_OFFSET,
        exportedAt: new Date().toISOString(), schema: 'character-designer/v1',
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    }
    return res.status(400).json({ error: 'Supported formats: json. Images and glTF are exported from the browser.' });
  });

  return r;
}

/** A user template referenced as "user:<id>", checked against its owner. */
async function userTemplate(repo, user, key) {
  const id = String(key).startsWith('user:') ? String(key).slice(5) : null;
  if (!id) return null;
  const t = await repo.templates.findById(id);
  return t && String(t.owner) === String(user._id) ? t : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayStart(v) {
  if (!v || !DATE_RE.test(String(v))) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dayEnd(v) {
  if (!v || !DATE_RE.test(String(v))) return null;
  const d = new Date(`${v}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

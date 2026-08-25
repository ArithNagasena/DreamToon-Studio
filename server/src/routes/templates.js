import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  BUILT_IN_TEMPLATES, SHAPES, templateFromCharacter, validateVariants,
  validateElements, validateCanvas, isColorToken, isHexColor, partsOf, hiddenOf,
} from '../../../shared/character.js';

/** Normalise whatever the client sends into a storable template body. */
function cleanTemplate(body) {
  const errors = [];
  const name = String(body?.name ?? '').trim();
  if (!name) errors.push('Give the template a name.');
  if (name.length > 60) errors.push('Name must be 60 characters or fewer.');

  const shape = body?.shape;
  if (!SHAPES[shape]) errors.push('Unknown shape.');
  if (errors.length) return { ok: false, errors, value: null };

  const known = partsOf(shape);
  const colors = {};
  for (const [part, token] of Object.entries(body?.colors ?? {})) {
    if (!known.includes(part)) continue;
    if (!isColorToken(token)) { errors.push('Colour "' + token + '" is not a palette name or a #rrggbb value.'); continue; }
    colors[part] = isHexColor(token) ? String(token).toLowerCase() : token;
  }

  const scaleNum = Number(body?.scale ?? 1);
  const scale = Number.isFinite(scaleNum) ? Math.max(0.25, Math.min(2, scaleNum)) : 1;
  const els = validateElements(body?.elements ?? []);
  errors.push(...els.errors);
  const canvas = validateCanvas(body?.canvas);
  errors.push(...canvas.errors);

  return {
    ok: errors.length === 0,
    errors,
    value: {
      name, shape, type: SHAPES[shape].type,
      blurb: String(body?.blurb ?? '').trim().slice(0, 120),
      colors, scale,
      variants: validateVariants(shape, body?.variants),
      hidden: hiddenOf({ shape, hidden: body?.hidden }),
      elements: els.value ?? [],
      canvas: canvas.value,
    },
  };
}

export function templateRoutes(repo) {
  const r = Router();
  r.use(requireAuth(repo));

  /* The gallery the create wizard shows: the built-ins first, then the
     designer's own. Both render through the same card, so a saved template
     is a first-class starting point rather than a lesser one. */
  r.get('/', async (req, res) => {
    const mine = await repo.templates.listByOwner(req.user._id);
    const type = String(req.query.type || '');
    const all = [
      ...BUILT_IN_TEMPLATES,
      ...mine.map(t => ({ ...t, key: 'user:' + t._id, builtIn: false })),
    ];
    res.json({ templates: type ? all.filter(t => t.type === type) : all });
  });

  /* FR-template — save the character on screen as a reusable starting point. */
  r.post('/', async (req, res) => {
    const source = req.body?.characterId
      ? await repo.characters.findById(req.body.characterId)
      : null;
    if (req.body?.characterId) {
      if (!source || String(source.owner) !== String(req.user._id) || source.deletedAt)
        return res.status(404).json({ error: 'Character not found.' });
    }

    const body = source
      ? { ...templateFromCharacter(source, req.body?.name), blurb: req.body?.blurb }
      : req.body;

    const { ok, errors, value } = cleanTemplate(body);
    if (!ok) return res.status(400).json({ error: errors.join(' ') });

    const count = await repo.templates.countByOwner(req.user._id);
    if (count >= 40) return res.status(400).json({ error: 'You can keep up to 40 templates.' });

    const doc = await repo.templates.create({ ...value, owner: req.user._id });
    res.status(201).json({ template: { ...doc, key: 'user:' + doc._id, builtIn: false } });
  });

  r.delete('/:id', async (req, res) => {
    const t = await repo.templates.findById(req.params.id);
    if (!t || String(t.owner) !== String(req.user._id))
      return res.status(404).json({ error: 'Template not found.' });
    await repo.templates.remove(req.params.id);
    res.json({ ok: true, id: req.params.id });
  });

  return r;
}

/**
 * Character Designer — shared parametric character model.
 *
 * ONE definition drives BOTH views:
 *   · the 2D view renders `prims` filtered to views:'2d' as SVG shapes
 *   · the 3D view renders `prims` filtered to views:'3d' as three.js meshes
 *
 * Design space is y-DOWN (SVG convention). The 3D renderer flips y.
 * Every primitive belongs to a named part, and a part is the unit a
 * designer selects and recolours (FR11).
 *
 * On top of the fixed shape catalogue a character may carry `elements` —
 * free primitives the designer drags onto the canvas and positions by hand.
 * They are stored on the document, so a character built entirely from
 * elements (the `blank` shape) is a project made from scratch.
 */

export const PALETTE = [
  { name: 'Snow',         hex: '#FAFAF8' },
  { name: 'Cream',        hex: '#F2E4CC' },
  { name: 'Sand',         hex: '#DFC9A3' },
  { name: 'Corn Yellow',  hex: '#E3B23C' },
  { name: 'Amber',        hex: '#D07C2A' },
  { name: 'Barn Red',     hex: '#B4453A' },
  { name: 'Rust',         hex: '#8E4B2E' },
  { name: 'Blush Pink',   hex: '#E58BAE' },
  { name: 'Plum',         hex: '#7B4A6B' },
  { name: 'Meadow Green', hex: '#4C8C5A' },
  { name: 'Fern',         hex: '#356B44' },
  { name: 'Moss',         hex: '#6E8B3D' },
  { name: 'Sky Blue',     hex: '#4E86C7' },
  { name: 'Deep Sea',     hex: '#2C5C86' },
  { name: 'Cocoa',        hex: '#8C5A32' },
  { name: 'Chestnut',     hex: '#5E3A21' },
  { name: 'Slate',        hex: '#5B6672' },
  { name: 'Charcoal',     hex: '#33383D' },
];

export const PALETTE_BY_NAME = Object.fromEntries(PALETTE.map(p => [p.name, p.hex]));
export const TYPES = ['animal', 'plant', 'human', 'custom'];

/**
 * A colour token is either a palette NAME ("Barn Red") or a custom hex
 * ("#b4453a"). Named swatches remain the default because they are shared
 * vocabulary between the designer and the game team, and they carry a text
 * label so the palette does not rely on colour alone. The custom picker is
 * the escape hatch for a brand colour the eighteen swatches do not hold.
 */
export const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const isColorToken = (v) => typeof v === 'string' && (!!PALETTE_BY_NAME[v] || isHexColor(v));
/** Resolve a colour token to a hex string. */
export const hexOf = (v, fallback = '#FAFAF8') =>
  PALETTE_BY_NAME[v] ?? (isHexColor(v) ? String(v).toLowerCase() : fallback);
/** Readable label for a colour token — the palette name, or the hex itself. */
export const colorLabel = (v) =>
  PALETTE_BY_NAME[v] ? v : isHexColor(v) ? String(v).toUpperCase() : String(v ?? '');

/* ---------- colour maths --------------------------------------------- */
/**
 * Lighten (amount > 0) or darken (amount < 0) a hex colour.
 * Shading one part against itself is what stops a character reading as a
 * flat sticker — a belly is the body colour, only darker.
 */
export function tint(hex, amount = 0) {
  if (!amount) return hex;
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => amount > 0
    ? Math.round(c + (255 - c) * amount)
    : Math.round(c * (1 + amount));
  r = Math.max(0, Math.min(255, mix(r)));
  g = Math.max(0, Math.min(255, mix(g)));
  b = Math.max(0, Math.min(255, mix(b)));
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/* ---------- primitive helpers ---------------------------------------- */
const P = (part, kind, x, y, w, h, opts = {}) => ({
  part, kind, x, y, w, h,
  d: opts.d ?? h,
  z: opts.z ?? 0,
  rot: opts.rot ?? 0,
  mirrorZ: opts.mirrorZ ?? false,
  mirrorX: opts.mirrorX ?? false,
  views: opts.views ?? ['2d', '3d'],
  detail: opts.detail ?? false,   // detail = not recolourable (eyes, pupils)
  fixed: opts.fixed ?? null,      // forced colour for detail parts
  shade: opts.shade ?? 0,         // tint the part colour: -1 dark … +1 light
  round: opts.round ?? null,      // corner radius override for rects
  outline: opts.outline ?? true,  // draw the ink outline in 2D
  role: opts.role ?? null,        // facial role — what the face-style variants move
});

/**
 * Shorthand for a left/right pair that must exist at mirrored x.
 * Writing limbs once keeps the two sides from drifting apart.
 */
const PX = (part, kind, x, y, w, h, opts = {}) => [
  P(part, kind, x, y, w, h, opts),
  P(part, kind, -x, y, w, h, { ...opts, rot: -(opts.rot ?? 0) }),
];


/* ---------- variant option sets --------------------------------------
 * A variant is a non-destructive transform of the shared primitive list:
 * "Slim" does not add primitives, it restretches the ones the shape already
 * declares. That keeps the 2D and 3D renderers untouched — both read the
 * transformed list — and keeps a variant switch reversible at any time.
 * ------------------------------------------------------------------- */
export const BUILD_OPTIONS = [
  { key: 'regular', label: 'Regular', sx: 1.00, sy: 1.00 },
  { key: 'slim',    label: 'Slim',    sx: 0.82, sy: 1.06 },
  { key: 'sturdy',  label: 'Sturdy',  sx: 1.18, sy: 0.97 },
  { key: 'round',   label: 'Round',   sx: 1.15, sy: 1.12 },
  { key: 'tall',    label: 'Tall',    sx: 0.92, sy: 1.18 },
  { key: 'blocky',  label: 'Blocky',  sx: 1.04, sy: 1.00, kindSwap: true },
];

export const HEAD_OPTIONS = [
  { key: 'round',  label: 'Round',  sx: 1.00, sy: 1.00 },
  { key: 'narrow', label: 'Narrow', sx: 0.84, sy: 1.08 },
  { key: 'wide',   label: 'Wide',   sx: 1.20, sy: 0.92 },
  { key: 'tall',   label: 'Tall',   sx: 0.94, sy: 1.18 },
  { key: 'square', label: 'Square', sx: 1.05, sy: 1.00, kindSwap: true },
];

/**
 * Face styles move the primitives that carry a facial role, so one option
 * set works for every shape that has a face: a squint is the eye primitives
 * flattened, not a second set of eye primitives to keep in step.
 */
export const FACE_OPTIONS = [
  { key: 'neutral',   label: 'Neutral',   eye: {}, mouth: {}, brow: {} },
  { key: 'happy',     label: 'Happy',     eye: { sy: 0.62, dy: 2 },   mouth: { sx: 1.45, sy: 1.70, dy: 2 }, brow: { dy: -3, rot: -5 } },
  { key: 'surprised', label: 'Surprised', eye: { sx: 1.24, sy: 1.30 }, mouth: { sx: 0.62, sy: 2.10 },        brow: { dy: -7, rot: -2 } },
  { key: 'sleepy',    label: 'Sleepy',    eye: { sy: 0.30, dy: 3 },    mouth: { sx: 0.82, sy: 0.80 },        brow: { dy: 3, rot: 8 } },
  { key: 'stern',     label: 'Stern',     eye: { sy: 0.80 },           mouth: { sx: 0.92, sy: 0.55 },        brow: { dy: 4, rot: 16 } },
];

const buildAxis = (label, affects) => ({ label, affects, options: BUILD_OPTIONS, default: 'regular' });
const headAxis  = (label, affects) => ({ label, affects, options: HEAD_OPTIONS,  default: 'round' });
const faceAxis  = () => ({ label: 'Face style', kind: 'face', options: FACE_OPTIONS, default: 'neutral' });

/* ---------- shape catalogue ------------------------------------------ */
export const SHAPES = {
  quadruped: {
    label: 'Quadruped', type: 'animal', drawnAs: 'side',
    blurb: 'cows, sheep, dogs',
    parts: ['body', 'head', 'ears', 'legs', 'tail', 'hooves', 'eyes'],
    defaults: { body: 'Snow', head: 'Snow', ears: 'Blush Pink', legs: 'Cocoa', tail: 'Cocoa', hooves: 'Charcoal', eyes: 'Charcoal' },
    optional: ['tail', 'ears', 'hooves'],
    groups: { Coat: ['body', 'head', 'legs', 'tail', 'ears'], Hooves: ['hooves'], Eyes: ['eyes'] },
    bulkExclude: ['eyes'],
    variants: {
      build: buildAxis('Body shape', ['body', 'legs', 'hooves', 'tail']),
      head: headAxis('Head shape', ['head', 'ears', 'eyes']),
      face: faceAxis(),
    },
    prims: [
      /* tail behind the body */
      P('tail', 'capsule', -108, -34, 20, 74, { rot: -34, d: 20, z: -10, shade: 0 }),
      P('tail', 'ellipse', -128, -66, 30, 34, { d: 28, z: -10, shade: -0.18 }),

      /* far legs sit behind and darker, so the animal has depth */
      P('legs', 'capsule', -58, 52, 22, 88, { views: ['2d'], z: -26, shade: -0.22 }),
      P('legs', 'capsule',  50, 52, 22, 88, { views: ['2d'], z: -26, shade: -0.22 }),
      P('hooves', 'rect',  -58, 96, 26, 22, { views: ['2d'], z: -26, shade: -0.22, round: 7 }),
      P('hooves', 'rect',   50, 96, 26, 22, { views: ['2d'], z: -26, shade: -0.22, round: 7 }),

      /* barrel body, chest, haunch and belly shadow */
      P('body', 'ellipse', 0, 0, 196, 116, { d: 112 }),
      P('body', 'ellipse', -58, 4, 104, 108, { d: 104, shade: -0.06 }),   // haunch
      P('body', 'ellipse', 62, 8, 96, 100, { d: 98, shade: 0.05 }),       // chest
      P('body', 'ellipse', 0, 34, 168, 58, { d: 96, shade: -0.14, outline: false }), // belly
      P('body', 'ellipse', -14, -34, 130, 40, { d: 84, shade: 0.1, outline: false }), // back highlight

      /* near legs */
      P('legs', 'capsule', -62, 54, 24, 92, { views: ['2d'], z: 26 }),
      P('legs', 'capsule',  56, 54, 24, 92, { views: ['2d'], z: 26 }),
      P('hooves', 'rect',  -62, 100, 28, 24, { views: ['2d'], z: 26, round: 8 }),
      P('hooves', 'rect',   56, 100, 28, 24, { views: ['2d'], z: 26, round: 8 }),

      /* 3D legs — cylinders in mirrored pairs */
      P('legs', 'cylinder', -60, 54, 24, 92, { views: ['3d'], z: 30, mirrorZ: true }),
      P('legs', 'cylinder',  54, 54, 24, 92, { views: ['3d'], z: 30, mirrorZ: true }),
      P('hooves', 'cylinder', -60, 102, 28, 22, { views: ['3d'], z: 30, mirrorZ: true }),
      P('hooves', 'cylinder',  54, 102, 28, 22, { views: ['3d'], z: 30, mirrorZ: true }),

      /* neck ties the head to the shoulders instead of floating it */
      P('body', 'capsule', 84, -38, 46, 78, { rot: 34, d: 60, shade: 0.02 }),

      /* ears behind the skull */
      P('ears', 'leaf', 96, -96, 40, 26, { rot: -34, d: 16, z: 18, shade: -0.05 }),
      P('ears', 'leaf', 140, -100, 40, 26, { rot: 18, d: 16, z: -18, shade: -0.05 }),

      /* skull, brow, muzzle */
      P('head', 'ellipse', 120, -56, 96, 84, { d: 82 }),
      P('head', 'ellipse', 118, -78, 84, 40, { d: 74, shade: 0.09, outline: false }),  // brow highlight
      P('head', 'ellipse', 154, -26, 62, 48, { d: 54, shade: -0.04 }),                  // muzzle
      P('head', 'ellipse', 156, -20, 50, 32, { d: 44, detail: true, fixed: '#E9C6BE', role: 'nose' }),// nose pad
      P('head', 'ellipse', 148, -24, 9, 12, { d: 9, detail: true, fixed: '#7A5750', z: 16, mirrorZ: true, role: 'nostril' }),
      P('head', 'ellipse', 166, 0, 30, 8, { d: 20, detail: true, fixed: '#B98F86', outline: false, role: 'mouth' }), // mouth

      /* eyes — sclera, pupil, catchlight. The catchlight is what makes it alive. */
      P('head', 'ellipse', 134, -70, 26, 27, { d: 24, detail: true, fixed: '#FFFFFF', z: 26, mirrorZ: true, role: 'sclera' }),
      P('eyes', 'circle', 137, -69, 16, 16, { d: 15, z: 32, mirrorZ: true, outline: false, role: 'iris' }),
      P('head', 'circle', 133, -74, 6, 6, { d: 6, detail: true, fixed: '#FFFFFF', z: 38, mirrorZ: true, outline: false, role: 'catchlight' }),
    ],
  },

  bird: {
    label: 'Bird', type: 'animal', drawnAs: 'side',
    blurb: 'hens, ducks, owls',
    parts: ['body', 'head', 'beak', 'wings', 'legs', 'comb', 'tail', 'eyes'],
    defaults: { body: 'Corn Yellow', head: 'Corn Yellow', beak: 'Amber', wings: 'Cocoa', legs: 'Amber', comb: 'Barn Red', tail: 'Cocoa', eyes: 'Charcoal' },
    optional: ['comb', 'tail', 'wings'],
    groups: { Plumage: ['body', 'head', 'wings', 'tail'], Beak: ['beak', 'legs'], Comb: ['comb'], Eyes: ['eyes'] },
    bulkExclude: ['eyes'],
    variants: {
      build: buildAxis('Body shape', ['body', 'wings', 'legs', 'tail']),
      head: headAxis('Head shape', ['head', 'beak', 'comb', 'eyes']),
      face: faceAxis(),
    },
    prims: [
      /* tail feathers fan out behind */
      P('tail', 'leaf', -92, -30, 96, 30, { rot: -32, d: 16, z: -14, shade: -0.16 }),
      P('tail', 'leaf', -98, -6, 104, 32, { rot: -12, d: 18, z: 0 }),
      P('tail', 'leaf', -92, 20, 94, 30, { rot: 10, d: 16, z: 14, shade: -0.08 }),

      /* legs and scaly feet */
      P('legs', 'capsule', -20, 64, 12, 62, { views: ['2d'] }),
      P('legs', 'capsule',  20, 64, 12, 62, { views: ['2d'] }),
      P('legs', 'cylinder', 0, 64, 12, 62, { views: ['3d'], z: 22, mirrorZ: true }),
      P('legs', 'rect', -22, 96, 40, 12, { round: 6, shade: -0.1, z: 22, mirrorZ: true }),
      P('legs', 'rect',  22, 96, 40, 12, { round: 6, shade: -0.1, views: ['2d'] }),

      /* plump teardrop body */
      P('body', 'ellipse', 0, 4, 146, 138, { d: 128 }),
      P('body', 'ellipse', -18, 26, 116, 96, { d: 108, shade: -0.12, outline: false }),  // underside
      P('body', 'ellipse', 20, -30, 100, 70, { d: 96, shade: 0.09, outline: false }),    // breast light

      /* wing with two feather layers */
      P('wings', 'leaf', -6, 10, 92, 62, { rot: -16, d: 26, z: 58, mirrorZ: true }),
      P('wings', 'leaf', -18, 22, 70, 40, { rot: -12, d: 18, z: 64, mirrorZ: true, shade: -0.16 }),

      /* neck and head */
      P('body', 'capsule', 32, -56, 46, 56, { rot: 16, d: 48, shade: 0.03 }),
      P('head', 'ellipse', 50, -96, 82, 78, { d: 76 }),
      P('head', 'ellipse', 50, -116, 70, 36, { d: 64, shade: 0.09, outline: false }),

      /* comb and wattle */
      P('comb', 'circle', 34, -138, 26, 26, { d: 18 }),
      P('comb', 'circle', 54, -146, 30, 30, { d: 20 }),
      P('comb', 'circle', 74, -136, 24, 24, { d: 18 }),
      P('comb', 'ellipse', 92, -66, 22, 30, { d: 16, shade: -0.08 }),   // wattle

      /* beak — upper and lower so it reads as a beak, not a spike */
      P('beak', 'cone', 100, -92, 32, 30, { d: 24, rot: 90 }),
      P('beak', 'cone', 96, -74, 26, 22, { d: 20, rot: 90, shade: -0.18 }),

      /* eye */
      P('head', 'circle', 62, -108, 24, 24, { d: 22, detail: true, fixed: '#FFFFFF', z: 26, mirrorZ: true, role: 'sclera' }),
      P('eyes', 'circle', 65, -108, 14, 14, { d: 13, z: 32, mirrorZ: true, outline: false, role: 'iris' }),
      P('head', 'circle', 61, -113, 5, 5, { d: 5, detail: true, fixed: '#FFFFFF', z: 38, mirrorZ: true, outline: false, role: 'catchlight' }),
    ],
  },

  fish: {
    label: 'Fish', type: 'animal', drawnAs: 'side',
    blurb: 'fish, whales',
    parts: ['body', 'fins', 'tail', 'belly', 'eye', 'eyes'],
    defaults: { body: 'Sky Blue', fins: 'Deep Sea', tail: 'Deep Sea', belly: 'Cream', eye: 'Snow', eyes: 'Charcoal' },
    optional: ['fins', 'tail', 'belly'],
    groups: { Scales: ['body', 'belly'], Fins: ['fins', 'tail'], Eyes: ['eye', 'eyes'] },
    bulkExclude: ['eye', 'eyes'],
    variants: {
      build: buildAxis('Body shape', ['body', 'belly', 'fins', 'tail']),
      head: headAxis('Eye size', ['eye', 'eyes']),
      face: faceAxis(),
    },
    prims: [
      /* forked tail */
      P('tail', 'leaf', -128, -34, 76, 46, { rot: -34, d: 18 }),
      P('tail', 'leaf', -128, 34, 76, 46, { rot: 34, d: 18, shade: -0.1 }),
      P('tail', 'capsule', -96, 0, 40, 30, { d: 26, shade: -0.05 }),

      /* dorsal and pelvic fins */
      P('fins', 'leaf', -10, -70, 92, 40, { rot: -8, d: 16, shade: -0.06 }),
      P('fins', 'leaf', -18, 60, 70, 32, { rot: 12, d: 14, shade: -0.06 }),

      /* streamlined body */
      P('body', 'ellipse', 0, 0, 208, 112, { d: 96 }),
      P('body', 'ellipse', 30, -24, 140, 52, { d: 78, shade: 0.1, outline: false }),
      P('belly', 'ellipse', 4, 34, 156, 46, { d: 80, outline: false }),

      /* gill plate and mouth */
      P('body', 'ellipse', 58, 0, 8, 62, { d: 40, shade: -0.2, outline: false }),
      P('body', 'ellipse', 104, 12, 26, 10, { d: 18, detail: true, fixed: '#2F4E63', outline: false }),

      /* pectoral fin on the near side */
      P('fins', 'leaf', 30, 26, 60, 30, { rot: 26, d: 12, z: 44, mirrorZ: true }),

      /* eye */
      P('eye', 'circle', 74, -20, 30, 30, { d: 28, z: 36, mirrorZ: true, role: 'sclera' }),
      P('eyes', 'circle', 77, -20, 17, 17, { d: 16, z: 44, mirrorZ: true, outline: false, role: 'iris' }),
      P('eye', 'circle', 72, -26, 6, 6, { d: 6, detail: true, fixed: '#FFFFFF', z: 50, mirrorZ: true, outline: false, role: 'catchlight' }),
    ],
  },

  tree: {
    label: 'Tree', type: 'plant',
    blurb: 'oaks, apple trees',
    parts: ['canopy', 'trunk', 'fruit'],
    defaults: { canopy: 'Meadow Green', trunk: 'Cocoa', fruit: 'Barn Red' },
    optional: ['fruit'],
    groups: { Foliage: ['canopy'], Wood: ['trunk'], Fruit: ['fruit'] },
    variants: {
      build: buildAxis('Trunk shape', ['trunk']),
      head: headAxis('Canopy shape', ['canopy', 'fruit']),
    },
    prims: [
      /* trunk with a root flare, so it grows out of the ground */
      P('trunk', 'cylinder', 0, 82, 44, 118, { d: 44 }),
      P('trunk', 'cone', 0, 138, 92, 40, { d: 80, rot: 180, shade: -0.12 }),
      P('trunk', 'capsule', -34, 34, 18, 62, { rot: 38, d: 18, shade: -0.06 }),  // branch
      P('trunk', 'capsule', 36, 22, 18, 66, { rot: -34, d: 18, shade: -0.06 }),
      P('trunk', 'rect', 4, 76, 8, 96, { round: 4, shade: -0.16, outline: false }), // bark line

      /* canopy built from overlapping clusters at different depths */
      P('canopy', 'ellipse', 0, -52, 214, 168, { d: 182 }),
      P('canopy', 'ellipse', -76, 6, 120, 100, { d: 112, shade: -0.1 }),
      P('canopy', 'ellipse', 78, 2, 116, 96, { d: 108, shade: -0.06 }),
      P('canopy', 'ellipse', -50, -104, 108, 88, { d: 100, shade: 0.08 }),
      P('canopy', 'ellipse', 56, -108, 100, 84, { d: 94, shade: 0.04 }),
      P('canopy', 'ellipse', -20, -86, 130, 74, { d: 110, shade: 0.12, outline: false }), // sun side

      /* fruit with a catchlight each */
      P('fruit', 'circle', -52, -22, 26, 26, { d: 26, z: 44 }),
      P('fruit', 'circle', -56, -28, 7, 7, { d: 7, detail: true, fixed: '#FFFFFF', z: 58, outline: false }),
      P('fruit', 'circle', 44, -62, 26, 26, { d: 26, z: -30 }),
      P('fruit', 'circle', 40, -68, 7, 7, { d: 7, detail: true, fixed: '#FFFFFF', z: -16, outline: false }),
      P('fruit', 'circle', 10, 12, 26, 26, { d: 26, z: 58 }),
      P('fruit', 'circle', 6, 6, 7, 7, { d: 7, detail: true, fixed: '#FFFFFF', z: 72, outline: false }),
    ],
  },

  flower: {
    label: 'Flower', type: 'plant',
    blurb: 'daisies, sunflowers',
    parts: ['petals', 'centre', 'stem', 'leaves'],
    defaults: { petals: 'Corn Yellow', centre: 'Cocoa', stem: 'Meadow Green', leaves: 'Fern' },
    optional: ['leaves'],
    groups: { Bloom: ['petals', 'centre'], Foliage: ['stem', 'leaves'] },
    variants: {
      build: buildAxis('Stem shape', ['stem', 'leaves']),
      head: headAxis('Bloom shape', ['petals', 'centre']),
    },
    prims: [
      P('stem', 'capsule', 0, 86, 18, 168, { d: 18 }),
      P('stem', 'rect', -4, 86, 5, 150, { round: 3, shade: -0.16, outline: false }),
      P('leaves', 'leaf', -58, 76, 104, 42, { rot: -26, d: 26 }),
      P('leaves', 'leaf', 60, 104, 104, 42, { rot: 24, d: 26, shade: -0.08 }),
      P('leaves', 'rect', -58, 76, 76, 4, { rot: -26, round: 2, shade: -0.2, outline: false }),
      P('leaves', 'rect', 60, 104, 76, 4, { rot: 24, round: 2, shade: -0.2, outline: false }),

      /* a back row of petals offset from the front row reads as a real bloom */
      ...[30, 90, 150, 210, 270, 330].map(a => {
        const r = 64, rad = (a * Math.PI) / 180;
        return P('petals', 'leaf', Math.cos(rad) * r, -44 + Math.sin(rad) * r, 78, 44,
          { rot: a, d: 22, z: -12, shade: -0.14 });
      }),
      ...[0, 60, 120, 180, 240, 300].map(a => {
        const r = 66, rad = (a * Math.PI) / 180;
        return P('petals', 'leaf', Math.cos(rad) * r, -44 + Math.sin(rad) * r, 84, 48,
          { rot: a, d: 26, z: 6 });
      }),

      P('centre', 'circle', 0, -44, 70, 70, { d: 58 }),
      P('centre', 'circle', 0, -44, 50, 50, { d: 46, shade: -0.14, outline: false }),
      P('centre', 'circle', -12, -56, 12, 12, { d: 12, shade: 0.18, z: 30, outline: false }),
      P('centre', 'circle', 10, -50, 10, 10, { d: 10, shade: 0.12, z: 30, outline: false }),
      P('centre', 'circle', -2, -34, 11, 11, { d: 11, shade: 0.15, z: 30, outline: false }),
    ],
  },

  sprout: {
    label: 'Sprout', type: 'plant',
    blurb: 'seedlings, shoots',
    parts: ['leaves', 'stem', 'pot', 'soil'],
    defaults: { leaves: 'Meadow Green', stem: 'Fern', pot: 'Rust', soil: 'Chestnut' },
    optional: ['pot', 'soil'],
    groups: { Foliage: ['leaves', 'stem'], Pot: ['pot', 'soil'] },
    variants: {
      build: buildAxis('Pot shape', ['pot', 'soil']),
      head: headAxis('Foliage shape', ['leaves', 'stem']),
    },
    prims: [
      /* pot body, rim and soil */
      P('pot', 'cone', 0, 104, 128, 92, { d: 118, rot: 180 }),
      P('pot', 'cylinder', 0, 54, 148, 26, { d: 138 }),
      P('pot', 'ellipse', 0, 46, 140, 22, { d: 130, shade: 0.1, outline: false }),
      P('soil', 'ellipse', 0, 48, 122, 18, { d: 114 }),
      P('pot', 'ellipse', -34, 104, 26, 60, { d: 20, shade: 0.12, outline: false }),  // pot highlight

      /* stem and cotyledons */
      P('stem', 'capsule', 0, -6, 16, 128, { d: 16 }),
      P('leaves', 'leaf', -58, -46, 104, 50, { rot: -30, d: 34 }),
      P('leaves', 'leaf', 58, -66, 104, 50, { rot: 30, d: 34, shade: -0.08 }),
      P('leaves', 'rect', -58, -46, 74, 4, { rot: -30, round: 2, shade: -0.22, outline: false }),
      P('leaves', 'rect', 58, -66, 74, 4, { rot: 30, round: 2, shade: -0.22, outline: false }),
      P('leaves', 'leaf', 6, -104, 58, 30, { rot: -8, d: 20, shade: 0.08 }),   // new shoot
    ],
  },

  child: {
    label: 'Child', type: 'human',
    blurb: 'kids, pupils',
    parts: ['head', 'hair', 'body', 'arms', 'legs', 'shoes', 'eyes'],
    defaults: { head: 'Cream', hair: 'Chestnut', body: 'Sky Blue', arms: 'Cream', legs: 'Slate', shoes: 'Charcoal', eyes: 'Chestnut' },
    optional: ['hair', 'shoes'],
    groups: { Skin: ['head', 'arms'], Hair: ['hair'], Clothes: ['body', 'legs', 'shoes'], Eyes: ['eyes'] },
    bulkExclude: ['eyes'],
    variants: {
      build: buildAxis('Body shape', ['body', 'arms', 'legs', 'shoes']),
      head: headAxis('Head shape', ['head', 'hair', 'eyes']),
      face: faceAxis(),
    },
    prims: [
      /* legs and shoes */
      P('legs', 'capsule', -26, 84, 26, 92, { views: ['2d'] }),
      P('legs', 'capsule',  26, 84, 26, 92, { views: ['2d'] }),
      P('legs', 'cylinder', -26, 84, 26, 92, { views: ['3d'], d: 26 }),
      P('legs', 'cylinder',  26, 84, 26, 92, { views: ['3d'], d: 26 }),
      P('shoes', 'rect', -30, 132, 40, 22, { round: 9, d: 30 }),
      P('shoes', 'rect',  30, 132, 40, 22, { round: 9, d: 30 }),

      /* arms with hands */
      P('arms', 'capsule', -64, 18, 21, 84, { rot: 12, views: ['2d'] }),
      P('arms', 'capsule',  64, 18, 21, 84, { rot: -12, views: ['2d'] }),
      P('arms', 'cylinder', -60, 18, 21, 84, { views: ['3d'], d: 21, rot: 12 }),
      P('arms', 'cylinder',  60, 18, 21, 84, { views: ['3d'], d: 21, rot: -12 }),
      P('arms', 'circle', -74, 62, 24, 24, { d: 22 }),
      P('arms', 'circle',  74, 62, 24, 24, { d: 22 }),

      /* torso — shoulders wider than waist, plus a collar */
      P('body', 'ellipse', 0, 22, 112, 118, { d: 76 }),
      P('body', 'ellipse', 0, -12, 104, 52, { d: 72, shade: 0.07, outline: false }),
      P('body', 'ellipse', 0, 54, 92, 60, { d: 66, shade: -0.1, outline: false }),
      P('body', 'ellipse', 0, -30, 44, 18, { d: 40, shade: -0.16 }),   // collar
      P('head', 'capsule', 0, -40, 30, 30, { d: 30, shade: -0.05 }),   // neck

      /* head and ears */
      P('head', 'circle', 0, -84, 94, 94, { d: 90 }),
      P('head', 'circle', -47, -80, 20, 24, { d: 18, shade: -0.05 }),
      P('head', 'circle',  47, -80, 20, 24, { d: 18, shade: -0.05 }),

      /* hair — a cap plus a fringe, not one blob */
      P('hair', 'ellipse', 0, -104, 100, 70, { d: 94 }),
      P('hair', 'ellipse', -30, -84, 44, 34, { d: 40, shade: -0.06 }),
      P('hair', 'ellipse',  30, -84, 44, 34, { d: 40, shade: -0.06 }),
      P('hair', 'ellipse', 0, -120, 76, 34, { d: 70, shade: 0.12, outline: false }),

      /* face — eyes with iris and catchlight, brows, nose, smile */
      P('head', 'ellipse', -19, -80, 22, 24, { d: 20, detail: true, fixed: '#FFFFFF', z: 44, role: 'sclera' }),
      P('head', 'ellipse',  19, -80, 22, 24, { d: 20, detail: true, fixed: '#FFFFFF', z: 44, role: 'sclera' }),
      P('eyes', 'circle', -19, -79, 14, 14, { d: 13, z: 48, outline: false, role: 'iris' }),
      P('eyes', 'circle',  19, -79, 14, 14, { d: 13, z: 48, outline: false, role: 'iris' }),
      P('head', 'circle', -19, -79, 7, 7, { d: 7, detail: true, fixed: '#2B2B2B', z: 50, role: 'pupil' }),
      P('head', 'circle',  19, -79, 7, 7, { d: 7, detail: true, fixed: '#2B2B2B', z: 50, role: 'pupil' }),
      P('head', 'circle', -23, -84, 4, 4, { d: 4, detail: true, fixed: '#FFFFFF', z: 52, outline: false, role: 'catchlight' }),
      P('head', 'circle',  15, -84, 4, 4, { d: 4, detail: true, fixed: '#FFFFFF', z: 52, outline: false, role: 'catchlight' }),
      P('head', 'rect', -20, -96, 20, 5, { round: 3, rot: -8, detail: true, fixed: '#4A3728', z: 44, outline: false, role: 'brow' }),
      P('head', 'rect',  20, -96, 20, 5, { round: 3, rot: 8, detail: true, fixed: '#4A3728', z: 44, outline: false, role: 'brow' }),
      P('head', 'ellipse', 0, -68, 12, 10, { d: 12, shade: -0.12, z: 46, outline: false, role: 'nose' }),   // nose
      P('head', 'ellipse', 0, -54, 26, 14, { d: 14, detail: true, fixed: '#C4756B', z: 46, outline: false, role: 'mouth' }), // smile
    ],
  },

  adult: {
    label: 'Adult', type: 'human',
    blurb: 'farmers, teachers',
    parts: ['head', 'hair', 'body', 'arms', 'legs', 'shoes', 'eyes'],
    defaults: { head: 'Cream', hair: 'Cocoa', body: 'Meadow Green', arms: 'Cream', legs: 'Slate', shoes: 'Chestnut', eyes: 'Slate' },
    optional: ['hair', 'shoes'],
    groups: { Skin: ['head', 'arms'], Hair: ['hair'], Clothes: ['body', 'legs', 'shoes'], Eyes: ['eyes'] },
    bulkExclude: ['eyes'],
    variants: {
      build: buildAxis('Body shape', ['body', 'arms', 'legs', 'shoes']),
      head: headAxis('Head shape', ['head', 'hair', 'eyes']),
      face: faceAxis(),
    },
    prims: [
      P('legs', 'capsule', -28, 100, 28, 116, { views: ['2d'] }),
      P('legs', 'capsule',  28, 100, 28, 116, { views: ['2d'] }),
      P('legs', 'cylinder', -28, 100, 28, 116, { views: ['3d'], d: 28 }),
      P('legs', 'cylinder',  28, 100, 28, 116, { views: ['3d'], d: 28 }),
      P('shoes', 'rect', -32, 164, 44, 24, { round: 10, d: 32 }),
      P('shoes', 'rect',  32, 164, 44, 24, { round: 10, d: 32 }),

      P('arms', 'capsule', -72, 18, 23, 104, { rot: 10, views: ['2d'] }),
      P('arms', 'capsule',  72, 18, 23, 104, { rot: -10, views: ['2d'] }),
      P('arms', 'cylinder', -68, 18, 23, 104, { views: ['3d'], d: 23, rot: 10 }),
      P('arms', 'cylinder',  68, 18, 23, 104, { views: ['3d'], d: 23, rot: -10 }),
      P('arms', 'circle', -84, 74, 26, 26, { d: 24 }),
      P('arms', 'circle',  84, 74, 26, 26, { d: 24 }),

      P('body', 'ellipse', 0, 20, 126, 142, { d: 82 }),
      P('body', 'ellipse', 0, -22, 122, 60, { d: 80, shade: 0.07, outline: false }),   // shoulders
      P('body', 'ellipse', 0, 62, 100, 66, { d: 70, shade: -0.1, outline: false }),
      P('body', 'rect', 0, 24, 6, 100, { round: 3, shade: -0.14, outline: false }),    // shirt seam
      P('body', 'ellipse', 0, -42, 48, 20, { d: 44, shade: -0.16 }),                   // collar
      P('head', 'capsule', 0, -54, 32, 34, { d: 32, shade: -0.05 }),                   // neck

      P('head', 'circle', 0, -100, 88, 90, { d: 86 }),
      P('head', 'circle', -44, -96, 20, 24, { d: 18, shade: -0.05 }),
      P('head', 'circle',  44, -96, 20, 24, { d: 18, shade: -0.05 }),

      P('hair', 'ellipse', 0, -124, 94, 58, { d: 88 }),
      P('hair', 'ellipse', -40, -108, 26, 40, { d: 26, shade: -0.06 }),
      P('hair', 'ellipse',  40, -108, 26, 40, { d: 26, shade: -0.06 }),
      P('hair', 'ellipse', -14, -136, 60, 28, { d: 56, shade: 0.12, outline: false }),

      P('head', 'ellipse', -18, -98, 21, 23, { d: 19, detail: true, fixed: '#FFFFFF', z: 42, role: 'sclera' }),
      P('head', 'ellipse',  18, -98, 21, 23, { d: 19, detail: true, fixed: '#FFFFFF', z: 42, role: 'sclera' }),
      P('eyes', 'circle', -18, -97, 13, 13, { d: 12, z: 46, outline: false, role: 'iris' }),
      P('eyes', 'circle',  18, -97, 13, 13, { d: 12, z: 46, outline: false, role: 'iris' }),
      P('head', 'circle', -18, -97, 6, 6, { d: 6, detail: true, fixed: '#2B2B2B', z: 48, role: 'pupil' }),
      P('head', 'circle',  18, -97, 6, 6, { d: 6, detail: true, fixed: '#2B2B2B', z: 48, role: 'pupil' }),
      P('head', 'circle', -21, -101, 4, 4, { d: 4, detail: true, fixed: '#FFFFFF', z: 50, outline: false, role: 'catchlight' }),
      P('head', 'circle',  15, -101, 4, 4, { d: 4, detail: true, fixed: '#FFFFFF', z: 50, outline: false, role: 'catchlight' }),
      P('head', 'rect', -19, -114, 21, 5, { round: 3, rot: -6, detail: true, fixed: '#4A3728', z: 42, outline: false, role: 'brow' }),
      P('head', 'rect',  19, -114, 21, 5, { round: 3, rot: 6, detail: true, fixed: '#4A3728', z: 42, outline: false, role: 'brow' }),
      P('head', 'ellipse', 0, -84, 13, 12, { d: 13, shade: -0.12, z: 44, outline: false, role: 'nose' }),
      P('head', 'ellipse', 0, -68, 24, 12, { d: 13, detail: true, fixed: '#B9736A', z: 44, outline: false, role: 'mouth' }),
    ],
  },

  blank: {
    label: 'Blank canvas', type: 'custom',
    blurb: 'build from scratch',
    parts: [],
    defaults: {},
    prims: [],
    scratch: true,
  },
};

export const SHAPE_KEYS = Object.keys(SHAPES);
export const shapesForType = (type) => SHAPE_KEYS.filter(k => SHAPES[k].type === type);

/* ---------- draggable element catalogue ------------------------------ */
/**
 * The library the designer drags from. Each entry is a primitive kind with a
 * sensible starting size — dropping one creates an element the designer can
 * then move, resize, rotate and recolour like any other object.
 */
export const ELEMENT_KINDS = {
  circle:   { label: 'Circle',   kind: 'circle',   w: 64,  h: 64 },
  oval:     { label: 'Oval',     kind: 'ellipse',  w: 92,  h: 58 },
  square:   { label: 'Square',   kind: 'rect',     w: 64,  h: 64 },
  bar:      { label: 'Bar',      kind: 'rect',     w: 104, h: 30 },
  triangle: { label: 'Triangle', kind: 'cone',     w: 72,  h: 66 },
  capsule:  { label: 'Capsule',  kind: 'capsule',  w: 104, h: 40 },
  cylinder: { label: 'Cylinder', kind: 'cylinder', w: 52,  h: 96 },
  ring:     { label: 'Ring',     kind: 'torus',    w: 78,  h: 78 },
  leaf:     { label: 'Leaf',     kind: 'leaf',     w: 92,  h: 50 },
  star:     { label: 'Star',     kind: 'star',     w: 78,  h: 78 },
};

export const ELEMENT_KEYS = Object.keys(ELEMENT_KINDS);
export const MAX_ELEMENTS = 60;

/** Bounds every element must stay inside — matched by the API validator. */
export const ELEMENT_LIMITS = {
  x: [-260, 260], y: [-260, 260],
  w: [6, 460], h: [6, 460],
  rot: [-180, 180], z: [-200, 200],
};

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

/* ---------- the artboard ---------------------------------------------
 * Designers think in centimetres because the game team receive artwork at
 * a physical size. Design space stays in abstract units; CM_UNITS is the
 * single conversion, so a 26 cm board is 520 units — exactly the viewBox
 * the preset shapes were drawn against.
 * ------------------------------------------------------------------- */
export const CM_UNITS = 20;
export const DEFAULT_CANVAS = { width: 26, height: 26 };
export const CANVAS_LIMITS = { width: [5, 100], height: [5, 100] };

export const cmToUnits = (cm) => cm * CM_UNITS;
export const unitsToCm = (u) => u / CM_UNITS;

/** The canvas for a character, falling back to the preset-shape board. */
export function canvasOf(character) {
  const c = character?.canvas;
  return {
    width: clamp(Number(c?.width) || DEFAULT_CANVAS.width, CANVAS_LIMITS.width),
    height: clamp(Number(c?.height) || DEFAULT_CANVAS.height, CANVAS_LIMITS.height),
  };
}

/** SVG viewBox covering the artboard, centred on the origin. */
export function viewBoxOf(character) {
  const { width, height } = canvasOf(character);
  const w = cmToUnits(width), h = cmToUnits(height);
  return { x: -w / 2, y: -h / 2, w, h, str: `${-w / 2} ${-h / 2} ${w} ${h}` };
}

/** Grid spacing in design units: 1 cm minor, 5 cm major. */
export const GRID = { minor: CM_UNITS, major: CM_UNITS * 5 };

/** Snap a design-space value to the nearest grid step (default half a cm). */
export function snapUnits(v, stepCm = 0.5) {
  const step = cmToUnits(stepCm);
  return Math.round(v / step) * step;
}

/* ---------- placing the character on the board -----------------------
 * The artwork sits at the board's centre unless the designer moves it.
 * The offset translates the WHOLE composition — preset primitives and
 * placed elements together — so "where the character sits" is one value,
 * and an element's own x/y stays relative to the character.
 * ------------------------------------------------------------------- */
export const DEFAULT_OFFSET = { x: 0, y: 0, z: 0 };
export const OFFSET_LIMITS = { x: [-1000, 1000], y: [-1000, 1000], z: [-1000, 1000] };

export function offsetOf(character) {
  const o = character?.offset;
  return {
    x: clamp(Number(o?.x) || 0, OFFSET_LIMITS.x),
    y: clamp(Number(o?.y) || 0, OFFSET_LIMITS.y),
    z: clamp(Number(o?.z) || 0, OFFSET_LIMITS.z),
  };
}

export function validateOffset(offset) {
  const errors = [];
  if (offset == null) return { ok: true, errors, value: undefined };
  if (typeof offset !== 'object') return { ok: false, errors: ['Offset must be an object.'], value: { ...DEFAULT_OFFSET } };
  const num = (v, key) => {
    if (v == null) return 0;
    const n = Number(v);
    if (!Number.isFinite(n)) { errors.push(`Placement ${key} must be a number.`); return 0; }
    if (n < OFFSET_LIMITS[key][0] || n > OFFSET_LIMITS[key][1]) {
      errors.push(`Placement ${key} is outside the board.`);
    }
    return Math.round(clamp(n, OFFSET_LIMITS[key]));
  };
  return { ok: errors.length === 0, errors, value: { x: num(offset.x, 'x'), y: num(offset.y, 'y'), z: num(offset.z, 'z') } };
}

/**
 * Design-space bounding box of the artwork, scale included but offset NOT —
 * the box is what gets placed, so alignment maths starts from it.
 * Rotation is folded in exactly: a rotated box's half-extents are
 * |hw·cos| + |hh·sin| across and |hw·sin| + |hh·cos| down.
 */
export function boundsOf(character) {
  const prims = primsFor(character, '2d');
  if (!prims.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0, empty: true };
  const s = character?.scale ?? 1;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of prims) {
    const rad = ((p.rot || 0) * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
    const hw = p.w / 2, hh = p.h / 2;
    const ex = hw * c + hh * sn;
    const ey = hw * sn + hh * c;
    minX = Math.min(minX, p.x - ex); maxX = Math.max(maxX, p.x + ex);
    minY = Math.min(minY, p.y - ey); maxY = Math.max(maxY, p.y + ey);
  }
  minX *= s; maxX *= s; minY *= s; maxY *= s;
  return {
    minX, minY, maxX, maxY,
    w: maxX - minX, h: maxY - minY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    empty: false,
  };
}

/**
 * The offset that parks the artwork against a named spot on the board.
 * `align` is one of nw n ne w c e sw s se — a 3x3 of the usual anchors.
 */
export function alignOffset(character, align = 'c', marginCm = 1) {
  const b = boundsOf(character);
  if (b.empty) return { ...DEFAULT_OFFSET };
  const { width, height } = canvasOf(character);
  const halfW = cmToUnits(width) / 2, halfH = cmToUnits(height) / 2;
  const m = cmToUnits(marginCm);
  const cur = offsetOf(character);

  const h = align.includes('w') ? 'w' : align.includes('e') ? 'e' : 'c';
  const v = align.startsWith('n') ? 'n' : align.startsWith('s') ? 's' : 'c';

  const x = h === 'w' ? -halfW + m - b.minX
          : h === 'e' ?  halfW - m - b.maxX
          : -b.cx;
  const y = v === 'n' ? -halfH + m - b.minY
          : v === 's' ?  halfH - m - b.maxY
          : -b.cy;

  return {
    x: Math.round(clamp(x, OFFSET_LIMITS.x)),
    y: Math.round(clamp(y, OFFSET_LIMITS.y)),
    z: cur.z,
  };
}

export function validateCanvas(canvas) {
  const errors = [];
  if (canvas == null) return { ok: true, errors, value: undefined };
  if (typeof canvas !== 'object') return { ok: false, errors: ['Canvas must be an object.'], value: { ...DEFAULT_CANVAS } };
  const num = (v, key) => {
    const n = Number(v);
    if (!Number.isFinite(n)) { errors.push(`Canvas ${key} must be a number of centimetres.`); return DEFAULT_CANVAS[key]; }
    if (n < CANVAS_LIMITS[key][0] || n > CANVAS_LIMITS[key][1]) {
      errors.push(`Canvas ${key} must be between ${CANVAS_LIMITS[key][0]} and ${CANVAS_LIMITS[key][1]} cm.`);
    }
    return clamp(n, CANVAS_LIMITS[key]);
  };
  return { ok: errors.length === 0, errors, value: { width: num(canvas.width, 'width'), height: num(canvas.height, 'height') } };
}

/** A new element of `key`, dropped at design-space (x, y). */
export function makeElement(key, x = 0, y = 0, color = 'Sky Blue') {
  const def = ELEMENT_KINDS[key];
  if (!def) throw new Error('Unknown element: ' + key);
  return {
    id: 'e' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4),
    el: key,
    x: Math.round(clamp(x, ELEMENT_LIMITS.x)),
    y: Math.round(clamp(y, ELEMENT_LIMITS.y)),
    w: def.w, h: def.h, d: Math.min(def.w, def.h),
    z: 0, rot: 0, color,
  };
}

/** Normalise one element into a primitive the renderers already understand. */
export function elementToPrim(e) {
  const def = ELEMENT_KINDS[e.el] ?? ELEMENT_KINDS.circle;
  return {
    part: 'element:' + e.id,
    element: e.id,
    kind: def.kind,
    x: e.x, y: e.y, w: e.w, h: e.h,
    d: e.d ?? Math.min(e.w, e.h),
    z: e.z ?? 0,
    rot: e.rot ?? 0,
    mirrorZ: false,
    views: ['2d', '3d'],
    detail: false,
    fixed: hexOf(e.color, '#4E86C7'),
    shade: 0,
    round: null,
    outline: true,
  };
}

/* ---------- variants: body shape, head shape, face style -------------
 * A variant never adds or removes primitives — it restretches or nudges the
 * ones the shape already declares. Both renderers read the transformed list,
 * so a "Slim" character is slim in 2D and in 3D without either renderer
 * knowing variants exist, and switching back is always exact.
 * ------------------------------------------------------------------- */
export const variantAxesOf = (shapeKey) => SHAPES[shapeKey]?.variants ?? {};
export const optionalPartsOf = (shapeKey) => SHAPES[shapeKey]?.optional ?? [];
export const groupsOf = (shapeKey) => SHAPES[shapeKey]?.groups ?? {};

/** Parts "apply to whole character" should leave alone — eyes, mostly. */
export function bulkPartsOf(shapeKey) {
  const s = SHAPES[shapeKey];
  if (!s) return [];
  const skip = s.bulkExclude ?? [];
  return s.parts.filter(p => !skip.includes(p));
}

/** The chosen option on every axis, falling back to each axis's default. */
export function variantsOf(character) {
  const axes = variantAxesOf(character?.shape);
  const out = {};
  for (const [key, axis] of Object.entries(axes)) {
    const want = character?.variants?.[key];
    out[key] = axis.options.some(o => o.key === want) ? want : (axis.default ?? axis.options[0].key);
  }
  return out;
}

/** Parts the designer has switched off. A required part can never be hidden. */
export function hiddenOf(character) {
  const optional = optionalPartsOf(character?.shape);
  const list = Array.isArray(character?.hidden) ? character.hidden : [];
  return [...new Set(list.filter(p => optional.includes(p)))];
}

/** Parts actually drawn — the shape's list minus anything switched off. */
export function activePartsOf(character) {
  const hidden = new Set(hiddenOf(character));
  return partsOf(character?.shape).filter(p => !hidden.has(p));
}

const EYE_ROLES = new Set(['sclera', 'iris', 'pupil', 'catchlight']);

/**
 * Centre of the affected parts, measured across BOTH views' primitives so a
 * variant scales about the same point in 2D and in 3D. Measuring per view
 * would drift the two apart, which is the one thing this model exists to stop.
 */
function anchorOf(allPrims, affects) {
  const set = new Set(affects);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
  for (const p of allPrims) {
    if (!set.has(p.part)) continue;
    any = true;
    minX = Math.min(minX, p.x - p.w / 2); maxX = Math.max(maxX, p.x + p.w / 2);
    minY = Math.min(minY, p.y - p.h / 2); maxY = Math.max(maxY, p.y + p.h / 2);
  }
  return any ? { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 } : null;
}

function scaleParts(prims, affects, opt, anchor) {
  if (!anchor) return prims;
  const set = new Set(affects);
  const sx = opt.sx ?? 1, sy = opt.sy ?? 1;
  return prims.map(p => {
    if (!set.has(p.part)) return p;
    const boxy = opt.kindSwap && !p.detail && !p.role && (p.kind === 'circle' || p.kind === 'ellipse');
    const w = p.w * sx, h = p.h * sy;
    return {
      ...p,
      x: anchor.cx + (p.x - anchor.cx) * sx,
      y: anchor.cy + (p.y - anchor.cy) * sy,
      w, h, d: (p.d ?? p.h) * sx,
      ...(boxy ? { kind: 'rect', round: Math.min(w, h) * 0.28 } : null),
    };
  });
}

function styleFace(prims, opt) {
  const eye = opt.eye ?? {}, mouth = opt.mouth ?? {}, brow = opt.brow ?? {};
  return prims.map(p => {
    if (!p.role) return p;
    if (EYE_ROLES.has(p.role))
      return { ...p, w: p.w * (eye.sx ?? 1), h: p.h * (eye.sy ?? 1), y: p.y + (eye.dy ?? 0) };
    if (p.role === 'mouth')
      return { ...p, w: p.w * (mouth.sx ?? 1), h: p.h * (mouth.sy ?? 1), y: p.y + (mouth.dy ?? 0) };
    if (p.role === 'brow') {
      // it is the INNER end of each brow that drops, so the tilt mirrors
      const dir = p.x < 0 ? 1 : -1;
      return { ...p, y: p.y + (brow.dy ?? 0), rot: (p.rot ?? 0) + dir * (brow.rot ?? 0) };
    }
    return p;
  });
}

/** Apply every chosen variant to a primitive list. */
export function applyVariants(prims, character, allPrims = prims) {
  const axes = variantAxesOf(character?.shape);
  const chosen = variantsOf(character);
  let out = prims;
  for (const [key, axis] of Object.entries(axes)) {
    const fallback = axis.default ?? axis.options[0].key;
    if (chosen[key] === fallback) continue;
    const opt = axis.options.find(o => o.key === chosen[key]);
    if (!opt) continue;
    out = axis.kind === 'face'
      ? styleFace(out, opt)
      : scaleParts(out, axis.affects ?? [], opt, anchorOf(allPrims, axis.affects ?? []));
  }
  return out;
}

/* ---------- Colourable parts only — the list shown in the editor's Parts panel. */
export function partsOf(shapeKey) {
  const s = SHAPES[shapeKey];
  return s ? s.parts : [];
}

/** A fresh character document body for a given shape. */
export function defaultCharacter(shapeKey, name, canvas) {
  const s = SHAPES[shapeKey];
  if (!s) throw new Error('Unknown shape: ' + shapeKey);
  return {
    name: name || 'Untitled ' + s.label.toLowerCase(),
    type: s.type,
    shape: shapeKey,
    scale: 1,
    colors: { ...s.defaults },
    variants: variantsOf({ shape: shapeKey }),
    hidden: [],
    elements: [],
    canvas: canvas ? validateCanvas(canvas).value : { ...DEFAULT_CANVAS },
    offset: { ...DEFAULT_OFFSET },
  };
}

/** Resolve a part's hex, falling back to the shape default then to Snow. */
export function colorOf(character, part) {
  const s = SHAPES[character.shape];
  const named = character.colors?.[part] ?? s?.defaults?.[part] ?? 'Snow';
  return hexOf(named, '#FAFAF8');
}

/** The colour TOKEN (palette name or hex) currently set on a part. */
export function colorTokenOf(character, part) {
  const s = SHAPES[character.shape];
  return character?.colors?.[part] ?? s?.defaults?.[part] ?? 'Snow';
}

/** The final fill for one primitive, shading included. */
export function fillOf(character, p) {
  if (p.detail || p.element) return p.fixed;
  return tint(colorOf(character, p.part), p.shade || 0);
}

/**
 * Primitives for one view, in draw order: the shape's own primitives first,
 * then dragged elements sorted by z so a designer can layer them.
 */
export function primsFor(character, view) {
  const s = SHAPES[character.shape];
  const hidden = new Set(hiddenOf(character));
  const visible = s ? s.prims.filter(p => !hidden.has(p.part)) : [];
  const base = applyVariants(visible.filter(p => p.views.includes(view)), character, visible);
  const els = (character.elements ?? []).map(elementToPrim);
  const behind = els.filter(p => p.z < 0).sort((a, b) => a.z - b.z);
  const front  = els.filter(p => p.z >= 0).sort((a, b) => a.z - b.z);
  return [...behind, ...base, ...front];
}

/* ---------- validation used by the API ------------------------------- */
/** Every axis resolved to a known option — unknown keys fall back, never fail. */
export function validateVariants(shapeKey, variants) {
  const axes = variantAxesOf(shapeKey);
  const out = {};
  for (const [key, axis] of Object.entries(axes)) {
    const want = variants?.[key];
    out[key] = axis.options.some(o => o.key === want) ? want : (axis.default ?? axis.options[0].key);
  }
  return out;
}

export function validateElements(list) {
  const errors = [];
  if (list == null) return { ok: true, errors, value: undefined };
  if (!Array.isArray(list)) return { ok: false, errors: ['Elements must be a list.'], value: [] };
  if (list.length > MAX_ELEMENTS) errors.push(`A character may hold at most ${MAX_ELEMENTS} elements.`);

  const seen = new Set();
  const value = [];
  for (const raw of list.slice(0, MAX_ELEMENTS)) {
    if (!raw || typeof raw !== 'object') { errors.push('Malformed element.'); continue; }
    if (!ELEMENT_KINDS[raw.el]) { errors.push('Unknown element: ' + raw.el); continue; }
    if (raw.color != null && !isColorToken(raw.color)) {
      errors.push('Colour "' + raw.color + '" is not a palette name or a #rrggbb value.');
      continue;
    }
    const num = (v, key, fallback) => {
      const n = Number(v ?? fallback);
      return Number.isFinite(n) ? clamp(n, ELEMENT_LIMITS[key]) : fallback;
    };
    let id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : null;
    if (!id || seen.has(id)) id = 'e' + Math.random().toString(36).slice(2, 11);
    seen.add(id);

    const def = ELEMENT_KINDS[raw.el];
    const w = num(raw.w, 'w', def.w);
    const h = num(raw.h, 'h', def.h);
    value.push({
      id, el: raw.el,
      x: num(raw.x, 'x', 0), y: num(raw.y, 'y', 0),
      w, h,
      d: Number.isFinite(Number(raw.d)) ? clamp(Number(raw.d), ELEMENT_LIMITS.w) : Math.min(w, h),
      z: num(raw.z, 'z', 0),
      rot: num(raw.rot, 'rot', 0),
      color: isHexColor(raw.color) ? String(raw.color).toLowerCase() : (raw.color ?? 'Sky Blue'),
    });
  }
  return { ok: errors.length === 0, errors, value };
}

/** Validation used by the API before writing to the database. */
export function validateCharacter(body) {
  const errors = [];
  const name = (body?.name ?? '').trim();
  if (!name) errors.push('Name is required.');
  if (name.length > 60) errors.push('Name must be 60 characters or fewer.');
  if (!SHAPES[body?.shape]) errors.push('Unknown shape.');
  const type = SHAPES[body?.shape]?.type;
  if (body?.type && type && body.type !== type) errors.push('Type does not match the chosen shape.');
  const scale = Number(body?.scale ?? 1);
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 2) errors.push('Scale must be between 25% and 200%.');
  // A shape's part list can gain or lose entries between releases, so a stale
  // key is dropped rather than rejected — an older document still opens.
  const known = partsOf(body?.shape);
  const colors = {};
  for (const [part, token] of Object.entries(body?.colors ?? {})) {
    if (!known.includes(part)) continue;
    if (!isColorToken(token)) {
      errors.push('Colour "' + token + '" is not a palette name or a #rrggbb value.');
      continue;
    }
    colors[part] = isHexColor(token) ? String(token).toLowerCase() : token;
  }
  const variants = validateVariants(body?.shape, body?.variants);
  const hidden = hiddenOf({ shape: body?.shape, hidden: body?.hidden });
  const els = validateElements(body?.elements);
  errors.push(...els.errors);
  const canvas = validateCanvas(body?.canvas);
  errors.push(...canvas.errors);
  const offset = validateOffset(body?.offset);
  errors.push(...offset.errors);

  return {
    ok: errors.length === 0,
    errors,
    value: {
      name, type, shape: body?.shape, scale, colors, variants, hidden,
      elements: els.value,
      canvas: canvas.value ?? { ...DEFAULT_CANVAS },
      offset: offset.value ?? { ...DEFAULT_OFFSET },
      materials: body?.materials ?? {},
      lighting: body?.lighting ?? {},
    },
  };
}

/* ---------- 2D poses: front and side ---------------------------------
 * "Front" is the view each shape was drawn in. "Side" is not a second set of
 * artwork — it is an orthographic projection of the SAME primitive list the
 * 3D view renders, taken down the depth axis. A designer therefore gets a
 * true side elevation that cannot drift from the model, and adding a shape
 * still means adding one primitive list.
 * ------------------------------------------------------------------- */
export const POSES = [
  { key: 'front', label: 'Front', hint: 'facing the viewer' },
  { key: 'side',  label: 'Side',  hint: 'the profile' },
];
export const POSE_KEYS = POSES.map(p => p.key);

/**
 * The elevation a shape's artwork was drawn in. That view is the drawing
 * itself; the other one is projected. A quadruped is drawn in profile, a
 * child facing the viewer, so "Front" cannot mean the same file for both.
 */
export const drawnPoseOf = (character) => SHAPES[character?.shape]?.drawnAs ?? 'front';
/** True when this pose is the drawn artwork rather than a projection. */
export const isDrawnPose = (character, pose) => pose === drawnPoseOf(character);

export function primsForPose(character, pose = 'front') {
  if (isDrawnPose(character, pose)) return primsFor(character, '2d');
  const out = [];
  for (const p of primsFor(character, '3d')) {
    // a mirrored primitive is two real objects, and in side view they land on
    // opposite sides of the centre line rather than on top of each other
    const places = p.mirrorZ ? [p.z ?? 0, -(p.z ?? 0)] : [p.z ?? 0];
    for (const z of places) {
      out.push({
        ...p,
        x: z,                 // depth becomes the horizontal axis
        w: p.d ?? p.w,        // and the primitive's depth becomes its width
        d: p.w,
        z: p.x,               // what was x is now distance from the viewer
        rot: 0,               // a roll about the old view axis is edge-on here
        mirrorZ: false,
      });
    }
  }
  // the viewer stands off the character's right, so nearer primitives last
  return out.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

/* ---------- templates -------------------------------------------------
 * A template is a saved starting point: a shape plus the colours, variants
 * and switched-off parts that make it a particular character. Beginners get
 * something recognisable in one click and then change whatever they like —
 * a template is a seed, never a lock.
 * ------------------------------------------------------------------- */
export const BUILT_IN_TEMPLATES = [
  {
    key: 'puppy', name: 'Brown puppy', shape: 'quadruped',
    blurb: 'a friendly dog with a round muzzle',
    colors: { body: 'Cocoa', head: 'Cocoa', ears: 'Chestnut', legs: 'Chestnut', tail: 'Chestnut', hooves: 'Charcoal', eyes: 'Charcoal' },
    variants: { build: 'round', head: 'round', face: 'happy' },
    hidden: [],
  },
  {
    key: 'rabbit', name: 'White rabbit', shape: 'quadruped',
    blurb: 'long ears, no hooves',
    colors: { body: 'Snow', head: 'Snow', ears: 'Blush Pink', legs: 'Snow', tail: 'Cream', hooves: 'Sand', eyes: 'Barn Red' },
    variants: { build: 'slim', head: 'tall', face: 'surprised' },
    hidden: ['hooves'],
  },
  {
    key: 'hen', name: 'Red hen', shape: 'bird',
    blurb: 'a farmyard bird with a full comb',
    colors: { body: 'Barn Red', head: 'Barn Red', beak: 'Corn Yellow', wings: 'Rust', legs: 'Amber', comb: 'Barn Red', tail: 'Charcoal', eyes: 'Charcoal' },
    variants: { build: 'round', head: 'round', face: 'neutral' },
    hidden: [],
  },
  {
    key: 'goldfish', name: 'Goldfish', shape: 'fish',
    blurb: 'a bright pond fish',
    colors: { body: 'Corn Yellow', fins: 'Amber', tail: 'Amber', belly: 'Cream', eye: 'Snow', eyes: 'Charcoal' },
    variants: { build: 'round', head: 'wide', face: 'surprised' },
    hidden: [],
  },
  {
    key: 'appletree', name: 'Apple tree', shape: 'tree',
    blurb: 'a broad canopy with fruit',
    colors: { canopy: 'Meadow Green', trunk: 'Cocoa', fruit: 'Barn Red' },
    variants: { build: 'sturdy', head: 'wide' },
    hidden: [],
  },
  {
    key: 'pine', name: 'Bare tree', shape: 'tree',
    blurb: 'a tall winter tree, no fruit',
    colors: { canopy: 'Fern', trunk: 'Chestnut', fruit: 'Barn Red' },
    variants: { build: 'tall', head: 'narrow' },
    hidden: ['fruit'],
  },
  {
    key: 'sunflower', name: 'Sunflower', shape: 'flower',
    blurb: 'a tall bloom with a dark centre',
    colors: { petals: 'Corn Yellow', centre: 'Chestnut', stem: 'Fern', leaves: 'Meadow Green' },
    variants: { build: 'tall', head: 'wide' },
    hidden: [],
  },
  {
    key: 'seedling', name: 'Seedling', shape: 'sprout',
    blurb: 'a first shoot in a clay pot',
    colors: { leaves: 'Meadow Green', stem: 'Fern', pot: 'Rust', soil: 'Chestnut' },
    variants: { build: 'regular', head: 'round' },
    hidden: [],
  },
  {
    key: 'pupil', name: 'School pupil', shape: 'child',
    blurb: 'uniform, dark hair, smiling',
    colors: { head: 'Cream', hair: 'Charcoal', body: 'Deep Sea', arms: 'Cream', legs: 'Slate', shoes: 'Charcoal', eyes: 'Chestnut' },
    variants: { build: 'regular', head: 'round', face: 'happy' },
    hidden: [],
  },
  {
    key: 'farmer', name: 'Farmer', shape: 'adult',
    blurb: 'work clothes and boots',
    colors: { head: 'Sand', hair: 'Chestnut', body: 'Moss', arms: 'Sand', legs: 'Cocoa', shoes: 'Chestnut', eyes: 'Cocoa' },
    variants: { build: 'sturdy', head: 'wide', face: 'neutral' },
    hidden: [],
  },
  {
    key: 'teacher', name: 'Teacher', shape: 'adult',
    blurb: 'a taller figure in plum',
    colors: { head: 'Cream', hair: 'Charcoal', body: 'Plum', arms: 'Cream', legs: 'Charcoal', shoes: 'Charcoal', eyes: 'Slate' },
    variants: { build: 'tall', head: 'narrow', face: 'neutral' },
    hidden: [],
  },
].map(t => ({ ...t, type: SHAPES[t.shape].type, builtIn: true }));

export const TEMPLATES_BY_KEY = Object.fromEntries(BUILT_IN_TEMPLATES.map(t => [t.key, t]));

/** Turn a template — built-in or one the designer saved — into a character. */
export function characterFromTemplate(tpl, name, canvas) {
  if (!tpl || !SHAPES[tpl.shape]) throw new Error('Unknown template shape.');
  const base = defaultCharacter(tpl.shape, name || tpl.name, canvas ?? tpl.canvas);
  return {
    ...base,
    colors: { ...base.colors, ...(tpl.colors || {}) },
    variants: validateVariants(tpl.shape, { ...base.variants, ...(tpl.variants || {}) }),
    hidden: hiddenOf({ shape: tpl.shape, hidden: tpl.hidden }),
    scale: Number.isFinite(Number(tpl.scale)) ? Math.max(0.25, Math.min(2, Number(tpl.scale))) : 1,
    elements: validateElements(tpl.elements ?? []).value ?? [],
  };
}

/** The template body a character becomes when a designer saves it as one. */
export function templateFromCharacter(character, name) {
  return {
    name: (name ?? character?.name ?? 'Template').trim().slice(0, 60),
    shape: character.shape,
    type: SHAPES[character.shape]?.type ?? character.type,
    colors: { ...(character.colors || {}) },
    variants: variantsOf(character),
    hidden: hiddenOf(character),
    scale: character.scale ?? 1,
    elements: (character.elements ?? []).map(e => ({ ...e })),
    canvas: canvasOf(character),
    materials: character.materials ?? {},
    lighting: character.lighting ?? {},
  };
}

export const UNDO_WINDOW_MS = 10_000;

# Character Designer

A MERN application that lets designers at a small children's game company create simple
cartoon characters — animals, plants and humans — for use in educational games.
Built for **PUSL3122 HCI, Computer Graphics and Visualisation**.

Every character is one parametric model rendered two ways: as **SVG in 2D** and as a
**real-time rasterised three.js scene in 3D**. Both views read the same primitive list from
`shared/character.js`, so a colour change in one view is instantly correct in the other.

On top of the eight preset shapes a designer can **drag elements onto the canvas** from a
shape library, and can start a **blank project from scratch** on an artboard sized in
centimetres. Elements are editable in **both** views — dragged, resized and rotated in 2D,
and moved or scaled directly in the 3D scene — and both views are ruled with the same
centimetre grid.

---

## Quick start

```bash
npm run install:all          # installs root, server and client dependencies

# terminal 1 — API
cd server
cp .env.example .env         # then edit if you need to
DEV_MEMORY_DB=1 SEED=1 npm run dev

# terminal 2 — web client
cd client
npm run dev                  # http://localhost:5173
```

Or run both at once from the project root:

```bash
DEV_MEMORY_DB=1 SEED=1 npm run dev
```

**Demo accounts** (created when `SEED=1` and the database is empty):

| Email | Role | Password |
|---|---|---|
| `nadia@studio.com` | Designer | `password123` |
| `ruwan@studio.com` | Art lead | `password123` |
| `ishara@studio.com` | Designer | `password123` |

---

## Running against real MongoDB

`DEV_MEMORY_DB=1` uses an in-memory store so the app runs with no database installed.
It is for development and automated tests only — **data is lost when the server restarts.**

For real persistence, leave `DEV_MEMORY_DB` unset (or `0`) and point `MONGODB_URI` at
either a local `mongod` or a MongoDB Atlas cluster:

```bash
# local
MONGODB_URI=mongodb://127.0.0.1:27017/character-designer npm run dev

# Atlas
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/character-designer" npm run dev
```

The Mongoose models and every route are identical on both paths — only the repository
implementation behind them changes (`server/src/db/`).

---

## Architecture

```
shared/character.js        ← ONE parametric model: shapes, palette, primitives, validation
                             imported by BOTH the server (validation) and the client (rendering)
                             also: the draggable element library and its bounds

server/
  src/index.js             Express app
  src/db/                  repository layer — mongoRepo.js | memoryRepo.js (same contract)
  src/models/              Mongoose schemas (User, Character + placed elements)
  src/middleware/auth.js   JWT issue + verify, 30-minute expiry, role guard
  src/routes/              auth · characters · admin
  src/seed.js              demo designers and characters

client/
  src/components/
    Character2D.jsx        SVG renderer — click a shape to select its part
    Character3D.jsx        three.js renderer — orbit camera, three-point lighting, raycast select
    TopBar.jsx             app chrome and account menu
  src/pages/               Login · Register · Library · NewCharacter · Editor · Account · Admin
                           Editor carries the element library, drag-and-drop and per-element
                           properties; NewCharacter offers the blank-canvas route
  src/lib/                 api client, auth context, toast system
    scene3d.js             the 3D scene — shared by the live view and the exporter
    stats.js               dimensions and statistics (no heavy dependencies)
    exporters.js           PNG rasterising and the PDF spec sheet (lazy-loaded)
  src/styles/              design tokens + component styles
```

### Why one shared model

The coursework's hardest requirement is that the same character reads correctly in 2D and
in 3D. Duplicating geometry in two renderers guarantees they drift apart. Instead each shape
declares a list of primitives once:

```js
P('ears', 'cone', 92, -84, 28, 36, { d: 28, rot: -20 })
```

The 2D renderer draws it as an SVG polygon; the 3D renderer builds a `ConeGeometry` at the
same coordinates with the y-axis flipped. Adding a shape means adding one entry — both
views pick it up with no further work.

---

## Requirements coverage

| ID | Requirement | Where |
|---|---|---|
| FR1 | Create with size, shape and colour | `NewCharacter.jsx`, `POST /api/characters` |
| FR2 | Visualise in 2D | `Character2D.jsx` |
| FR3 | Visualise in 3D | `Character3D.jsx` |
| FR4 | Resize up or down | Editor size panel, `scale` 25–200% |
| FR5 | Change colours, whole or part | Editor colour panel + "apply to whole character" |
| FR6 | Edit or delete | Library card actions, `PUT` / `DELETE /api/characters/:id` |
| FR7 | Accounts — register, log in, log out | `auth.js`, JWT, `requireAuth` |
| FR8 | Save and reopen | Explicit save + 60-second autosave |
| FR9 | Browse and search a library | `Library.jsx`, `GET /api/characters?q&type&sort` |
| FR10 | Choose animal, plant or human | Wizard step 1, filters step 2 |
| FR11 | Select one part and act on it | Parts panel + click-to-select on both canvases |
| FR12 | Undo / redo, confirm before delete | Editor history, delete modal, 10-second undo toast |
| FR13 | Export for the game team | Export dialog — PDF spec sheet, PNG (2D or 3D), SVG, JSON |
| FR14 | Admin manages designer accounts | `Admin.jsx`, `/api/admin/*`, art-lead only |
| FR15 | Add shapes by drag and drop | Elements tab → drag onto the 2D canvas, `elements[]` on the document |
| FR16 | Start a project from scratch | "From scratch" in the wizard → the `blank` shape, no preset parts |
| FR17 | Edit in the 3D view | Drag an element to move it, alt-drag to resize — `Character3D.jsx` |
| FR18 | Artboard sized in centimetres | Wizard canvas step and the editor's Artboard panel, `canvas{width,height}` |
| FR19 | Grid lines in both views | SVG pattern grid in 2D, floor + artboard grid in 3D, one toggle drives both |
| FR20 | Place the character on the board | Drag the body in either view, or the Placement panel's X/Y/depth and 3x3 align |
| FR21 | Export both views as images | PNG of the 2D artwork and of the 3D render, at two resolutions |
| FR22 | Export a spec sheet | A4 PDF with both views, dimensions and statistics — `lib/exporters.js` |
| NFR3 | Accessibility | Named swatches, keyboard access, labelled controls, AA contrast |
| NFR4 | Safety | Autosave, unlimited undo, confirm + undo on delete |
| NFR5 | Security | bcrypt hashing, 30-minute JWT, owner-scoped queries |
| FR23 | Body, head and face shape | Variant axes — `shared/character.js`, editor **Shape** tab |
| FR24 | Add or remove a preset part | `optional` parts + `hidden[]`, the ± buttons in the Parts panel |
| FR25 | Eye colour, and colour groups | `eyes` is a real part; Skin / Clothes / Hair / Eyes group buttons |
| FR26 | Any colour, not just the palette | `#rrggbb` accepted everywhere a palette name is |
| FR27 | Front **and** side in 2D | `primsForPose` — one elevation drawn, the other projected |
| FR28 | Templates | 11 built in, plus "Save as template" per designer |
| FR29 | 3D geometry export | GLB and glTF through `GLTFExporter` |
| FR30 | Username sign-in, profile picture | `username`, `avatar`, `PATCH /api/auth/profile` |
| FR31 | Search by creation date | `createdFrom` / `createdTo`, newest- and oldest-first sorts |
| FR32 | Settings | `/settings` — theme, defaults, autosave, snapping |

---

## Verification

```bash
bash verify.sh
```

Boots a clean server for each suite, then runs:

* **49 API checks** — auth, validation, ownership isolation, soft delete and undo, admin guards,
  element persistence and bounds, blank-canvas projects, artboard dimensions, character placement
* **42 end-to-end checks** in real Chromium — the six usability-test tasks driven start to
  finish, including a pixel check that the 3D character is actually framed on screen

Both suites must report `0 failed`.

`featuretest.mjs` covers the later features and needs no Python and no browser, so it runs on
Windows as well as the sandbox — point it at a server started against a throwaway database:

```bash
cd server && DEV_MEMORY_DB=1 SEED=1 npm run dev     # terminal 1
node featuretest.mjs                                # terminal 2 — 54 checks
```

It covers usernames and profiles, variants and optional parts, custom hex colours, the template
gallery, and searching by creation date, and re-checks that a designer still cannot reach
another designer's work.

---

## Shape, part by part

Three things about a character can be changed without touching a single colour.

**Variants.** Each shape declares up to three axes — body shape, head shape and face style —
and each axis is a handful of named options rather than a slider, because designers in testing
asked for "a rounder dog", not a number, and a named option is something two people can agree on
across a desk. A variant is never a second set of artwork: it restretches the primitives the
shape already declares, or nudges the ones carrying a facial `role`. Both renderers read the
transformed list, so a slim character is slim in 2D and in 3D without either renderer knowing
variants exist, and switching back is exact.

The scale centre is measured across **both** views' primitives rather than the one being drawn.
Measuring per view would move the head's centre in 2D and 3D by different amounts, and the two
views would drift — which is the single thing this shared model exists to prevent.

**Optional parts.** A tail, a comb, hair, shoes: `optional` names the parts a designer may
switch off, and `hidden[]` records which are off. Nothing is destroyed — the part's colour is
kept, and the ± button puts it back exactly. A part not on the `optional` list cannot be hidden
however the request is malformed, so a shape can never lose its body.

**Face styles.** The face primitives carry a `role` — sclera, iris, pupil, catchlight, brow,
nose, mouth. A style moves those roles rather than swapping in new artwork, so one option set
works for every shape that has a face: a squint is the eye primitives flattened, and an angry
brow is the existing brow rotated about its inner end, which is why the tilt mirrors between
the two sides.

## Two elevations in 2D

The 2D view offers a front and a side. Only one of them is the drawing. A quadruped, a bird and
a fish were drawn in profile — nose at one end, tail at the other — so their drawn view *is* the
side; a person, a tree and a flower face the viewer. Each shape says which it is with
`drawnAs`, because one fixed answer would mislabel half the catalogue.

The other elevation is not a second drawing to keep in step. It is an orthographic projection of
the same primitive list the 3D view renders, taken down the depth axis: depth becomes the
horizontal axis, a mirrored primitive becomes the two real objects it always was, and the list is
re-sorted so nearer primitives draw last. Adding a shape therefore still means adding one
primitive list, and the side elevation cannot disagree with the model.

Editing stays in the drawn view. The projection flattens the axis a drag would move things
along, so a pointer there would not mean what it looks like — the canvas says so rather than
accepting a gesture it cannot honour.

## Templates

Eleven built-in templates cover the three types, and any character can be saved as one. A
template stores colours, variants, hidden parts, scale and placed elements — but not placement,
because where one piece of artwork sat on one board says nothing about where the next belongs.
Built-in and personal templates render through the same card in the wizard: a saved template is
a first-class starting point, not a lesser one. And a template is only a seed — everything about
a character made from one is still editable.

## Colour

A colour is either a palette **name** or a `#rrggbb` **hex**. Named swatches stay the default
because they carry a text label, so the palette never relies on colour alone, and because a name
is what a designer and the game team can say to each other. The picker is the deliberate second
choice for a brand colour the eighteen swatches do not hold.

Above the individual parts sit **groups** — Skin, Clothes, Hair, Eyes for a person; Coat,
Hooves, Eyes for a quadruped. One click recolours every part of a group, which is what "change
the clothes colour" actually means when a shirt, trousers and shoes are three parts. "Apply to
whole character" deliberately skips the parts a shape marks exempt: flooding a face's eyes with
the coat colour is never why that button was reached for.

## Shape detail

Each preset shape is built from a much longer primitive list than a silhouette needs — 74
primitives across the eight shapes became 194. The extra primitives carry anatomy: a neck
joining head to body, muzzles and brows, layered feather and petal rows, hands and shoes,
and eyes built from sclera, iris and a catchlight.

Depth comes from `shade`, which tints a part against itself: a far leg is the body colour
darkened, not a second colour the designer has to manage. The 2D view adds one shared radial
gradient over each primitive so flat fills read as round; the 3D view gets the same effect
from its lighting.

Four primitive kinds were added — `capsule`, `torus`, `leaf` and `star` — each with both an
SVG path and a matching three.js geometry, so the two views stay in step.

---

## The artboard, in centimetres

Design space stays in abstract units, but designers and the game team think in physical size,
so `CM_UNITS = 20` is the single conversion between them. A 26 cm board is 520 units — exactly
the viewBox the preset shapes were drawn against, so presets are unchanged by the new sizing.

A scratch project chooses its board in the wizard (5–100 cm a side); any project can be resized
later from the editor's Artboard panel. The 2D `viewBox` and the 3D grid both derive from that
one number, so the two views always agree about how big a centimetre is.

## Placing the character

`offset {x, y, z}` translates the **whole** composition — preset primitives and placed
elements together — so "where the character sits" is one value and an element's own x/y
stays relative to the character. In 2D that is a `translate()` outside the scale transform;
in 3D it is `group.position`. The grid never moves, because the grid is the board.

Dragging the character body in either view moves it. The Placement panel gives exact X/Y in
centimetres, a depth slider for 3D, and a 3x3 align control that parks the artwork against
any edge or corner — computed from `boundsOf()`, which folds rotation into each primitive's
extents so the box is the real one, not an approximation.

## Editing in 3D

Dragging an element in the 3D scene moves it along the plane facing the camera, which is why
it tracks the pointer exactly at any orbit angle — the grabbed point is projected onto that
plane and the offset from the element's centre is preserved. Front-on, a drag maps 1:1 to
design x/y; orbited 90°, the same horizontal drag moves the element in depth. Alt-drag scales
the element, and the camera only takes the pointer when the drag starts on empty space.

A drag is **one** undo step, not one per pointer-move: the editor snapshots on gesture start
and pushes that single snapshot on release.

Width and height are **independent** unless "Lock aspect ratio" is ticked, which is off by
default. Alt-dragging in 3D resizes on two axes — horizontal drives width, vertical drives
height — and becomes a uniform scale only when the lock is on. When the lock is on, the ratio
is captured once at the start of the gesture rather than re-read from the element each frame;
reading it live fed rounding back into itself and the shape drifted away from its proportions
over a long drag.

---

## Exporting

| Format | What it is |
|---|---|
| **PDF spec sheet** | A4: both views, dimensions, statistics, the parts table and every placed element |
| **PNG — 2D view** | The SVG artwork rasterised at 1200 or 2000 px |
| **PNG — 3D view** | Rendered offscreen at export resolution, at your current viewing angle |
| **SVG** | The 2D artwork as vector |
| **JSON** | The definition the game rebuilds from |

Two things make the images trustworthy rather than screenshots. The 3D export renders through
`lib/scene3d.js` — the *same* module the live view builds its scene from — so geometry,
lighting and grid cannot drift between what you see and what you ship. And it renders
offscreen at the chosen resolution rather than grabbing the canvas, so the image does not
inherit the viewport's size or the display's pixel ratio. The viewing **angle** is taken from
the live camera; the distance is refitted so the export always frames the whole character.

The 2D export reads a copy of `Character2D` kept offscreen, so exporting the flat artwork
works while the 3D view is open — and, again, it is the same component, not a second
renderer.

The same dimensions and statistics the PDF carries are shown in the export dialog before you
commit to a file. If the browser cannot open a WebGL context for the 3D render, the PDF is
still produced with the rest of the sheet intact and the 3D panel marked "not included".

`jsPDF` is loaded on demand — it is roughly 400 kB, so it is fetched when someone actually
exports rather than on every page load.

---

## Notes and limitations

* The scenario describes a **desktop application**. This is built as a web app on the MERN
  stack as specified; wrapping the same client in Electron would deliver it as a desktop
  binary without touching the React code.
* Preset-shape parts stay parametric — they are positioned by the shared model, so the
  click-and-move editing applies to placed elements, which are the objects designed to be
  arranged by hand.
* 3D export as **geometry** now ships as GLB and glTF, built from the same
  `populateCharacterGroup` the live view uses, so the mesh a game engine loads is the mesh the
  designer approved. The scene is converted to engine space once on the way out — glTF is y-up
  while design space is y-down at twenty units to the centimetre — rather than leaving every
  consumer to remember it.
* Profile pictures are stored as a data URL on the user record. A studio this size has no asset
  host, and the client crops square and scales to 256 px before upload, so the picture is a
  predictable ~30 kB thumbnail rather than a phone photograph. A real deployment with more than
  a few dozen designers should move them to object storage.
* Settings live in `localStorage`, not on the account, so a shared studio workstation never
  hands one designer's setup to the next — and the editor can read them before the profile
  request returns.
* Frame rate in the automated tests is low because the sandbox renders with software
  rasterisation. On a normal GPU the 3D view runs comfortably above 30 fps (NFR2).
* `DEV_MEMORY_DB=1` is not a production mode and the README's demo passwords are for
  local use only. Set a real `JWT_SECRET` before deploying anywhere.
* `verify.sh` and `e2e.mjs` assume a Linux sandbox: they use `pkill`/`setsid` and hard-coded
  paths to a bundled Chromium. On Windows run `bash apitest.sh` against a server you started
  yourself. Point that server at a throwaway database — the suite creates records and
  deactivates a designer, so it must not run against real data.

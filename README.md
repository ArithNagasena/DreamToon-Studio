# 🎨 Character Designer

A MERN app that lets designers create simple cartoon characters (animals, plants and humans) for educational games.

Every character is **one parametric model** rendered two ways: **SVG in 2D** and **three.js in 3D**. A change in one view is instantly correct in the other.

---

## ✨ Features

| Area | What you can do |
|---|---|
| **Create** | Start from 8 presets, 11 templates, or a blank artboard sized in centimetres |
| **Views** | 2D (front and side) and 3D, both with the same centimetre grid |
| **Edit** | Drag elements from a shape library; move, resize and rotate in either view |
| **Customise** | Change shape variants, toggle optional parts, colour by part, group or any hex value |
| **Safety** | Undo/redo, autosave, confirm-and-undo on delete |
| **Library** | Search, filter by type, sort by creation date |
| **Export** | PDF spec sheet, PNG (2D or 3D), SVG, JSON, GLB/glTF |
| **Accounts** | JWT login, profiles, and an art-lead admin panel |

---

## 🚀 Quick Start

**1. Install dependencies**

```bash
npm run install:all
```

**2. Start the API** (terminal 1)

```bash
cd server
cp .env.example .env
DEV_MEMORY_DB=1 SEED=1 npm run dev
```

**3. Start the client** (terminal 2)

```bash
cd client
npm run dev
```

Open **http://localhost:5173**

> Or run both at once from the project root:
> ```bash
> DEV_MEMORY_DB=1 SEED=1 npm run dev
> ```

### Demo Accounts

Created automatically when `SEED=1` and the database is empty.

| Email | Role | Password |
|---|---|---|
| `nadia@studio.com` | Designer | `password123` |
| `ruwan@studio.com` | Art lead | `password123` |
| `ishara@studio.com` | Designer | `password123` |

---

## 🗄️ Using Real MongoDB

`DEV_MEMORY_DB=1` uses an in-memory store for **development and tests only**. Data is lost when the server restarts.

For persistence, unset it and set `MONGODB_URI` (local or Atlas):

```bash
# Local
MONGODB_URI="mongodb://127.0.0.1:27017/character-designer" npm run dev

# Atlas
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/character-designer" npm run dev
```

---

## 🏗️ Architecture

```
shared/character.js   One parametric model: shapes, palette, primitives, validation
                      (used by both the server and the client)

server/               Express API, Mongoose models, JWT auth, repository layer
client/               React app: Character2D (SVG), Character3D (three.js),
                      pages, and exporters
```

### Why one shared model?

- Each shape declares its primitives **once**.
- The 2D renderer draws them as SVG.
- The 3D renderer builds matching three.js geometry.
- The side view is a projection of the same list.

Adding a shape means adding **one entry**, so the views can never drift apart.

---

## ✅ Testing

```bash
bash verify.sh
```

Runs the API checks and the end-to-end browser checks. Both must report **`0 failed`**.

| Platform | Command |
|---|---|
| Linux / sandbox | `bash verify.sh` |
| Windows | `node featuretest.mjs` (against a running server) |

> ⚠️ Always point tests at a **throwaway database**. The suites create and modify records.

---

## 📝 Notes

| Topic | Detail |
|---|---|
| **Desktop use** | Built as a web app; wrapping the client in Electron would make it a desktop app |
| **Editing** | Only placed elements are hand-editable; preset parts stay parametric |
| **Profile pictures** | Stored as data URLs; move to object storage for larger teams |
| **Settings** | Stored in `localStorage`, not on the account |
| **Test scripts** | `verify.sh` assumes a Linux sandbox (`pkill`, `setsid`, bundled Chromium) |

---

## 🔒 Before Deploying

- Set a real `JWT_SECRET`.
- Do **not** use `DEV_MEMORY_DB` in production.
- The demo passwords are for local use only.

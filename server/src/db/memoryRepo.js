/**
 * In-memory repository — development and automated-test use only.
 * Enabled with DEV_MEMORY_DB=1. Mirrors the Mongo repository's contract
 * exactly so the routes above it never know which one they are talking to.
 */
import crypto from 'node:crypto';

const oid = () => crypto.randomBytes(12).toString('hex');
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

export function createMemoryRepo() {
  const users = new Map();
  const characters = new Map();
  const templates = new Map();

  const shapeUser = (u) => (u ? clone({ ...u, _id: u._id }) : null);
  const shapeChar = (c) => (c ? clone({ ...c, _id: c._id }) : null);

  return {
    kind: 'memory',
    async connect() { return this; },
    async disconnect() { users.clear(); characters.clear(); templates.clear(); },

    users: {
      async create({ name, username, email, passwordHash, role = 'designer', avatar = null }) {
        const now = new Date().toISOString();
        const u = { _id: oid(), name, username: String(username || '').toLowerCase(),
                    email: email.toLowerCase(), passwordHash, role, avatar,
                    status: 'active', lastActiveAt: now, createdAt: now, updatedAt: now };
        users.set(u._id, u);
        return shapeUser(u);
      },
      async findByEmail(email) {
        for (const u of users.values()) if (u.email === String(email).toLowerCase()) return shapeUser(u);
        return null;
      },
      async findByUsername(username) {
        const want = String(username || '').toLowerCase();
        if (!want) return null;
        for (const u of users.values()) if (u.username === want) return shapeUser(u);
        return null;
      },
      async updateProfile(id, patch) {
        const u = users.get(id); if (!u) return null;
        Object.assign(u, patch, { updatedAt: new Date().toISOString() });
        return shapeUser(u);
      },
      async findById(id) { return shapeUser(users.get(id)); },
      async list() {
        return [...users.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(u => {
            const count = [...characters.values()].filter(c => c.owner === u._id && !c.deletedAt).length;
            return { ...shapeUser(u), characterCount: count };
          });
      },
      async setStatus(id, status) {
        const u = users.get(id); if (!u) return null;
        u.status = status; u.updatedAt = new Date().toISOString();
        return shapeUser(u);
      },
      async setPassword(id, passwordHash) {
        const u = users.get(id); if (!u) return null;
        u.passwordHash = passwordHash; u.updatedAt = new Date().toISOString();
        return shapeUser(u);
      },
      async touch(id) { const u = users.get(id); if (u) u.lastActiveAt = new Date().toISOString(); },
      async count() { return users.size; },
    },

    characters: {
      async create(doc) {
        const now = new Date().toISOString();
        const c = { _id: oid(), ...doc, deletedAt: null, createdAt: now, updatedAt: now };
        characters.set(c._id, c);
        return shapeChar(c);
      },
      async listByOwner(owner, { q = '', type = '', sort = 'updated', createdFrom = null, createdTo = null } = {}) {
        let list = [...characters.values()].filter(c => c.owner === owner && !c.deletedAt);
        if (q) list = list.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
        if (type) list = list.filter(c => c.type === type);
        if (createdFrom) list = list.filter(c => new Date(c.createdAt) >= createdFrom);
        if (createdTo) list = list.filter(c => new Date(c.createdAt) <= createdTo);
        const by = {
          name: (a, b) => a.name.localeCompare(b.name),
          created: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
          updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
        };
        list.sort(by[sort] ?? by.updated);
        return list.map(shapeChar);
      },
      async findById(id) { return shapeChar(characters.get(id)); },
      async update(id, patch) {
        const c = characters.get(id); if (!c) return null;
        Object.assign(c, patch, { updatedAt: new Date().toISOString() });
        return shapeChar(c);
      },
      async softDelete(id) {
        const c = characters.get(id); if (!c) return null;
        c.deletedAt = new Date().toISOString(); c.updatedAt = c.deletedAt;
        return shapeChar(c);
      },
      async restore(id) {
        const c = characters.get(id); if (!c) return null;
        c.deletedAt = null; c.updatedAt = new Date().toISOString();
        return shapeChar(c);
      },
      async countByOwner(owner) {
        return [...characters.values()].filter(c => c.owner === owner && !c.deletedAt).length;
      },
    },

    templates: {
      async create(doc) {
        const now = new Date().toISOString();
        const t = { _id: oid(), ...doc, createdAt: now, updatedAt: now };
        templates.set(t._id, t);
        return clone(t);
      },
      async listByOwner(owner) {
        return [...templates.values()]
          .filter(t => t.owner === owner)
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .map(clone);
      },
      async findById(id) { return clone(templates.get(id)) ?? null; },
      async remove(id) { return templates.delete(id); },
      async countByOwner(owner) {
        return [...templates.values()].filter(t => t.owner === owner).length;
      },
    },
  };
}

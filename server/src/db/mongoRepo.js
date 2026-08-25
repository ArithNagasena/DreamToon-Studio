/**
 * MongoDB repository — the production path.
 * Same contract as the in-memory repository so routes are storage-agnostic.
 */
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Character } from '../models/Character.js';
import { Template } from '../models/Template.js';

const toPlainUser = (u) => (u ? { ...u.toObject(), _id: String(u._id) } : null);
const fromMap = (v) => (v instanceof Map ? Object.fromEntries(v) : (v || {}));
const toPlainChar = (c) => {
  if (!c) return null;
  const o = c.toObject();
  return { ...o, _id: String(o._id), owner: String(o.owner),
           colors: fromMap(o.colors), variants: fromMap(o.variants), hidden: o.hidden || [] };
};
const toPlainTemplate = (t) => {
  if (!t) return null;
  const o = t.toObject();
  return { ...o, _id: String(o._id), owner: String(o.owner),
           colors: fromMap(o.colors), variants: fromMap(o.variants), hidden: o.hidden || [] };
};

export function createMongoRepo(uri) {
  return {
    kind: 'mongodb',
    async connect() {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      return this;
    },
    async disconnect() { await mongoose.disconnect(); },

    users: {
      async create(doc)          { return toPlainUser(await User.create(doc)); },
      async findByEmail(email)   { return toPlainUser(await User.findOne({ email: String(email).toLowerCase() })); },
      async findByUsername(username) {
        const want = String(username || '').toLowerCase();
        return want ? toPlainUser(await User.findOne({ username: want })) : null;
      },
      async updateProfile(id, patch) { return toPlainUser(await User.findByIdAndUpdate(id, patch, { new: true })); },
      async findById(id)         { return toPlainUser(await User.findById(id)); },
      async list() {
        const users = await User.find().sort({ name: 1 });
        const counts = await Character.aggregate([
          { $match: { deletedAt: null } },
          { $group: { _id: '$owner', n: { $sum: 1 } } },
        ]);
        const byId = Object.fromEntries(counts.map(c => [String(c._id), c.n]));
        return users.map(u => ({ ...toPlainUser(u), characterCount: byId[String(u._id)] || 0 }));
      },
      async setStatus(id, status) { return toPlainUser(await User.findByIdAndUpdate(id, { status }, { new: true })); },
      async setPassword(id, passwordHash) { return toPlainUser(await User.findByIdAndUpdate(id, { passwordHash }, { new: true })); },
      async touch(id)             { await User.findByIdAndUpdate(id, { lastActiveAt: new Date() }); },
      async count()               { return User.countDocuments(); },
    },

    characters: {
      async create(doc) { return toPlainChar(await Character.create(doc)); },
      async listByOwner(owner, { q = '', type = '', sort = 'updated', createdFrom = null, createdTo = null } = {}) {
        const filter = { owner, deletedAt: null };
        if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
        if (type) filter.type = type;
        if (createdFrom || createdTo) {
          filter.createdAt = {};
          if (createdFrom) filter.createdAt.$gte = createdFrom;
          if (createdTo) filter.createdAt.$lte = createdTo;
        }
        const order = {
          name: { name: 1 },
          created: { createdAt: -1 },
          oldest: { createdAt: 1 },
          updated: { updatedAt: -1 },
        }[sort] ?? { updatedAt: -1 };
        const docs = await Character.find(filter).sort(order);
        return docs.map(toPlainChar);
      },
      async findById(id) {
        if (!mongoose.isValidObjectId(id)) return null;
        return toPlainChar(await Character.findById(id));
      },
      async update(id, patch)  { return toPlainChar(await Character.findByIdAndUpdate(id, patch, { new: true })); },
      async softDelete(id)     { return toPlainChar(await Character.findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true })); },
      async restore(id)        { return toPlainChar(await Character.findByIdAndUpdate(id, { deletedAt: null }, { new: true })); },
      async countByOwner(owner){ return Character.countDocuments({ owner, deletedAt: null }); },
    },

    templates: {
      async create(doc) { return toPlainTemplate(await Template.create(doc)); },
      async listByOwner(owner) {
        const docs = await Template.find({ owner }).sort({ updatedAt: -1 });
        return docs.map(toPlainTemplate);
      },
      async findById(id) {
        if (!mongoose.isValidObjectId(id)) return null;
        return toPlainTemplate(await Template.findById(id));
      },
      async remove(id) { await Template.findByIdAndDelete(id); return true; },
      async countByOwner(owner) { return Template.countDocuments({ owner }); },
    },
  };
}

/** A search term is text, not a pattern — escape it before it reaches Mongo. */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

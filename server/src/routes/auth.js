import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken, requireAuth } from '../middleware/auth.js';

const publicUser = (u) => ({
  _id: u._id, name: u.name, username: u.username, email: u.email,
  role: u.role, status: u.status, avatar: u.avatar ?? null,
});

/** Handles are lower case, letters/digits/dot/underscore/hyphen, 3–24 long. */
const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
const normaliseUsername = (v) => String(v || '').trim().toLowerCase();
/** A suggestion derived from the email, used when a client omits the handle. */
const handleFromEmail = (email) =>
  String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24).padEnd(3, '1');

/** A profile picture is a small square PNG/JPEG/WebP data URL. */
const AVATAR_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX = 300_000;

export function authRoutes(repo) {
  const r = Router();

  r.post('/register', async (req, res) => {
    const { name = '', email = '', password = '', role = 'designer' } = req.body || {};
    const username = normaliseUsername(req.body?.username || handleFromEmail(email));
    const errors = {};
    if (!name.trim()) errors.name = 'Enter your full name.';
    if (!USERNAME_RE.test(username))
      errors.username = '3–24 characters: letters, numbers, dot, underscore or hyphen.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Add a domain — for example nadia@studio.com';
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    if (!['designer', 'artlead'].includes(role)) errors.role = 'Choose a role.';
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    if (await repo.users.findByEmail(email))
      return res.status(409).json({ errors: { email: 'An account already uses this email.' } });
    if (await repo.users.findByUsername(username))
      return res.status(409).json({ errors: { username: 'That username is taken.' } });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await repo.users.create({ name: name.trim(), username, email, passwordHash, role });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  r.post('/login', async (req, res) => {
    const { password = '' } = req.body || {};
    // One field accepts either credential: designers remember one of the two,
    // and asking which they typed is a question the server can answer itself.
    const id = String(req.body?.identifier ?? req.body?.email ?? '').trim();
    const user = id.includes('@')
      ? await repo.users.findByEmail(id)
      : (await repo.users.findByUsername(normaliseUsername(id))) ?? await repo.users.findByEmail(id);
    // Deliberately does not reveal which credential was wrong (S1 design note).
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Those details do not match an account.' });
    if (user.status !== 'active')
      return res.status(403).json({ error: 'This account has been deactivated. Ask your art lead.' });
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  /* The profile the account page shows — including how much work is in it. */
  r.get('/me', requireAuth(repo), async (req, res) => {
    const [characterCount, templateCount] = await Promise.all([
      repo.characters.countByOwner(req.user._id),
      repo.templates.countByOwner(req.user._id),
    ]);
    res.json({
      user: publicUser(req.user),
      stats: { characterCount, templateCount, memberSince: req.user.createdAt ?? null },
    });
  });

  /* Name, handle and picture are the designer's own to change. */
  r.patch('/profile', requireAuth(repo), async (req, res) => {
    const patch = {};
    const errors = {};

    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) errors.name = 'Enter your full name.';
      else if (name.length > 80) errors.name = 'Use 80 characters or fewer.';
      else patch.name = name;
    }

    if (req.body?.username != null) {
      const username = normaliseUsername(req.body.username);
      if (!USERNAME_RE.test(username)) {
        errors.username = '3–24 characters: letters, numbers, dot, underscore or hyphen.';
      } else if (username !== req.user.username) {
        const taken = await repo.users.findByUsername(username);
        if (taken) errors.username = 'That username is taken.';
        else patch.username = username;
      }
    }

    if ('avatar' in (req.body || {})) {
      const avatar = req.body.avatar;
      if (avatar === null || avatar === '') patch.avatar = null;
      else if (typeof avatar !== 'string' || !AVATAR_RE.test(avatar))
        errors.avatar = 'Upload a PNG, JPEG or WebP image.';
      else if (avatar.length > AVATAR_MAX)
        errors.avatar = 'That picture is too large — try one under 200 kB.';
      else patch.avatar = avatar;
    }

    if (Object.keys(errors).length) return res.status(400).json({ errors });
    if (!Object.keys(patch).length) return res.json({ user: publicUser(req.user) });

    const user = await repo.users.updateProfile(req.user._id, patch);
    res.json({ user: publicUser(user) });
  });

  r.post('/change-password', requireAuth(repo), async (req, res) => {
    const { currentPassword = '', newPassword = '' } = req.body || {};
    if (!(await bcrypt.compare(currentPassword, req.user.passwordHash)))
      return res.status(400).json({ errors: { currentPassword: 'That is not your current password.' } });
    if (newPassword.length < 8)
      return res.status(400).json({ errors: { newPassword: 'Use at least 8 characters.' } });
    await repo.users.setPassword(req.user._id, await bcrypt.hash(newPassword, 10));
    res.json({ ok: true });
  });

  return r;
}

import { Router } from 'express';
import { requireAuth, requireArtLead } from '../middleware/auth.js';

export function adminRoutes(repo) {
  const r = Router();
  r.use(requireAuth(repo), requireArtLead);

  /* FR14 — the art lead sees every designer and their character count. */
  r.get('/users', async (_req, res) => {
    const users = await repo.users.list();
    res.json({
      users: users.map(u => ({
        _id: u._id, name: u.name, username: u.username, email: u.email, role: u.role,
        status: u.status, characterCount: u.characterCount ?? 0,
        avatar: u.avatar ?? null, lastActiveAt: u.lastActiveAt,
      })),
    });
  });

  /* Deactivation is not deletion — the designer's characters survive. */
  r.patch('/users/:id/status', async (req, res) => {
    const { status } = req.body || {};
    if (!['active', 'deactivated'].includes(status))
      return res.status(400).json({ error: 'Status must be active or deactivated.' });
    if (String(req.params.id) === String(req.user._id))
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    const user = await repo.users.setStatus(req.params.id, status);
    if (!user) return res.status(404).json({ error: 'Designer not found.' });
    res.json({ user: { _id: user._id, name: user.name, status: user.status } });
  });

  return r;
}

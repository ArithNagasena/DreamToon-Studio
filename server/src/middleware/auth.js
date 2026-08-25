import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
export const TOKEN_TTL = '30m';   // NFR5 — session expires after 30 minutes

export const signToken = (user) =>
  jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });

export function requireAuth(repo) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await repo.users.findById(payload.sub);
      if (!user) return res.status(401).json({ error: 'Your account no longer exists.' });
      if (user.status !== 'active') return res.status(403).json({ error: 'This account has been deactivated.' });
      req.user = user;
      repo.users.touch(user._id).catch(() => {});
      next();
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({ error: expired ? 'Your session timed out. Sign in again.' : 'Invalid session.' });
    }
  };
}

export const requireArtLead = (req, res, next) =>
  req.user?.role === 'artlead'
    ? next()
    : res.status(403).json({ error: 'Only art leads can manage designer accounts.' });

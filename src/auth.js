import jwt from 'jsonwebtoken';

function secret() {
  return process.env.JWT_SECRET || 'development-only-secret';
}

export function createToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username, role: user.role }, secret(), {
    expiresIn: '8h',
  });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(header.slice(7), secret());
    next();
  } catch {
    res.status(401).json({ error: 'Your session is invalid or has expired' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function requireAuthOrQueryToken(req, res, next) {
  const token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, secret()); next(); }
  catch { res.status(401).json({ error: 'Your session is invalid or has expired' }); }
}

import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { canAccessDepartment, routeDepartment } from './department-access.js';

function secret() {
  return process.env.JWT_SECRET || 'development-only-secret';
}

export function createToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username, role: user.role }, secret(), {
    expiresIn: '8h',
  });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  return authenticate(req,res,next,header.slice(7));
}

async function authenticate(req,res,next,token) {
  let claims;
  try { claims=jwt.verify(token,secret()); }
  catch { return res.status(401).json({error:'Your session is invalid or has expired'}); }
  if(!/^[1-9]\d*$/.test(String(claims.sub)) || BigInt(claims.sub)>9223372036854775807n)return res.status(401).json({error:'Invalid account'});
  try {
    // Re-read permissions on every request: existing sessions immediately respect changes.
    const user=(await pool.query('SELECT id,username,role,department_access FROM users WHERE id=$1',[claims.sub])).rows[0];
    if(!user)return res.status(401).json({error:'Account no longer exists'});
    req.user={...user,sub:String(user.id)};
    const department=routeDepartment(req.originalUrl);
    if(department&&!canAccessDepartment(user,department))return res.status(403).json({error:'You do not have access to this department'});
    next();
  } catch(error) { next(error); }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export async function requireAuthOrQueryToken(req, res, next) {
  const token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  return authenticate(req,res,next,token);
}

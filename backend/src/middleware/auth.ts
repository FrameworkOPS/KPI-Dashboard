import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { verifyToken, extractToken, JwtPayload } from '../utils/auth';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// Tokens last 7 days, so role, team and active status are re-read from the
// database on each request (cached briefly) instead of trusted from the token.
// Deactivating or demoting a user then takes effect within a minute.
interface CurrentUser { role: string; team: string; teams: string[]; active: boolean }
const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, { at: number; user: CurrentUser | null }>();

async function loadCurrentUser(id: string): Promise<CurrentUser | null> {
  const cached = userCache.get(id);
  if (cached && Date.now() - cached.at < USER_CACHE_TTL_MS) return cached.user;
  const result = await pool.query(
    'SELECT role, team, teams, active FROM users WHERE id = $1',
    [id]
  );
  const row = result.rows[0];
  const user: CurrentUser | null = row
    ? {
        role: row.role,
        team: row.team,
        teams: Array.isArray(row.teams) ? row.teams.filter(Boolean) : [],
        active: row.active !== false,
      }
    : null;
  userCache.set(id, { at: Date.now(), user });
  return user;
}

/** Call after changing a user's role, team or active flag so it applies at once. */
export function invalidateUserCache(id?: string): void {
  if (id) userCache.delete(id);
  else userCache.clear();
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  try {
    const current = await loadCurrentUser(payload.id);
    if (!current || !current.active) {
      res.status(401).json({ error: 'This account is no longer active' });
      return;
    }
    req.user = { ...payload, role: current.role, team: current.team, teams: current.teams };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireLeadershipOrAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || !['admin', 'leadership'].includes(req.user.role)) {
    res.status(403).json({ error: 'Leadership or admin access required' });
    return;
  }
  next();
}

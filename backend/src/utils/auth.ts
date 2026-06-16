import jwt from 'jsonwebtoken';
import { Request } from 'express';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  team: string;     // primary team — kept for back-compat
  teams?: string[]; // full team membership when the user belongs to >1 team
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set');
  }
  return secret;
}

export function signToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as JwtPayload;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Returns true when the requesting user is allowed to read/write data scoped
// to `targetTeam`. Admin / leadership see everything. Otherwise the user's
// primary team OR any team in their `userTeams` array must match (the team
// 'all' on either side is also a match).
export function canAccessTeam(
  userRole: string,
  userTeam: string,
  targetTeam: string,
  userTeams?: string[],
): boolean {
  if (userRole === 'admin' || userRole === 'leadership') return true;
  if (userTeam === 'all' || targetTeam === 'all') return true;
  if (userTeam === targetTeam) return true;
  if (userTeams && userTeams.includes(targetTeam)) return true;
  return false;
}

// All team values a user can access, or 'all' for admin / leadership / team='all'.
// Used by listing endpoints that need to widen their WHERE clause from a
// single team to an IN-list of teams.
export function accessibleTeams(
  userRole: string,
  userTeam: string,
  userTeams?: string[],
): 'all' | string[] {
  if (userRole === 'admin' || userRole === 'leadership') return 'all';
  if (userTeam === 'all') return 'all';
  const set = new Set<string>([userTeam, ...(userTeams || [])].filter(Boolean));
  return Array.from(set);
}

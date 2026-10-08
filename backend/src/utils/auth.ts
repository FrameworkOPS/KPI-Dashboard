import jwt from 'jsonwebtoken';
import { Request } from 'express';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  team: string;     // primary team — kept for back-compat
  teams?: string[]; // full team membership when the user belongs to >1 team
}

// A missing secret would let anyone mint an admin token, so production refuses
// to start without one. Development falls back to a known value and says so.
const JWT_SECRET: string = (() => {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a value of at least 16 characters before the server can start.');
  }
  console.warn('⚠️  JWT_SECRET is not set — using an insecure development default. Set it in backend/.env.');
  return 'changeme_jwt_secret';
})();

export function signToken(payload: JwtPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
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

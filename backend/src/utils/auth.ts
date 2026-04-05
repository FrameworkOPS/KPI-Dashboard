import jwt from 'jsonwebtoken';
import { Request } from 'express';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  team: string;
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET || 'changeme_jwt_secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET || 'changeme_jwt_secret';
  return jwt.verify(token, secret) as JwtPayload;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export function canAccessTeam(userRole: string, userTeam: string, targetTeam: string): boolean {
  if (userRole === 'admin' || userRole === 'leadership') {
    return true;
  }
  return userTeam === targetTeam || userTeam === 'all';
}

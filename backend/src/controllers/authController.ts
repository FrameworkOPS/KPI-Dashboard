import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { signToken } from '../utils/auth';
import { AuthRequest } from '../middleware/auth';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND active = true',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      team: user.team,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        team: user.team,
        active: user.active,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, team, active, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, team, active, created_at, updated_at FROM users ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, first_name, last_name, role, team } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const validRoles = ['admin', 'leadership', 'manager'];
    const validTeams = ['sales', 'production', 'leadership', 'all'];

    if (role && !validRoles.includes(role)) {
      res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
      return;
    }
    if (team && !validTeams.includes(team)) {
      res.status(400).json({ error: `Team must be one of: ${validTeams.join(', ')}` });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, team)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, role, team, active, created_at`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        first_name || null,
        last_name || null,
        role || 'manager',
        team || 'all',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { email, password, first_name, last_name, role, team, active } = req.body;

    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email.toLowerCase().trim());
    }
    if (password !== undefined) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(hash);
    }
    if (first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(last_name);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (team !== undefined) {
      updates.push(`team = $${paramCount++}`);
      values.push(team);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramCount++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, first_name, last_name, role, team, active, created_at, updated_at`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user!.id) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const result = await pool.query(
      'UPDATE users SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id, email, active',
      [id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'User deactivated', user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

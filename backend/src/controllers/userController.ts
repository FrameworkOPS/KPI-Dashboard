import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, team, active, created_at
       FROM users
       ORDER BY first_name, last_name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, first_name, last_name, role, team, active } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

    const validRoles = ['admin', 'leadership', 'manager'];
    if (role && !validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const validTeams = ['sales', 'production', 'leadership', 'all'];
    if (team && !validTeams.includes(team)) {
      res.status(400).json({ error: `team must be one of: ${validTeams.join(', ')}` });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'A user with that email already exists' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, team, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, first_name, last_name, role, team, active, created_at`,
      [
        email.toLowerCase().trim(),
        password_hash,
        first_name || '',
        last_name || '',
        role || 'manager',
        team || 'all',
        active !== false,
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

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Build dynamic update
    const sets: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (email !== undefined)      { sets.push(`email = $${p++}`);       values.push(email.toLowerCase().trim()); }
    if (first_name !== undefined) { sets.push(`first_name = $${p++}`);  values.push(first_name); }
    if (last_name !== undefined)  { sets.push(`last_name = $${p++}`);   values.push(last_name); }
    if (role !== undefined)       { sets.push(`role = $${p++}`);        values.push(role); }
    if (team !== undefined)       { sets.push(`team = $${p++}`);        values.push(team); }
    if (active !== undefined)     { sets.push(`active = $${p++}`);      values.push(active); }

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sets.push(`password_hash = $${p++}`);
      values.push(hash);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields provided to update' });
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${p}
       RETURNING id, email, first_name, last_name, role, team, active, created_at`,
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
    const requestingUser = req.user!;

    if (requestingUser.id === id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
}

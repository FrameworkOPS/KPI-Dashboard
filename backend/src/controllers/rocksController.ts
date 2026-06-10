import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';

export async function getRocks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, quarter, year } = req.query;
    const user = req.user!;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string, user.teams)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`r.team = $${paramCount++}`);
      values.push(team);
    } else if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
      conditions.push(`r.team = $${paramCount++}`);
      values.push(user.team);
    }

    if (quarter) {
      conditions.push(`r.quarter = $${paramCount++}`);
      values.push(parseInt(quarter as string));
    }
    if (year) {
      conditions.push(`r.year = $${paramCount++}`);
      values.push(parseInt(year as string));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT r.*,
         o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.email AS owner_email,
         c.first_name AS creator_first_name, c.last_name AS creator_last_name
       FROM rocks r
       LEFT JOIN users o ON r.owner_id = o.id
       LEFT JOIN users c ON r.created_by = c.id
       ${whereClause}
       ORDER BY r.year DESC, r.quarter DESC, r.created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createRock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, owner_id, title, description, quarter, year, status, completion_percentage, due_date } = req.body;
    const user = req.user!;

    if (!team || !title) {
      res.status(400).json({ error: 'team and title are required' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const validStatuses = ['on_track', 'off_track', 'done', 'not_started'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `INSERT INTO rocks
         (team, owner_id, title, description, quarter, year, status, completion_percentage, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        team,
        owner_id || user.id,
        title,
        description || null,
        quarter || null,
        year || null,
        status || 'on_track',
        completion_percentage ?? 0,
        due_date || null,
        user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateRock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { owner_id, title, description, quarter, year, status, completion_percentage, due_date } = req.body;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM rocks WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Rock not found' });
      return;
    }

    const rock = existing.rows[0];
    if (!canAccessTeam(user.role, user.team, rock.team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const result = await pool.query(
      `UPDATE rocks SET
         owner_id = COALESCE($1, owner_id),
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         quarter = COALESCE($4, quarter),
         year = COALESCE($5, year),
         status = COALESCE($6, status),
         completion_percentage = COALESCE($7, completion_percentage),
         due_date = COALESCE($8, due_date),
         updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        owner_id || null,
        title || null,
        description !== undefined ? description : null,
        quarter || null,
        year || null,
        status || null,
        completion_percentage !== undefined ? completion_percentage : null,
        due_date || null,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteRock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM rocks WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Rock not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM rocks WHERE id = $1', [id]);
    res.json({ message: 'Rock deleted' });
  } catch (err) {
    next(err);
  }
}

import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';

export async function getTodos(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, status } = req.query;
    const user = req.user!;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string, user.teams)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`t.team = $${paramCount++}`);
      values.push(team);
    } else if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
      conditions.push(`t.team = $${paramCount++}`);
      values.push(user.team);
    }

    if (status) {
      conditions.push(`t.status = $${paramCount++}`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT t.*,
         o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.email AS owner_email,
         c.first_name AS creator_first_name, c.last_name AS creator_last_name
       FROM todos t
       LEFT JOIN users o ON t.owner_id = o.id
       LEFT JOIN users c ON t.created_by = c.id
       ${whereClause}
       ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createTodo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, title, description, owner_id, due_date, status } = req.body;
    const user = req.user!;

    if (!team || !title) {
      res.status(400).json({ error: 'team and title are required' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const validStatuses = ['pending', 'complete'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `INSERT INTO todos (team, title, description, owner_id, due_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [team, title, description || null, owner_id || user.id, due_date || null, status || 'pending', user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateTodo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { title, description, owner_id, due_date, status } = req.body;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM todos WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const result = await pool.query(
      `UPDATE todos SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         owner_id = COALESCE($3, owner_id),
         due_date = COALESCE($4, due_date),
         status = COALESCE($5, status),
         updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title || null, description !== undefined ? description : null, owner_id || null, due_date || null, status || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteTodo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM todos WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM todos WHERE id = $1', [id]);
    res.json({ message: 'Todo deleted' });
  } catch (err) {
    next(err);
  }
}

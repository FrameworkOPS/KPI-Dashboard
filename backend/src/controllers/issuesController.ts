import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';

export async function getIssues(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, status, sort } = req.query;
    const user = req.user!;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string, user.teams)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`i.team = $${paramCount++}`);
      values.push(team);
    } else if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
      conditions.push(`i.team = $${paramCount++}`);
      values.push(user.team);
    }

    if (status) {
      conditions.push(`i.status = $${paramCount++}`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const currentUserParam = paramCount++;
    values.push(user.id);

    const orderClause = sort === 'votes'
      ? 'ORDER BY vote_count DESC, i.created_at DESC'
      : `ORDER BY
           CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
           i.created_at DESC`;

    const result = await pool.query(
      `SELECT i.*,
         o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.email AS owner_email,
         c.first_name AS creator_first_name, c.last_name AS creator_last_name,
         COALESCE(v.vote_count, 0)::int AS vote_count,
         (uv.user_id IS NOT NULL) AS has_voted
       FROM issues i
       LEFT JOIN users o ON i.owner_id = o.id
       LEFT JOIN users c ON i.created_by = c.id
       LEFT JOIN (
         SELECT issue_id, COUNT(*) AS vote_count FROM issue_votes GROUP BY issue_id
       ) v ON v.issue_id = i.id
       LEFT JOIN issue_votes uv ON uv.issue_id = i.id AND uv.user_id = $${currentUserParam}
       ${whereClause}
       ${orderClause}`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createIssue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, title, description, priority, status, owner_id } = req.body;
    const user = req.user!;

    if (!team || !title) {
      res.status(400).json({ error: 'team and title are required' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const validPriorities = ['high', 'medium', 'low'];
    const validStatuses = ['open', 'in_progress', 'solved'];

    if (priority && !validPriorities.includes(priority)) {
      res.status(400).json({ error: `Priority must be one of: ${validPriorities.join(', ')}` });
      return;
    }
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `INSERT INTO issues (team, title, description, priority, status, owner_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [team, title, description || null, priority || 'medium', status || 'open', owner_id || user.id, user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateIssue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { title, description, priority, status, owner_id } = req.body;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM issues WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const result = await pool.query(
      `UPDATE issues SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         priority = COALESCE($3, priority),
         status = COALESCE($4, status),
         owner_id = COALESCE($5, owner_id),
         updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title || null, description !== undefined ? description : null, priority || null, status || null, owner_id || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteIssue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM issues WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM issues WHERE id = $1', [id]);
    res.json({ message: 'Issue deleted' });
  } catch (err) {
    next(err);
  }
}

export async function voteIssue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM issues WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query(
      `INSERT INTO issue_votes (issue_id, user_id) VALUES ($1, $2)
       ON CONFLICT (issue_id, user_id) DO NOTHING`,
      [id, user.id]
    );

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS vote_count FROM issue_votes WHERE issue_id = $1',
      [id]
    );

    res.json({ vote_count: rows[0].vote_count, has_voted: true });
  } catch (err) {
    next(err);
  }
}

export async function unvoteIssue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM issues WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM issue_votes WHERE issue_id = $1 AND user_id = $2', [id, user.id]);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS vote_count FROM issue_votes WHERE issue_id = $1',
      [id]
    );

    res.json({ vote_count: rows[0].vote_count, has_voted: false });
  } catch (err) {
    next(err);
  }
}

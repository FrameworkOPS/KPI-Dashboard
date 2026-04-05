import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';

export async function getMeetings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team } = req.query;
    const user = req.user!;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`m.team = $${paramCount++}`);
      values.push(team);
    } else if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
      conditions.push(`m.team = $${paramCount++}`);
      values.push(user.team);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT m.*,
         u.first_name AS creator_first_name, u.last_name AS creator_last_name, u.email AS creator_email
       FROM meetings m
       LEFT JOIN users u ON m.created_by = u.id
       ${whereClause}
       ORDER BY m.meeting_date DESC, m.created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      team, meeting_date, segue, scorecard_notes, rocks_notes,
      headlines, todos_notes, ids_issues, conclude_notes, rating, status,
    } = req.body;
    const user = req.user!;

    if (!team || !meeting_date) {
      res.status(400).json({ error: 'team and meeting_date are required' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    if (rating !== undefined && (rating < 1 || rating > 10)) {
      res.status(400).json({ error: 'Rating must be between 1 and 10' });
      return;
    }

    const validStatuses = ['scheduled', 'in_progress', 'complete'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `INSERT INTO meetings
         (team, meeting_date, segue, scorecard_notes, rocks_notes, headlines,
          todos_notes, ids_issues, conclude_notes, rating, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        team, meeting_date,
        segue || null, scorecard_notes || null, rocks_notes || null,
        headlines || null, todos_notes || null, ids_issues || null,
        conclude_notes || null, rating || null, status || 'scheduled', user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const {
      segue, scorecard_notes, rocks_notes, headlines,
      todos_notes, ids_issues, conclude_notes, rating, status,
    } = req.body;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    if (rating !== undefined && (rating < 1 || rating > 10)) {
      res.status(400).json({ error: 'Rating must be between 1 and 10' });
      return;
    }

    const result = await pool.query(
      `UPDATE meetings SET
         segue = COALESCE($1, segue),
         scorecard_notes = COALESCE($2, scorecard_notes),
         rocks_notes = COALESCE($3, rocks_notes),
         headlines = COALESCE($4, headlines),
         todos_notes = COALESCE($5, todos_notes),
         ids_issues = COALESCE($6, ids_issues),
         conclude_notes = COALESCE($7, conclude_notes),
         rating = COALESCE($8, rating),
         status = COALESCE($9, status),
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        segue !== undefined ? segue : null,
        scorecard_notes !== undefined ? scorecard_notes : null,
        rocks_notes !== undefined ? rocks_notes : null,
        headlines !== undefined ? headlines : null,
        todos_notes !== undefined ? todos_notes : null,
        ids_issues !== undefined ? ids_issues : null,
        conclude_notes !== undefined ? conclude_notes : null,
        rating !== undefined ? rating : null,
        status || null,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM meetings WHERE id = $1', [id]);
    res.json({ message: 'Meeting deleted' });
  } catch (err) {
    next(err);
  }
}

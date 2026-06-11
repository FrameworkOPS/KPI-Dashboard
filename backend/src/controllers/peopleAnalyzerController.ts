import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

// ── Core values CRUD (admin-only) ─────────────────────────────────────────────

export async function listCoreValues(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await pool.query(
      'SELECT * FROM core_values WHERE is_active = true ORDER BY sort_order, name',
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

export async function createCoreValue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description, sort_order } = req.body as { name?: string; description?: string; sort_order?: number };
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const r = await pool.query(
      `INSERT INTO core_values (name, description, sort_order)
       VALUES ($1, $2, COALESCE($3, 0))
       RETURNING *`,
      [name.trim(), description?.trim() || null, sort_order ?? null],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

export async function updateCoreValue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { name, description, sort_order, is_active } = req.body as {
      name?: string; description?: string; sort_order?: number; is_active?: boolean;
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    let p = 1;
    if (name !== undefined)        { sets.push(`name = $${p++}`);        values.push(name.trim()); }
    if (description !== undefined) { sets.push(`description = $${p++}`); values.push(description?.trim() || null); }
    if (sort_order !== undefined)  { sets.push(`sort_order = $${p++}`);  values.push(sort_order); }
    if (is_active !== undefined)   { sets.push(`is_active = $${p++}`);   values.push(!!is_active); }
    if (sets.length === 0) {
      res.status(400).json({ error: 'no fields to update' });
      return;
    }
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const r = await pool.query(
      `UPDATE core_values SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      values,
    );
    if (!r.rows[0]) {
      res.status(404).json({ error: 'Core value not found' });
      return;
    }
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

export async function deleteCoreValue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    // Soft delete so existing analyzer entries don't lose their references.
    const r = await pool.query(
      `UPDATE core_values SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!r.rows[0]) {
      res.status(404).json({ error: 'Core value not found' });
      return;
    }
    res.json({ message: 'Core value archived' });
  } catch (err) { next(err); }
}

// ── People Analyzer entries (admin-only) ──────────────────────────────────────

// List every active user with their entry for the requested quarter joined on
// (left join so people without an entry yet still appear). Subjects include
// roster-only users — the whole point is to evaluate the org chart.
export async function listAnalyzerForQuarter(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const quarter = parseInt(String(req.query.quarter || ''), 10);
    const year = parseInt(String(req.query.year || ''), 10);
    if (!quarter || !year || quarter < 1 || quarter > 4) {
      res.status(400).json({ error: 'quarter (1-4) and year are required' });
      return;
    }
    const r = await pool.query(
      `SELECT u.id              AS user_id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              u.team,
              u.roster_only,
              e.id              AS entry_id,
              e.value_scores,
              e.gwc_get,
              e.gwc_want,
              e.gwc_capacity,
              e.notes,
              e.evaluated_by,
              e.updated_at
         FROM users u
         LEFT JOIN people_analyzer_entries e
           ON e.subject_user_id = u.id AND e.quarter = $1 AND e.year = $2
        WHERE u.first_name IS NOT NULL OR u.last_name IS NOT NULL OR u.email IS NOT NULL
        ORDER BY u.first_name, u.last_name`,
      [quarter, year],
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// Upsert one subject's analyzer entry for a quarter.
export async function upsertAnalyzerEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const {
      subject_user_id, quarter, year,
      value_scores, gwc_get, gwc_want, gwc_capacity, notes,
    } = req.body as {
      subject_user_id?: string; quarter?: number; year?: number;
      value_scores?: Record<string, string>;
      gwc_get?: boolean | null; gwc_want?: boolean | null; gwc_capacity?: boolean | null;
      notes?: string;
    };
    if (!subject_user_id || !quarter || !year) {
      res.status(400).json({ error: 'subject_user_id, quarter, year are required' });
      return;
    }
    const scoresJson = JSON.stringify(value_scores || {});
    const r = await pool.query(
      `INSERT INTO people_analyzer_entries
         (subject_user_id, quarter, year, value_scores, gwc_get, gwc_want, gwc_capacity, notes, evaluated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
       ON CONFLICT (subject_user_id, quarter, year) DO UPDATE SET
         value_scores  = EXCLUDED.value_scores,
         gwc_get       = EXCLUDED.gwc_get,
         gwc_want      = EXCLUDED.gwc_want,
         gwc_capacity  = EXCLUDED.gwc_capacity,
         notes         = EXCLUDED.notes,
         evaluated_by  = EXCLUDED.evaluated_by,
         updated_at    = NOW()
       RETURNING *`,
      [
        subject_user_id, quarter, year, scoresJson,
        gwc_get ?? null, gwc_want ?? null, gwc_capacity ?? null,
        notes?.trim() || null, user.id,
      ],
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

export async function deleteAnalyzerEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const r = await pool.query(
      'DELETE FROM people_analyzer_entries WHERE id = $1 RETURNING id',
      [id],
    );
    if (!r.rows[0]) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    res.json({ message: 'Entry deleted' });
  } catch (err) { next(err); }
}

import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getCrews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { active } = req.query;
    const params: unknown[] = [];
    let whereClause = '';
    if (active === 'true') { whereClause = 'WHERE is_active = $1'; params.push(true); }
    else if (active === 'false') { whereClause = 'WHERE is_active = $1'; params.push(false); }

    const result = await pool.query(
      `SELECT id, crew_name, crew_type, team_members, training_period_days, start_date,
              terminate_date, revenue_per_sq, weekly_sq_capacity, is_active, created_at, updated_at
       FROM crews ${whereClause} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function getCrew(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, crew_name, crew_type, team_members, training_period_days, start_date,
              terminate_date, revenue_per_sq, weekly_sq_capacity, is_active, created_at, updated_at
       FROM crews WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Crew not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function createCrew(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { crew_name, crew_type, team_members, training_period_days, start_date, terminate_date, revenue_per_sq, weekly_sq_capacity } = req.body;
    if (!crew_name || !crew_type) {
      res.status(400).json({ error: 'crew_name and crew_type are required' }); return;
    }
    if (!['shingle', 'metal'].includes(crew_type)) {
      res.status(400).json({ error: 'crew_type must be "shingle" or "metal"' }); return;
    }
    const defaultRevenue = crew_type === 'shingle' ? 600 : 1000;
    const defaultCapacity = crew_type === 'shingle' ? 200 : 100;
    const effectiveStartDate = start_date || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `INSERT INTO crews (crew_name, crew_type, team_members, training_period_days, start_date,
        terminate_date, revenue_per_sq, weekly_sq_capacity, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
      [crew_name, crew_type, team_members ?? 0, training_period_days ?? 0, effectiveStartDate,
       terminate_date || null, revenue_per_sq ?? defaultRevenue, weekly_sq_capacity ?? defaultCapacity,
       req.user?.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function updateCrew(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT id FROM crews WHERE id = $1', [id]);
    if (!existing.rows[0]) { res.status(404).json({ error: 'Crew not found' }); return; }

    const { crew_name, crew_type, team_members, training_period_days, start_date, terminate_date, revenue_per_sq, weekly_sq_capacity, is_active } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (crew_name !== undefined) { updates.push(`crew_name=$${p++}`); params.push(crew_name); }
    if (crew_type !== undefined) { updates.push(`crew_type=$${p++}`); params.push(crew_type); }
    if (team_members !== undefined) { updates.push(`team_members=$${p++}`); params.push(team_members); }
    if (training_period_days !== undefined) { updates.push(`training_period_days=$${p++}`); params.push(training_period_days); }
    if (start_date !== undefined) { updates.push(`start_date=$${p++}`); params.push(start_date); }
    if (terminate_date !== undefined) { updates.push(`terminate_date=$${p++}`); params.push(terminate_date || null); }
    if (revenue_per_sq !== undefined) { updates.push(`revenue_per_sq=$${p++}`); params.push(revenue_per_sq); }
    if (weekly_sq_capacity !== undefined) { updates.push(`weekly_sq_capacity=$${p++}`); params.push(weekly_sq_capacity); }
    if (is_active !== undefined) { updates.push(`is_active=$${p++}`); params.push(is_active); }

    if (!updates.length) { res.json({ success: true, data: existing.rows[0] }); return; }
    updates.push(`updated_at=NOW()`);
    params.push(id);
    const result = await pool.query(
      `UPDATE crews SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function deleteCrew(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'UPDATE crews SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Crew not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

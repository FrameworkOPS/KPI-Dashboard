import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getCustomProjects(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { crew_id } = req.query;
    const params: unknown[] = [true];
    const conditions: string[] = ['cp.is_active=$1'];
    if (crew_id) { conditions.push(`cp.crew_id=$2`); params.push(crew_id); }
    const result = await pool.query(
      `SELECT cp.*, c.crew_name, c.crew_type FROM custom_projects cp
       JOIN crews c ON c.id = cp.crew_id
       WHERE ${conditions.join(' AND ')} ORDER BY cp.start_date ASC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function createCustomProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { crew_id, project_name, start_date, end_date, notes } = req.body;
    if (!crew_id || !project_name || !start_date || !end_date) {
      res.status(400).json({ error: 'Missing required fields' }); return;
    }
    if (new Date(start_date) >= new Date(end_date)) {
      res.status(400).json({ error: 'Start date must be before end date' }); return;
    }
    const result = await pool.query(
      `INSERT INTO custom_projects (crew_id, project_name, start_date, end_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [crew_id, project_name, start_date, end_date, notes || null, req.user?.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function updateCustomProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { project_name, start_date, end_date, notes } = req.body;
    if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
      res.status(400).json({ error: 'Start date must be before end date' }); return;
    }
    const updates: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (project_name !== undefined) { updates.push(`project_name=$${p++}`); params.push(project_name); }
    if (start_date !== undefined) { updates.push(`start_date=$${p++}`); params.push(start_date); }
    if (end_date !== undefined) { updates.push(`end_date=$${p++}`); params.push(end_date); }
    if (notes !== undefined) { updates.push(`notes=$${p++}`); params.push(notes); }
    if (!updates.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    updates.push(`updated_at=NOW()`);
    params.push(id);
    const result = await pool.query(
      `UPDATE custom_projects SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function deleteCustomProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'UPDATE custom_projects SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

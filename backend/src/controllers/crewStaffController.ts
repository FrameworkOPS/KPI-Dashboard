import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getCrewStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { crew_id } = req.query;
    const params: unknown[] = [true];
    const conditions: string[] = ['cs.is_active=$1'];
    if (crew_id) { conditions.push(`cs.crew_id=$2`); params.push(crew_id); }
    const result = await pool.query(
      `SELECT cs.*, c.crew_name, c.crew_type FROM crew_staff cs
       JOIN crews c ON c.id = cs.crew_id
       WHERE ${conditions.join(' AND ')} ORDER BY cs.added_date DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

// GET /crew-staff/crew/:crewId — fetch the active staff record for a single crew
export async function getCrewStaffByCrew(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { crewId } = req.params;
    const result = await pool.query(
      `SELECT * FROM crew_staff WHERE crew_id=$1 AND is_active=true ORDER BY added_date DESC LIMIT 1`,
      [crewId]
    );
    const row = result.rows[0] || { lead_count: 0, super_count: 0 };
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
}

export async function upsertCrewStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Accept both camelCase and snake_case from different callers
    const crewId   = req.body.crewId   ?? req.body.crew_id;
    const leadCount  = req.body.leadCount  ?? req.body.lead_count  ?? 0;
    const superCount = req.body.superCount ?? req.body.super_count ?? 0;
    const addedDate  = req.body.addedDate  ?? req.body.added_date;
    const notes      = req.body.notes ?? null;

    if (!crewId || !addedDate) {
      res.status(400).json({ error: 'Missing required fields: crewId, addedDate' }); return;
    }
    await pool.query(
      'UPDATE crew_staff SET is_active=false, updated_at=NOW() WHERE crew_id=$1 AND is_active=true',
      [crewId]
    );
    const result = await pool.query(
      `INSERT INTO crew_staff (crew_id, lead_count, super_count, added_date, notes, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *`,
      [crewId, leadCount, superCount, addedDate, notes, req.user?.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getSalesForecasts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { startWeek, endWeek, jobType } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (startWeek) { conditions.push(`forecast_week >= $${p++}`); params.push(startWeek); }
    if (endWeek)   { conditions.push(`forecast_week <= $${p++}`); params.push(endWeek); }
    if (jobType)   { conditions.push(`job_type = $${p++}`); params.push(jobType); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM sales_forecast ${where} ORDER BY forecast_week ASC, job_type ASC`,
      params
    );
    res.json({
      success: true,
      data: result.rows.map((r: any) => ({
        ...r,
        projected_square_footage: parseFloat(r.projected_square_footage) || 0,
        projected_job_count: parseInt(r.projected_job_count) || 0,
      })),
    });
  } catch (err) { next(err); }
}

export async function createOrUpdateSalesForecast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { forecastWeek, jobType, projectedSquareFootage, projectedJobCount, notes } = req.body;
    if (!forecastWeek || !jobType || projectedSquareFootage === undefined) {
      res.status(400).json({ error: 'Missing required fields: forecastWeek, jobType, projectedSquareFootage' }); return;
    }
    if (!['shingle', 'metal'].includes(jobType)) {
      res.status(400).json({ error: 'jobType must be "shingle" or "metal"' }); return;
    }
    const result = await pool.query(
      `INSERT INTO sales_forecast (forecast_week, job_type, projected_square_footage, projected_job_count, notes, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (forecast_week, job_type) DO UPDATE
       SET projected_square_footage=$3, projected_job_count=$4, notes=$5, updated_by=$6, updated_at=NOW()
       RETURNING *`,
      [forecastWeek, jobType, projectedSquareFootage, projectedJobCount || 0, notes || null, req.user?.id || null]
    );
    const saved = result.rows[0];
    res.status(201).json({
      success: true,
      data: {
        ...saved,
        projected_square_footage: parseFloat(saved.projected_square_footage) || 0,
        projected_job_count: parseInt(saved.projected_job_count) || 0,
      },
    });
  } catch (err) { next(err); }
}

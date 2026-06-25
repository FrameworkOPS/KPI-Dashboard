import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const parsePipelineRow = (row: any) => ({
  ...row,
  square_footage: parseFloat(row.square_footage) || 0,
  revenue_per_sq: parseFloat(row.revenue_per_sq) || 0,
  total_revenue: parseFloat(row.total_revenue) || 0,
  estimated_days_to_completion: parseInt(row.estimated_days_to_completion) || 0,
});

export async function getPipelineItems(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobType, status, activeOnly = 'true' } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (activeOnly === 'true') { conditions.push('is_active=true'); }
    if (jobType) { conditions.push(`job_type=$${p++}`); params.push(jobType); }
    if (status)  { conditions.push(`status=$${p++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM pipeline_items ${where} ORDER BY added_date DESC`,
      params
    );
    res.json({ success: true, data: result.rows.map(parsePipelineRow) });
  } catch (err) { next(err); }
}

export async function createPipelineItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobType, squareFootage, estimatedDaysToCompletion, revenuePerSq, status = 'pending', addedDate, targetStartDate, notes } = req.body;
    if (!jobType || !squareFootage || !estimatedDaysToCompletion || !revenuePerSq || !addedDate) {
      res.status(400).json({ error: 'Missing required fields' }); return;
    }
    if (!['shingle', 'metal'].includes(jobType)) {
      res.status(400).json({ error: 'jobType must be "shingle" or "metal"' }); return;
    }
    const totalRevenue = squareFootage * revenuePerSq;
    const result = await pool.query(
      `INSERT INTO pipeline_items (job_type, square_footage, estimated_days_to_completion, revenue_per_sq, total_revenue, status, added_date, target_start_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [jobType, squareFootage, estimatedDaysToCompletion, revenuePerSq, totalRevenue, status, addedDate, targetStartDate || null, notes || null, req.user?.id || null]
    );
    res.status(201).json({ success: true, data: parsePipelineRow(result.rows[0]) });
  } catch (err) { next(err); }
}

export async function updatePipelineItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM pipeline_items WHERE id=$1', [id]);
    if (!existing.rows[0]) { res.status(404).json({ error: 'Pipeline item not found' }); return; }

    const { jobType, squareFootage, estimatedDaysToCompletion, revenuePerSq, status, addedDate, targetStartDate, notes, isActive } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (jobType !== undefined) { updates.push(`job_type=$${p++}`); values.push(jobType); }
    if (squareFootage !== undefined) { updates.push(`square_footage=$${p++}`); values.push(squareFootage); }
    if (estimatedDaysToCompletion !== undefined) { updates.push(`estimated_days_to_completion=$${p++}`); values.push(estimatedDaysToCompletion); }
    if (revenuePerSq !== undefined) { updates.push(`revenue_per_sq=$${p++}`); values.push(revenuePerSq); }
    if (status !== undefined) { updates.push(`status=$${p++}`); values.push(status); }
    if (addedDate !== undefined) { updates.push(`added_date=$${p++}`); values.push(addedDate); }
    if (targetStartDate !== undefined) { updates.push(`target_start_date=$${p++}`); values.push(targetStartDate); }
    if (notes !== undefined) { updates.push(`notes=$${p++}`); values.push(notes); }
    if (isActive !== undefined) { updates.push(`is_active=$${p++}`); values.push(isActive); }
    if (squareFootage !== undefined || revenuePerSq !== undefined) {
      const finalSq = squareFootage ?? existing.rows[0].square_footage;
      const finalRev = revenuePerSq ?? existing.rows[0].revenue_per_sq;
      updates.push(`total_revenue=$${p++}`);
      values.push(finalSq * finalRev);
    }
    if (!updates.length) { res.json({ success: true, data: parsePipelineRow(existing.rows[0]) }); return; }
    updates.push('updated_at=NOW()');
    values.push(id);
    const result = await pool.query(
      `UPDATE pipeline_items SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, values
    );
    res.json({ success: true, data: parsePipelineRow(result.rows[0]) });
  } catch (err) { next(err); }
}

export async function deletePipelineItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'UPDATE pipeline_items SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Pipeline item not found' }); return; }
    res.json({ success: true, data: parsePipelineRow(result.rows[0]) });
  } catch (err) { next(err); }
}

export async function getPipelineSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT job_type,
              SUM(square_footage) AS total_sqs,
              COUNT(*) AS job_count,
              SUM(total_revenue) AS total_revenue
       FROM pipeline_items WHERE is_active=true GROUP BY job_type ORDER BY job_type`
    );
    const combined = result.rows.reduce(
      (acc: any, row: any) => ({
        total_sqs: acc.total_sqs + (parseFloat(row.total_sqs) || 0),
        total_revenue: acc.total_revenue + (parseFloat(row.total_revenue) || 0),
        job_count: acc.job_count + (parseInt(row.job_count) || 0),
      }),
      { total_sqs: 0, total_revenue: 0, job_count: 0 }
    );
    res.json({
      success: true,
      data: {
        byType: result.rows.map((r: any) => ({
          job_type: r.job_type,
          total_sqs: parseFloat(r.total_sqs) || 0,
          job_count: parseInt(r.job_count) || 0,
          total_revenue: parseFloat(r.total_revenue) || 0,
        })),
        combined,
      },
    });
  } catch (err) { next(err); }
}

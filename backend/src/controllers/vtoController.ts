import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getVtoSections(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT vs.*, u.first_name, u.last_name, u.email
       FROM vto_sections vs
       LEFT JOIN users u ON vs.updated_by = u.id
       ORDER BY
         CASE vs.section_key
           WHEN 'core_values' THEN 1
           WHEN 'core_focus' THEN 2
           WHEN 'ten_year_target' THEN 3
           WHEN 'marketing_strategy' THEN 4
           WHEN 'three_year_picture' THEN 5
           WHEN 'one_year_plan' THEN 6
           ELSE 7
         END`
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function updateVtoSection(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const section_key = req.params['section_key'] as string;
    const { content } = req.body;
    const user = req.user!;

    if (content === undefined) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const validKeys = ['core_values', 'core_focus', 'ten_year_target', 'marketing_strategy', 'three_year_picture', 'one_year_plan'];
    if (!validKeys.includes(section_key)) {
      res.status(400).json({ error: `Invalid section_key. Must be one of: ${validKeys.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `UPDATE vto_sections SET
         content = $1,
         updated_by = $2,
         updated_at = NOW()
       WHERE section_key = $3
       RETURNING *`,
      [JSON.stringify(content), user.id, section_key]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'VTO section not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

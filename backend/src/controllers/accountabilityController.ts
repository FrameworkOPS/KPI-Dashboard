import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

interface AccountabilitySeat {
  id: string;
  seat_name: string;
  seat_description: string | null;
  owner_id: string | null;
  parent_seat_id: string | null;
  responsibilities: unknown[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  children?: AccountabilitySeat[];
}

function buildTree(seats: AccountabilitySeat[]): AccountabilitySeat[] {
  const map: Record<string, AccountabilitySeat> = {};
  const roots: AccountabilitySeat[] = [];

  for (const seat of seats) {
    map[seat.id] = { ...seat, children: [] };
  }

  for (const seat of seats) {
    if (seat.parent_seat_id && map[seat.parent_seat_id]) {
      map[seat.parent_seat_id].children!.push(map[seat.id]);
    } else {
      roots.push(map[seat.id]);
    }
  }

  return roots;
}

export async function getAccountabilityChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT a.*,
         u.first_name AS owner_first_name,
         u.last_name AS owner_last_name,
         u.email AS owner_email
       FROM accountability_seats a
       LEFT JOIN users u ON a.owner_id = u.id
       ORDER BY a.sort_order ASC, a.created_at ASC`
    );

    const tree = buildTree(result.rows);
    res.json(tree);
  } catch (err) {
    next(err);
  }
}

export async function createSeat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { seat_name, seat_description, owner_id, parent_seat_id, responsibilities, sort_order } = req.body;

    if (!seat_name) {
      res.status(400).json({ error: 'seat_name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO accountability_seats
         (seat_name, seat_description, owner_id, parent_seat_id, responsibilities, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        seat_name,
        seat_description || null,
        owner_id || null,
        parent_seat_id || null,
        JSON.stringify(responsibilities || []),
        sort_order ?? 0,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateSeat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { seat_name, seat_description, owner_id, parent_seat_id, responsibilities, sort_order } = req.body;

    const existing = await pool.query('SELECT * FROM accountability_seats WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Accountability seat not found' });
      return;
    }

    // Prevent circular parent references
    if (parent_seat_id === id) {
      res.status(400).json({ error: 'A seat cannot be its own parent' });
      return;
    }

    const result = await pool.query(
      `UPDATE accountability_seats SET
         seat_name = COALESCE($1, seat_name),
         seat_description = COALESCE($2, seat_description),
         owner_id = $3,
         parent_seat_id = $4,
         responsibilities = COALESCE($5, responsibilities),
         sort_order = COALESCE($6, sort_order),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        seat_name || null,
        seat_description !== undefined ? seat_description : null,
        owner_id !== undefined ? owner_id : existing.rows[0].owner_id,
        parent_seat_id !== undefined ? parent_seat_id : existing.rows[0].parent_seat_id,
        responsibilities ? JSON.stringify(responsibilities) : null,
        sort_order !== undefined ? sort_order : null,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteSeat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT * FROM accountability_seats WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Accountability seat not found' });
      return;
    }

    // Re-parent children to the deleted seat's parent
    await pool.query(
      'UPDATE accountability_seats SET parent_seat_id = $1 WHERE parent_seat_id = $2',
      [existing.rows[0].parent_seat_id, id]
    );

    await pool.query('DELETE FROM accountability_seats WHERE id = $1', [id]);
    res.json({ message: 'Accountability seat deleted' });
  } catch (err) {
    next(err);
  }
}

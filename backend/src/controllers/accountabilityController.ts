import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import {
  isStorageConfigured, makeStorageKey,
  uploadObject, getDownloadUrl, deleteObject,
} from '../services/storageService';

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

    // Best-effort: remove S3 objects for any attached documents before
    // ON DELETE CASCADE wipes the rows. Failures here don't block the delete.
    const docs = await pool.query('SELECT storage_key FROM seat_documents WHERE seat_id = $1', [id]);
    for (const d of docs.rows) {
      try { await deleteObject(d.storage_key); } catch { /* ignore — DB row removal still proceeds */ }
    }

    await pool.query('DELETE FROM accountability_seats WHERE id = $1', [id]);
    res.json({ message: 'Accountability seat deleted' });
  } catch (err) {
    next(err);
  }
}

// ── Seat documents ────────────────────────────────────────────────────────────

// List a seat's documents. Each row carries a short-lived presigned download
// URL so the frontend can link straight to the object without proxying.
export async function listSeatDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const docs = await pool.query(
      `SELECT d.id, d.seat_id, d.file_name, d.mime_type, d.file_size, d.storage_key,
              d.uploaded_by, d.created_at,
              u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last
         FROM seat_documents d
         LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.seat_id = $1
        ORDER BY d.created_at DESC`,
      [id],
    );

    const out = [];
    for (const r of docs.rows) {
      let url: string | null = null;
      try {
        url = isStorageConfigured() ? await getDownloadUrl(r.storage_key, 3600) : null;
      } catch { /* presign failed — return row without URL so UI can still show metadata */ }
      out.push({
        id: r.id,
        seat_id: r.seat_id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        file_size: r.file_size !== null ? Number(r.file_size) : null,
        uploaded_by: r.uploaded_by,
        uploaded_by_name: r.uploaded_by_first
          ? `${r.uploaded_by_first} ${r.uploaded_by_last || ''}`.trim()
          : null,
        created_at: r.created_at,
        download_url: url,
      });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
}

export async function uploadSeatDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isStorageConfigured()) {
      res.status(503).json({
        error: 'Object storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY env vars on the server.',
      });
      return;
    }
    const { id: seatId } = req.params;
    const file = (req as unknown as { file?: { originalname: string; mimetype: string; size: number; buffer: Buffer } }).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
      return;
    }
    const seatExists = await pool.query('SELECT id FROM accountability_seats WHERE id = $1', [seatId]);
    if (!seatExists.rows[0]) {
      res.status(404).json({ error: 'Accountability seat not found' });
      return;
    }

    const storageKey = makeStorageKey(`accountability/${seatId}`, file.originalname || 'file');
    await uploadObject(storageKey, file.buffer, file.mimetype || 'application/octet-stream');

    const inserted = await pool.query(
      `INSERT INTO seat_documents (seat_id, file_name, mime_type, file_size, storage_key, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, seat_id, file_name, mime_type, file_size, storage_key, uploaded_by, created_at`,
      [seatId, file.originalname || 'file', file.mimetype || null, file.size, storageKey, req.user?.id || null],
    );

    let download_url: string | null = null;
    try { download_url = await getDownloadUrl(storageKey, 3600); } catch { /* ignore */ }

    const r = inserted.rows[0];
    res.status(201).json({
      id: r.id, seat_id: r.seat_id, file_name: r.file_name,
      mime_type: r.mime_type,
      file_size: r.file_size !== null ? Number(r.file_size) : null,
      uploaded_by: r.uploaded_by, created_at: r.created_at,
      download_url,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteSeatDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { docId } = req.params;
    const existing = await pool.query('SELECT * FROM seat_documents WHERE id = $1', [docId]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    // Try to remove the object; whether or not it succeeds, drop the DB row.
    try { await deleteObject(existing.rows[0].storage_key); } catch { /* ignore */ }
    await pool.query('DELETE FROM seat_documents WHERE id = $1', [docId]);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
}

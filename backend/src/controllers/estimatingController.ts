import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function listProjects(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, name, project_address, gc_name, bid_date, project_type, status, stage, notes, created_at, updated_at
       FROM estimate_projects ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function getProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const proj = await pool.query('SELECT * FROM estimate_projects WHERE id=$1', [id]);
    if (!proj.rows[0]) { res.status(404).json({ error: 'Project not found' }); return; }

    const [docs, specs, lineItems, concerns, takeoffs] = await Promise.all([
      pool.query('SELECT id, file_name, doc_type, parsed, parsed_at, created_at FROM estimate_documents WHERE project_id=$1 ORDER BY created_at', [id]),
      pool.query('SELECT * FROM estimate_specs WHERE project_id=$1 ORDER BY created_at', [id]),
      pool.query('SELECT * FROM estimate_line_items WHERE project_id=$1 ORDER BY sort_order, created_at', [id]),
      pool.query('SELECT * FROM estimate_concerns WHERE project_id=$1 ORDER BY created_at', [id]),
      pool.query('SELECT * FROM estimate_takeoffs WHERE project_id=$1 ORDER BY sort_order, created_at', [id]),
    ]);

    res.json({
      success: true,
      data: {
        ...proj.rows[0],
        documents: docs.rows,
        specs: specs.rows,
        line_items: lineItems.rows.map((r: any) => ({
          ...r,
          quantity: r.quantity ? parseFloat(r.quantity) : null,
          unit_price: r.unit_price ? parseFloat(r.unit_price) : null,
          line_total: r.quantity && r.unit_price ? parseFloat(r.quantity) * parseFloat(r.unit_price) : 0,
        })),
        concerns: concerns.rows,
        takeoffs: takeoffs.rows,
      },
    });
  } catch (err) { next(err); }
}

export async function createProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, project_address, gc_name, bid_date, project_type = 'roofing', notes } = req.body;
    if (!name) { res.status(400).json({ error: 'Project name is required' }); return; }
    const result = await pool.query(
      `INSERT INTO estimate_projects (name, project_address, gc_name, bid_date, project_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, project_address || null, gc_name || null, bid_date || null, project_type, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function updateProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { name, project_address, gc_name, bid_date, project_type, status, stage, notes } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (name !== undefined)            { updates.push(`name=$${p++}`);            params.push(name); }
    if (project_address !== undefined) { updates.push(`project_address=$${p++}`); params.push(project_address); }
    if (gc_name !== undefined)         { updates.push(`gc_name=$${p++}`);         params.push(gc_name); }
    if (bid_date !== undefined)        { updates.push(`bid_date=$${p++}`);        params.push(bid_date || null); }
    if (project_type !== undefined)    { updates.push(`project_type=$${p++}`);    params.push(project_type); }
    if (status !== undefined)          { updates.push(`status=$${p++}`);          params.push(status); }
    if (stage !== undefined)           { updates.push(`stage=$${p++}`);           params.push(stage); }
    if (notes !== undefined)           { updates.push(`notes=$${p++}`);           params.push(notes); }
    if (!updates.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    updates.push('updated_at=NOW()');
    params.push(id);
    const result = await pool.query(
      `UPDATE estimate_projects SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function deleteProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM estimate_projects WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function addLineItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { category, description, quantity, unit, unit_price, waste_factor = 0, notes, sort_order = 0, material_key } = req.body;
    if (!description) { res.status(400).json({ error: 'Description is required' }); return; }
    const result = await pool.query(
      `INSERT INTO estimate_line_items (project_id, category, description, quantity, unit, unit_price, waste_factor, notes, sort_order, material_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, category || null, description, quantity || null, unit || null, unit_price || null, waste_factor, notes || null, sort_order, material_key || null]
    );
    const r = result.rows[0];
    res.status(201).json({ success: true, data: { ...r, line_total: (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0) } });
  } catch (err) { next(err); }
}

export async function updateLineItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemId } = req.params;
    const { category, description, quantity, unit, unit_price, waste_factor, notes, sort_order, material_key } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (category !== undefined)     { updates.push(`category=$${p++}`);     params.push(category); }
    if (description !== undefined)  { updates.push(`description=$${p++}`);  params.push(description); }
    if (quantity !== undefined)     { updates.push(`quantity=$${p++}`);     params.push(quantity); }
    if (unit !== undefined)         { updates.push(`unit=$${p++}`);         params.push(unit); }
    if (unit_price !== undefined)   { updates.push(`unit_price=$${p++}`);   params.push(unit_price); }
    if (waste_factor !== undefined) { updates.push(`waste_factor=$${p++}`); params.push(waste_factor); }
    if (notes !== undefined)        { updates.push(`notes=$${p++}`);        params.push(notes); }
    if (sort_order !== undefined)   { updates.push(`sort_order=$${p++}`);   params.push(sort_order); }
    if (material_key !== undefined) { updates.push(`material_key=$${p++}`); params.push(material_key); }
    if (!updates.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    params.push(itemId);
    const result = await pool.query(
      `UPDATE estimate_line_items SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Line item not found' }); return; }
    const r = result.rows[0];
    res.json({ success: true, data: { ...r, line_total: (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0) } });
  } catch (err) { next(err); }
}

export async function deleteLineItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM estimate_line_items WHERE id=$1 RETURNING id', [req.params.itemId]);
    if (!result.rows[0]) { res.status(404).json({ error: 'Line item not found' }); return; }
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function getMaterialPrices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM material_prices ORDER BY category, description');
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function upsertMaterialPrice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { material_key, category, description, unit, unit_cost, vendor, notes } = req.body;
    if (!material_key || !category || !description || !unit || unit_cost === undefined) {
      res.status(400).json({ error: 'Missing required fields' }); return;
    }
    const result = await pool.query(
      `INSERT INTO material_prices (material_key, category, description, unit, unit_cost, vendor, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (material_key) DO UPDATE SET category=$2, description=$3, unit=$4, unit_cost=$5, vendor=$6, notes=$7, last_updated=NOW()
       RETURNING *`,
      [material_key, category, description, unit, unit_cost, vendor || null, notes || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function uploadEstimateDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const result = await pool.query(
      `INSERT INTO estimate_documents (project_id, file_name, file_path, doc_type, file_bytes)
       VALUES ($1,$2,'',$3,$4) RETURNING id, file_name, doc_type, created_at`,
      [id, req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function deleteEstimateDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM estimate_documents WHERE id=$1 RETURNING id', [req.params.docId]);
    if (!result.rows[0]) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json({ success: true });
  } catch (err) { next(err); }
}

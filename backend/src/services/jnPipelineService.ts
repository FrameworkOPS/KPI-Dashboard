import { query } from '../config/database';

// Defaults — overridable via app_settings keys
const DEFAULTS = {
  material_field_key: 'material_type',   // raw->>material_type (case-insensitive scan)
  closing_rate: 0.35,
  avg_sqs_per_contract: 30,
};

export interface ForecasterSettings {
  material_field_key: string;
  closing_rate: number;
  avg_sqs_per_contract: number;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const r = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return r.rows[0]?.value ?? null;
  } catch { return null; }
}

async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}

export async function getForecasterSettings(): Promise<ForecasterSettings> {
  const [field, rate, avg] = await Promise.all([
    getSetting('forecaster_jn_material_field'),
    getSetting('forecaster_closing_rate'),
    getSetting('forecaster_avg_sqs_per_contract'),
  ]);
  return {
    material_field_key: field || DEFAULTS.material_field_key,
    closing_rate: rate ? Number(rate) : DEFAULTS.closing_rate,
    avg_sqs_per_contract: avg ? Number(avg) : DEFAULTS.avg_sqs_per_contract,
  };
}

export async function updateForecasterSettings(patch: Partial<ForecasterSettings>): Promise<ForecasterSettings> {
  if (patch.material_field_key !== undefined) {
    await setSetting('forecaster_jn_material_field', String(patch.material_field_key));
  }
  if (patch.closing_rate !== undefined) {
    const v = Number(patch.closing_rate);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('closing_rate must be between 0 and 1');
    await setSetting('forecaster_closing_rate', String(v));
  }
  if (patch.avg_sqs_per_contract !== undefined) {
    const v = Number(patch.avg_sqs_per_contract);
    if (!Number.isFinite(v) || v <= 0) throw new Error('avg_sqs_per_contract must be > 0');
    await setSetting('forecaster_avg_sqs_per_contract', String(v));
  }
  return getForecasterSettings();
}

// Material classifier: consult the configured custom-field key on the raw payload first;
// fall back to a heuristic on record_type_name + name. Returns 'shingle' | 'metal' | null.
function classifyMaterial(raw: any, recordType: string | null, name: string | null, fieldKey: string): 'shingle' | 'metal' | null {
  const fromField = raw && fieldKey ? raw[fieldKey] : null;
  const candidates: string[] = [];
  if (fromField) candidates.push(String(fromField));
  if (recordType) candidates.push(recordType);
  if (name) candidates.push(name);
  const blob = candidates.join(' ').toLowerCase();
  if (!blob.trim()) return null;
  if (/\b(metal|standing\s*seam|steel|aluminum|copper)\b/.test(blob)) return 'metal';
  if (/\b(shingle|asphalt|composit|tpo|architectural)\b/.test(blob)) return 'shingle';
  return null; // unknown — caller decides whether to default to shingle
}

export interface JnPipelineBucket {
  contracts_sent: number;
  work_orders: number;
  weighted_contract_sqs: number; // sum over contracts of avg_sqs × per-rep (or global) close_rate
  work_order_sqs: number;        // work_orders × avg_sqs (already-signed, no weighting)
  total_sqs: number;             // weighted_contract_sqs + work_order_sqs
  effective_close_rate: number;  // contracts_sent > 0 ? weighted_contract_sqs / (contracts_sent × avg_sqs) : global
}

// ── Per-sales-rep close rate overrides ────────────────────────────────────────

export interface SalesRepCloseRate {
  sales_rep_name: string;
  close_rate: number;
  notes: string | null;
  updated_at?: string;
}

export async function listSalesRepCloseRates(): Promise<SalesRepCloseRate[]> {
  const r = await query(`SELECT sales_rep_name, close_rate, notes, updated_at
                         FROM sales_rep_close_rates ORDER BY sales_rep_name`);
  return r.rows.map((row: any) => ({
    sales_rep_name: row.sales_rep_name,
    close_rate: Number(row.close_rate),
    notes: row.notes,
    updated_at: row.updated_at,
  }));
}

export async function upsertSalesRepCloseRate(repName: string, closeRate: number, notes?: string | null, userId?: string | null): Promise<SalesRepCloseRate> {
  const name = String(repName || '').trim();
  if (!name) throw new Error('sales_rep_name is required');
  const v = Number(closeRate);
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('close_rate must be between 0 and 1');
  await query(
    `INSERT INTO sales_rep_close_rates (sales_rep_name, close_rate, notes, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (sales_rep_name) DO UPDATE
       SET close_rate = EXCLUDED.close_rate, notes = EXCLUDED.notes, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [name, v, notes ?? null, userId ?? null],
  );
  const r = await query('SELECT sales_rep_name, close_rate, notes, updated_at FROM sales_rep_close_rates WHERE sales_rep_name = $1', [name]);
  return { sales_rep_name: r.rows[0].sales_rep_name, close_rate: Number(r.rows[0].close_rate), notes: r.rows[0].notes, updated_at: r.rows[0].updated_at };
}

export async function deleteSalesRepCloseRate(repName: string): Promise<boolean> {
  const r = await query('DELETE FROM sales_rep_close_rates WHERE sales_rep_name = $1 RETURNING sales_rep_name', [repName]);
  return r.rows.length > 0;
}

async function getRepRateMap(): Promise<Record<string, number>> {
  const rates = await listSalesRepCloseRates();
  const map: Record<string, number> = {};
  for (const r of rates) map[r.sales_rep_name.toLowerCase()] = r.close_rate;
  return map;
}

export interface JnPipelineSummary {
  shingle: JnPipelineBucket;
  metal:   JnPipelineBucket;
  unknown: JnPipelineBucket;
  settings: ForecasterSettings;
  generated_at: string;
}

/**
 * Pull live pipeline numbers from jobnimbus_jobs:
 *  - "Contracts sent" = open jobs (status_type=2) with contract_sent=true.
 *    Weighted by closing_rate × avg_sqs_per_contract.
 *  - "Work orders" = signed jobs (status_type=4) where invoice_value IS NULL.
 *    Counted at full avg_sqs (already-signed work in the production queue).
 */
export async function getJnPipelineSummary(): Promise<JnPipelineSummary> {
  const settings = await getForecasterSettings();
  const repRates = await getRepRateMap();
  const buckets: Record<'shingle' | 'metal' | 'unknown', JnPipelineBucket> = {
    shingle: emptyBucket(settings.closing_rate),
    metal:   emptyBucket(settings.closing_rate),
    unknown: emptyBucket(settings.closing_rate),
  };

  // Pull contracts + work orders in one query. Apply per-rep close rate to contracts.
  const result = await query(
    `SELECT
       jnid, name, record_type_name, raw, sales_rep_name,
       CASE
         WHEN contract_sent = true AND status_type = 2 THEN 'contract'
         WHEN status_type = 4 AND invoice_value IS NULL THEN 'work_order'
         ELSE NULL
       END AS bucket
     FROM jobnimbus_jobs
     WHERE (contract_sent = true AND status_type = 2)
        OR (status_type = 4 AND invoice_value IS NULL)`
  );

  for (const row of result.rows) {
    if (!row.bucket) continue;
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : null;
    const material = classifyMaterial(raw, row.record_type_name, row.name, settings.material_field_key);
    const key: 'shingle' | 'metal' | 'unknown' = material || 'unknown';
    if (row.bucket === 'contract') {
      buckets[key].contracts_sent += 1;
      const repKey = String(row.sales_rep_name || '').toLowerCase();
      const rate = repRates[repKey] ?? settings.closing_rate;
      buckets[key].weighted_contract_sqs += settings.avg_sqs_per_contract * rate;
    } else {
      buckets[key].work_orders += 1;
    }
  }

  for (const k of ['shingle', 'metal', 'unknown'] as const) {
    const b = buckets[k];
    b.work_order_sqs        = b.work_orders * settings.avg_sqs_per_contract;
    b.total_sqs             = b.weighted_contract_sqs + b.work_order_sqs;
    b.effective_close_rate  = b.contracts_sent > 0
      ? b.weighted_contract_sqs / (b.contracts_sent * settings.avg_sqs_per_contract)
      : settings.closing_rate;
  }

  return {
    ...buckets,
    settings,
    generated_at: new Date().toISOString(),
  };
}

function emptyBucket(defaultRate: number): JnPipelineBucket {
  return {
    contracts_sent: 0, work_orders: 0,
    weighted_contract_sqs: 0, work_order_sqs: 0, total_sqs: 0,
    effective_close_rate: defaultRate,
  };
}

/** Helper for forecast/metrics controllers — returns { shingle, metal } combined totals
 *  in SQs (weighted_contract_sqs + work_order_sqs). Unknown material is split 50/50
 *  to avoid silently dropping pipeline. */
export async function getJnPipelineSqsByType(): Promise<{ shingle: number; metal: number }> {
  const s = await getJnPipelineSummary();
  const half = s.unknown.total_sqs / 2;
  return {
    shingle: s.shingle.total_sqs + half,
    metal:   s.metal.total_sqs + half,
  };
}

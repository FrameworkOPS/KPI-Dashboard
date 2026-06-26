import { query } from '../config/database';
import { JOB_MATERIAL_FIELD_CANDIDATES, WORK_ORDER_SQS_FIELD_CANDIDATES } from './jobNimbusSchemaContext';

// Defaults — overridable via app_settings keys
const DEFAULTS = {
  material_field_key: JOB_MATERIAL_FIELD_CANDIDATES[0],  // JobNimbus custom field indicating shingle/metal/gutter
  closing_rate: 0.35,
  avg_sqs_per_contract: 30,
};

const REVENUE_PER_SQ = {
  shingle: 600,
  metal: 1000,
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
// fall back to a heuristic on record_type_name + name.
function classifyMaterial(raw: any, recordType: string | null, name: string | null, fieldKey: string): 'shingle' | 'metal' | 'gutter' | null {
  const candidates: string[] = [];
  const fieldKeys = Array.from(new Set([fieldKey, ...JOB_MATERIAL_FIELD_CANDIDATES])).filter(Boolean);
  for (const key of fieldKeys) {
    const fromField = raw && key ? raw[key] : null;
    if (fromField) candidates.push(String(fromField));
  }
  if (recordType) candidates.push(recordType);
  if (name) candidates.push(name);
  const blob = candidates.join(' ').toLowerCase();
  if (!blob.trim()) return null;
  if (/\b(gutter|gutters|downspout|downspouts|leaf\s*guard)\b/.test(blob)) return 'gutter';
  if (/\b(metal|standing\s*seam|steel|aluminum|copper)\b/.test(blob)) return 'metal';
  if (/\b(shingle|asphalt|composit|tpo|architectural)\b/.test(blob)) return 'shingle';
  return null; // unknown — caller decides whether to default to shingle
}

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseSqsValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isSqsFieldName(fieldName: string): boolean {
  const normalized = normalizeFieldName(fieldName);
  return [
    ...WORK_ORDER_SQS_FIELD_CANDIDATES.map(normalizeFieldName),
    'ofsqs',
    'sqs',
    'sq',
    'numberofsqs',
    'numberofsq',
    'sqcount',
    'squarecount',
    'squares',
    'totalsqs',
    'totalsquares',
    'workorderofsqs',
    'workordernumberofsqs',
    'workordersqs',
    'workordersquares',
  ].includes(normalized);
}

function extractWorkOrderSqs(raw: unknown): number | null {
  const seen = new Set<unknown>();

  const visit = (value: unknown): number | null => {
    if (!value || typeof value !== 'object') return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found !== null) return found;
      }
      return null;
    }

    const obj = value as Record<string, unknown>;
    const label = obj.name ?? obj.label ?? obj.field_name ?? obj.fieldName ?? obj.title ?? obj.key;
    if (typeof label === 'string' && isSqsFieldName(label)) {
      const direct = parseSqsValue(obj.value ?? obj.display_value ?? obj.displayValue ?? obj.text ?? obj.answer);
      if (direct !== null) return direct;
    }

    for (const [key, child] of Object.entries(obj)) {
      if (isSqsFieldName(key)) {
        const direct = parseSqsValue(child);
        if (direct !== null) return direct;
      }
    }

    for (const child of Object.values(obj)) {
      const found = visit(child);
      if (found !== null) return found;
    }
    return null;
  };

  return visit(raw);
}

export interface JnPipelineBucket {
  job_count: number;
  contracts_sent: number;
  work_orders: number;
  work_orders_missing_sqs: number;
  weighted_contract_sqs: number; // sum over contracts of avg_sqs × per-rep (or global) close_rate
  work_order_sqs: number;        // sum of actual Work Order "# of sqs" fields
  total_sqs: number;             // weighted_contract_sqs + work_order_sqs
  forecast_revenue: number;      // total_sqs × configured material revenue rate when available
  estimate_value: number;        // raw JobNimbus estimate value for the jobs in this bucket
  effective_close_rate: number;  // contracts_sent > 0 ? weighted_contract_sqs / (contracts_sent × avg_sqs) : global
}

export interface JnPipelineRepSummary {
  sales_rep_name: string;
  job_count: number;
  contracts_sent: number;
  work_orders: number;
  work_orders_missing_sqs: number;
  weighted_contract_sqs: number;
  work_order_sqs: number;
  total_sqs: number;
  forecast_revenue: number;
  estimate_value: number;
}

export interface JnPipelineJobLink {
  jnid: string;
  name: string | null;
  sales_rep_name: string | null;
  material: 'shingle' | 'metal' | 'gutter' | 'unknown';
  bucket: 'contract' | 'work_order';
  weighted_sqs: number;
  sqs_source: 'avg_contract' | 'work_order_field' | 'missing_work_order_field';
  forecast_revenue: number;
  estimate_value: number;
  url: string;
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
  gutter:  JnPipelineBucket;
  unknown: JnPipelineBucket;
  totals:  JnPipelineBucket;
  by_rep: JnPipelineRepSummary[];
  jobs: JnPipelineJobLink[];
  settings: ForecasterSettings;
  generated_at: string;
}

/**
 * Pull live pipeline numbers from jobnimbus_jobs:
 *  - "Contracts sent" = open jobs (status_type=2) with contract_sent=true.
 *    Weighted by closing_rate × avg_sqs_per_contract.
 *  - "Work orders" = signed jobs (status_type=4) where invoice_value IS NULL.
 *    Counted from the JobNimbus Work Order "# of sqs" field, which is the
 *    source of truth once the job has a work order.
 */
export async function getJnPipelineSummary(): Promise<JnPipelineSummary> {
  const settings = await getForecasterSettings();
  const repRates = await getRepRateMap();
  const buckets: Record<'shingle' | 'metal' | 'gutter' | 'unknown', JnPipelineBucket> = {
    shingle: emptyBucket(settings.closing_rate),
    metal:   emptyBucket(settings.closing_rate),
    gutter:  emptyBucket(settings.closing_rate),
    unknown: emptyBucket(settings.closing_rate),
  };
  const reps: Record<string, JnPipelineRepSummary> = {};
  const jobs: JnPipelineJobLink[] = [];

  // Pull contracts + work orders in one query. Apply per-rep close rate to contracts.
  const result = await query(
    `SELECT
       jnid, name, record_type_name, raw, sales_rep_name, estimate_value,
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
    const key: 'shingle' | 'metal' | 'gutter' | 'unknown' = material || 'unknown';
    const repName = String(row.sales_rep_name || '').trim() || 'Unassigned';
    if (!reps[repName]) reps[repName] = emptyRep(repName);
    const estimateValue = Number(row.estimate_value || 0);
    let weightedSqs = 0;
    let sqsSource: JnPipelineJobLink['sqs_source'] = 'avg_contract';
    if (row.bucket === 'contract') {
      buckets[key].contracts_sent += 1;
      reps[repName].contracts_sent += 1;
      const repKey = repName.toLowerCase();
      const rate = repRates[repKey] ?? settings.closing_rate;
      weightedSqs = settings.avg_sqs_per_contract * rate;
      buckets[key].weighted_contract_sqs += weightedSqs;
      reps[repName].weighted_contract_sqs += weightedSqs;
    } else {
      buckets[key].work_orders += 1;
      reps[repName].work_orders += 1;
      const workOrderSqs = extractWorkOrderSqs(raw);
      if (workOrderSqs === null) {
        buckets[key].work_orders_missing_sqs += 1;
        reps[repName].work_orders_missing_sqs += 1;
        weightedSqs = 0;
        sqsSource = 'missing_work_order_field';
      } else {
        weightedSqs = workOrderSqs;
        buckets[key].work_order_sqs += weightedSqs;
        reps[repName].work_order_sqs += weightedSqs;
        sqsSource = 'work_order_field';
      }
    }
    buckets[key].job_count += 1;
    buckets[key].estimate_value += estimateValue;
    reps[repName].job_count += 1;
    reps[repName].estimate_value += estimateValue;
    jobs.push({
      jnid: row.jnid,
      name: row.name,
      sales_rep_name: repName,
      material: key,
      bucket: row.bucket,
      weighted_sqs: weightedSqs,
      sqs_source: sqsSource,
      forecast_revenue: forecastRevenue(key, weightedSqs),
      estimate_value: estimateValue,
      url: `https://app.jobnimbus.com/job/${row.jnid}`,
    });
  }

  for (const k of ['shingle', 'metal', 'gutter', 'unknown'] as const) {
    const b = buckets[k];
    b.total_sqs             = b.weighted_contract_sqs + b.work_order_sqs;
    b.forecast_revenue      = forecastRevenue(k, b.total_sqs);
    b.effective_close_rate  = b.contracts_sent > 0
      ? b.weighted_contract_sqs / (b.contracts_sent * settings.avg_sqs_per_contract)
      : settings.closing_rate;
  }

  for (const rep of Object.values(reps)) {
    rep.total_sqs = rep.weighted_contract_sqs + rep.work_order_sqs;
    const repJobs = jobs.filter((j) => j.sales_rep_name === rep.sales_rep_name);
    rep.forecast_revenue = repJobs.reduce((sum, job) => sum + job.forecast_revenue, 0);
  }

  const by_rep = Object.values(reps)
    .sort((a, b) => b.forecast_revenue - a.forecast_revenue || b.total_sqs - a.total_sqs || a.sales_rep_name.localeCompare(b.sales_rep_name));
  const totals = (['shingle', 'metal', 'gutter', 'unknown'] as const)
    .reduce((acc, key) => addBuckets(acc, buckets[key]), emptyBucket(settings.closing_rate));

  return {
    ...buckets,
    totals,
    by_rep,
    jobs: jobs.sort((a, b) => b.forecast_revenue - a.forecast_revenue).slice(0, 12),
    settings,
    generated_at: new Date().toISOString(),
  };
}

function emptyBucket(defaultRate: number): JnPipelineBucket {
  return {
    job_count: 0, contracts_sent: 0, work_orders: 0, work_orders_missing_sqs: 0,
    weighted_contract_sqs: 0, work_order_sqs: 0, total_sqs: 0,
    forecast_revenue: 0, estimate_value: 0,
    effective_close_rate: defaultRate,
  };
}

function emptyRep(salesRepName: string): JnPipelineRepSummary {
  return {
    sales_rep_name: salesRepName,
    job_count: 0,
    contracts_sent: 0,
    work_orders: 0,
    work_orders_missing_sqs: 0,
    weighted_contract_sqs: 0,
    work_order_sqs: 0,
    total_sqs: 0,
    forecast_revenue: 0,
    estimate_value: 0,
  };
}

function forecastRevenue(material: 'shingle' | 'metal' | 'gutter' | 'unknown', sqs: number): number {
  if (material === 'shingle') return sqs * REVENUE_PER_SQ.shingle;
  if (material === 'metal') return sqs * REVENUE_PER_SQ.metal;
  return 0;
}

function addBuckets(a: JnPipelineBucket, b: JnPipelineBucket): JnPipelineBucket {
  return {
    job_count: a.job_count + b.job_count,
    contracts_sent: a.contracts_sent + b.contracts_sent,
    work_orders: a.work_orders + b.work_orders,
    work_orders_missing_sqs: a.work_orders_missing_sqs + b.work_orders_missing_sqs,
    weighted_contract_sqs: a.weighted_contract_sqs + b.weighted_contract_sqs,
    work_order_sqs: a.work_order_sqs + b.work_order_sqs,
    total_sqs: a.total_sqs + b.total_sqs,
    forecast_revenue: a.forecast_revenue + b.forecast_revenue,
    estimate_value: a.estimate_value + b.estimate_value,
    effective_close_rate: a.effective_close_rate,
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

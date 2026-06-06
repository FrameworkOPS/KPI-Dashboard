import crypto from 'crypto';
import axios from 'axios';
import { query } from '../config/database';

// ── Webhook token management ──────────────────────────────────────────────────

export async function getOrCreateWebhookToken(): Promise<string> {
  try {
    const result = await query("SELECT value FROM app_settings WHERE key = 'jobnimbus_webhook_token'");
    if (result.rows[0]?.value) return result.rows[0].value;
  } catch {
    // table may not exist yet during first boot
  }
  const token = crypto.randomBytes(24).toString('hex');
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('jobnimbus_webhook_token', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [token],
  );
  return token;
}

export async function getWebhookToken(): Promise<string | null> {
  try {
    const result = await query("SELECT value FROM app_settings WHERE key = 'jobnimbus_webhook_token'");
    return result.rows[0]?.value || null;
  } catch {
    return null;
  }
}

export async function regenerateWebhookToken(): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex');
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('jobnimbus_webhook_token', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [token],
  );
  return token;
}

export async function removeWebhookToken(): Promise<void> {
  await query("DELETE FROM app_settings WHERE key = 'jobnimbus_webhook_token'");
  await query('DELETE FROM jobnimbus_jobs');
}

// Configured when a JobNimbus API key is present (direct-API model).
export async function isJobNimbusConfigured(): Promise<boolean> {
  return !!process.env.JOBNIMBUS_API_KEY;
}

// ── Incoming webhook data ─────────────────────────────────────────────────────

interface ZapierJobPayload {
  id?: string;
  jnid?: string;
  number?: string;
  name?: string;
  status?: string;
  status_type?: number | string;
  value?: number | string | null;
  date_created?: number | string;
  date_updated?: number | string;
  [key: string]: unknown;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const stripped = typeof v === 'string' ? v.replace(/[$,\s]/g, '') : v;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: unknown): number | null {
  const n = toNumOrNull(v);
  return n === null ? null : Math.trunc(n);
}

function toDateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  // numeric → unix timestamp in seconds; string → try ISO/date parsing first
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v.trim()))) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const d = new Date(n * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Derive a JobNimbus-style status_type from the human-readable status name.
// 4 = Won/Complete, 5 = Lost/Cancelled, 2 = Open (everything else with a status)
function deriveStatusType(status: string | null | undefined): number | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (/(lost|dead|cancel|reject|declin|abandon)/.test(s)) return 5;
  if (/(complet|won|sold|installed|finished|paid in full|job done|closed.?won)/.test(s)) return 4;
  return 2;
}

export async function upsertJobFromWebhook(payload: ZapierJobPayload): Promise<void> {
  const jnid = String(payload.id || payload.jnid || '').trim();
  if (!jnid) throw new Error('Job payload missing id field');

  const statusName = payload.status ? String(payload.status) : null;
  let statusType = toIntOrNull(payload.status_type);
  if (statusType === null) statusType = deriveStatusType(statusName);
  const value = toNumOrNull(payload.value);
  const dateCreated = toDateOrNull(payload.date_created);
  const dateUpdated = toDateOrNull(payload.date_updated);

  await query(
    `INSERT INTO jobnimbus_jobs (jnid, name, status, status_type, value, date_created, date_updated, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (jnid) DO UPDATE SET
       name         = EXCLUDED.name,
       status       = EXCLUDED.status,
       status_type  = EXCLUDED.status_type,
       value        = EXCLUDED.value,
       date_created = EXCLUDED.date_created,
       date_updated = EXCLUDED.date_updated,
       raw          = EXCLUDED.raw,
       updated_at   = NOW()`,
    [
      jnid,
      payload.name ? String(payload.name) : null,
      payload.status ? String(payload.status) : null,
      statusType,
      value,
      dateCreated,
      dateUpdated,
      JSON.stringify(payload),
    ],
  );
}

// ── Direct JobNimbus API ingestion (replaces the Zapier push) ──────────────────
//
// We pull Jobs straight from the JobNimbus REST API (api1) using an API key as a
// Bearer token, and upsert them into the same `jobnimbus_jobs` table the
// summary/analytics queries already read from. The full job object is stored in
// `raw`, so the existing COALESCE(raw->>'sales_rep_name' / 'source_name' /
// 'record_type_name') logic keeps working unchanged.
//
//   JOBNIMBUS_API_KEY            — required, API key from JobNimbus → Settings → API
//   JOBNIMBUS_API_BASE           — optional, defaults to https://app.jobnimbus.com/api1
//   JOBNIMBUS_SYNC_INTERVAL_MIN  — optional, auto-sync cadence in minutes (default 15)

const JN_API_BASE = process.env.JOBNIMBUS_API_BASE || 'https://app.jobnimbus.com/api1';

async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return result.rows[0]?.value || null;
  } catch {
    return null;
  }
}

// First strictly-positive number among the candidates (treats 0 / null / '' as absent).
function pickPositive(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = toNumOrNull(v);
    if (n !== null && n > 0) return n;
  }
  return null;
}

// JobNimbus epoch-seconds → Date, treating 0 / negative as "no date".
function toEpochDateOrNull(v: unknown): Date | null {
  const n = toNumOrNull(v);
  if (n === null || n <= 0) return null;
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d;
}

function estimateValue(job: Record<string, any>): number | null {
  return pickPositive(job.approved_estimate_total, job.last_estimate);
}

function invoiceValue(job: Record<string, any>): number | null {
  return pickPositive(job.approved_invoice_total, job.last_invoice);
}

// Classify a JobNimbus job into the status_type used across the dashboard:
//   1 = Lead (filtered out of analytics), 2 = Open pipeline, 4 = Won (signed), 5 = Lost
// "Signed estimate is Won" → an approved estimate/invoice, or a status past signing.
// Note "Contract Sent" has no "signed" token, so it correctly stays Open.
function classifyJob(job: Record<string, any>): { statusType: number; isLead: boolean } {
  const s = String(job.status_name || job.status || '').toLowerCase();
  // A signed/approved ESTIMATE means the deal is won. NOTE: an approved *invoice*
  // is NOT used here — in this account ~270 jobs still tagged "Lead" carry an old
  // invoice, so invoice presence would massively over-count wins. Billing is tracked
  // separately via invoice_value / billed_date regardless of status.
  const estApproved = (toNumOrNull(job.approved_estimate_total) || 0) > 0;

  if (/(lost|dead|cancel|reject|declin|abandon)/.test(s)) return { statusType: 5, isLead: false };
  if (estApproved || /(signed|sold|won|installed|complete|finished|paid|production)/.test(s)) {
    return { statusType: 4, isLead: false };
  }
  if (s === 'lead' || s === '') return { statusType: 1, isLead: true };
  return { statusType: 2, isLead: false };
}

/** Upsert a single job pulled from the JobNimbus API into jobnimbus_jobs. */
export async function upsertJobFromApi(job: Record<string, any>): Promise<void> {
  const jnid = String(job.jnid || job.id || '').trim();
  if (!jnid) return;

  const name = job.name || job.display_name || null;
  const statusName = job.status_name ? String(job.status_name) : (job.status ? String(job.status) : null);
  const { statusType, isLead } = classifyJob(job);

  const estValue = estimateValue(job);
  const invValue = invoiceValue(job);
  const dateCreated = toDateOrNull(job.date_created);
  const dateUpdated = toEpochDateOrNull(job.date_updated) ?? toEpochDateOrNull(job.date_status_change) ?? dateCreated;

  // When the deal was signed (won) and when it was billed (invoiced).
  const signedDate = statusType === 4
    ? (toEpochDateOrNull(job.last_estimate_date_estimate) ?? toEpochDateOrNull(job.date_status_change) ?? dateUpdated)
    : null;
  const billedDate = invValue !== null ? toEpochDateOrNull(job.last_invoice_date_invoice) : null;

  // "Contract sent" = an estimate/contract/proposal exists for the job. Won jobs
  // always count as a contract sent (numerator ⊆ denominator). Leads excluded.
  const hasEstimate = (toNumOrNull(job.last_estimate) || 0) > 0
    || (toNumOrNull(job.approved_estimate_total) || 0) > 0
    || (toNumOrNull(job.last_estimate_date_estimate) || 0) > 0
    || !!job.last_estimate_number;
  const contractSent = statusType === 4 || (hasEstimate && statusType !== 1);
  const contractSentDate = contractSent
    ? (toEpochDateOrNull(job.last_estimate_date_estimate) ?? signedDate ?? dateCreated)
    : null;

  const salesRep = job.sales_rep_name ? String(job.sales_rep_name) : null;
  const source = job.source_name ? String(job.source_name) : null;
  const recordType = job.record_type_name ? String(job.record_type_name) : null;

  await query(
    `INSERT INTO jobnimbus_jobs
       (jnid, name, status, status_type, value, date_created, date_updated, raw,
        is_lead, sales_rep_name, source_name, record_type_name, estimate_value, invoice_value, signed_date, billed_date,
        contract_sent, contract_sent_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (jnid) DO UPDATE SET
       name               = EXCLUDED.name,
       status             = EXCLUDED.status,
       status_type        = EXCLUDED.status_type,
       value              = EXCLUDED.value,
       date_created       = EXCLUDED.date_created,
       date_updated       = EXCLUDED.date_updated,
       raw                = EXCLUDED.raw,
       is_lead            = EXCLUDED.is_lead,
       sales_rep_name     = EXCLUDED.sales_rep_name,
       source_name        = EXCLUDED.source_name,
       record_type_name   = EXCLUDED.record_type_name,
       estimate_value     = EXCLUDED.estimate_value,
       invoice_value      = EXCLUDED.invoice_value,
       signed_date        = EXCLUDED.signed_date,
       billed_date        = EXCLUDED.billed_date,
       contract_sent      = EXCLUDED.contract_sent,
       contract_sent_date = EXCLUDED.contract_sent_date,
       updated_at         = NOW()`,
    [
      jnid, name ? String(name) : null, statusName, statusType, estValue,
      dateCreated, dateUpdated, JSON.stringify(job),
      isLead, salesRep, source, recordType, estValue, invValue, signedDate, billedDate,
      contractSent, contractSentDate,
    ],
  );
}

/**
 * Fetch all Jobs from JobNimbus, paginating until exhausted. JobNimbus returns
 * { count, results } and accepts `from` / `size` query params. `complete` is
 * false when we hit the page-count safety cap before exhausting results — in
 * that case callers must NOT treat the returned set as authoritative.
 */
export async function fetchAllJobsFromApi(): Promise<{ jobs: Record<string, any>[]; complete: boolean }> {
  const apiKey = process.env.JOBNIMBUS_API_KEY;
  if (!apiKey) throw new Error('JOBNIMBUS_API_KEY is not set');

  const client = axios.create({
    baseURL: JN_API_BASE,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const all: Record<string, any>[] = [];
  const size = 100;
  const maxPages = 100;
  let from = 0;
  let complete = false;
  for (let page = 0; page < maxPages; page++) {
    const resp = await client.get('/jobs', { params: { from, size } });
    const results: Record<string, any>[] = resp.data?.results || [];
    all.push(...results);
    if (results.length < size) { complete = true; break; }
    from += size;
  }
  return { jobs: all, complete };
}

let _syncing = false;

/** Pull every job from the JobNimbus API and upsert into the local table. */
export async function syncJobNimbus(): Promise<{ fetched: number; saved: number; errors: number; deleted: number; skipped?: boolean }> {
  if (_syncing) return { fetched: 0, saved: 0, errors: 0, deleted: 0, skipped: true };
  _syncing = true;
  try {
    const { jobs, complete } = await fetchAllJobsFromApi();
    let saved = 0;
    let errors = 0;
    const seenIds: string[] = [];
    for (const job of jobs) {
      try {
        await upsertJobFromApi(job);
        const jnid = String(job.jnid || job.id || '').trim();
        if (jnid) seenIds.push(jnid);
        saved++;
      } catch (err) {
        errors++;
        console.error('[jobnimbus] upsert failed:', (err as Error).message);
      }
    }

    // Reconcile deletions: drop any local rows whose jnid wasn't returned by
    // JobNimbus. Only safe to do when the fetch completed cleanly AND we had
    // zero upsert errors — otherwise we might delete rows that simply weren't
    // re-pulled this cycle. (A jnid that errored on upsert won't be in seenIds
    // but still exists in JobNimbus, so an unconditional delete would lose it.)
    let deleted = 0;
    if (complete && errors === 0 && seenIds.length > 0) {
      const r = await query(
        `DELETE FROM jobnimbus_jobs WHERE jnid <> ALL($1::text[])`,
        [seenIds],
      );
      deleted = r.rowCount || 0;
      if (deleted > 0) console.log(`[jobnimbus] removed ${deleted} job(s) no longer present in JobNimbus`);
    }

    await setSetting('jobnimbus_last_sync', new Date().toISOString());
    await setSetting('jobnimbus_last_count', String(saved));
    // Refresh the JobNimbus-sourced scorecard rows (non-fatal if it fails).
    try {
      await syncScorecardFromJobNimbus();
    } catch (err) {
      console.error('[jobnimbus] scorecard sync failed:', (err as Error).message);
    }
    return { fetched: jobs.length, saved, errors, deleted };
  } finally {
    _syncing = false;
  }
}

export async function getJobNimbusSyncMeta(): Promise<{ last_sync: string | null; last_count: number | null }> {
  const last_sync = await getSetting('jobnimbus_last_sync');
  const last_count = await getSetting('jobnimbus_last_count');
  return { last_sync, last_count: last_count === null ? null : Number(last_count) };
}

/** Kick off periodic background sync (runs once shortly after boot, then on an interval). */
export function startJobNimbusAutoSync(): void {
  if (!process.env.JOBNIMBUS_API_KEY) {
    console.log('[jobnimbus] JOBNIMBUS_API_KEY not set — auto-sync disabled');
    return;
  }
  const minutes = Math.max(1, parseInt(process.env.JOBNIMBUS_SYNC_INTERVAL_MIN || '15', 10) || 15);
  const run = () => {
    syncJobNimbus()
      .then((r) => {
        if (!r.skipped) console.log(`[jobnimbus] sync complete — fetched ${r.fetched}, saved ${r.saved}, deleted ${r.deleted}, errors ${r.errors}`);
      })
      .catch((e) => console.error('[jobnimbus] sync failed:', e.message));
  };
  setTimeout(run, 8000); // initial sync a few seconds after boot
  setInterval(run, minutes * 60 * 1000);
  console.log(`[jobnimbus] direct-API auto-sync enabled (every ${minutes} min)`);
}

// ── Summary from DB ───────────────────────────────────────────────────────────

export async function getJobNimbusSummary(): Promise<{
  open_jobs: number;
  won_this_month: number;
  pipeline_value: number;
  total_jobs: number;
  leads: number;
  sold_value_this_month: number;
  billed_this_month: number;
  billed_value_this_month: number;
  last_received: string | null;
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Leads (status_type = 1) are excluded from job totals/pipeline.
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status_type <> 1)                                         AS total_jobs,
      COUNT(*) FILTER (WHERE status_type = 1)                                          AS leads,
      COUNT(*) FILTER (WHERE status_type = 2)                                          AS open_jobs,
      COUNT(*) FILTER (WHERE status_type = 4 AND signed_date >= $1)                    AS won_this_month,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 2), 0)                  AS pipeline_value,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $1), 0) AS sold_value_this_month,
      COUNT(*) FILTER (WHERE billed_date >= $1)                                        AS billed_this_month,
      COALESCE(SUM(invoice_value) FILTER (WHERE billed_date >= $1), 0)                 AS billed_value_this_month,
      MAX(updated_at)                                                                  AS last_received
    FROM jobnimbus_jobs
  `, [monthStart]);

  const row = result.rows[0];
  return {
    total_jobs:              Number(row.total_jobs),
    leads:                   Number(row.leads),
    open_jobs:               Number(row.open_jobs),
    won_this_month:          Number(row.won_this_month),
    pipeline_value:          Number(row.pipeline_value),
    sold_value_this_month:   Number(row.sold_value_this_month),
    billed_this_month:       Number(row.billed_this_month),
    billed_value_this_month: Number(row.billed_value_this_month),
    last_received:           row.last_received ? new Date(row.last_received).toISOString() : null,
  };
}

// ── Analytics (for live dashboard page) ───────────────────────────────────────

export interface JobNimbusAnalytics {
  totals: { all: number; open: number; won: number; lost: number; leads: number; contracts_sent: number; billed: number };
  values: { pipeline: number; sold: number; billed: number };
  // Comparison period — either the auto "same-length-preceding" window or an
  // explicit compare_from/compare_to passed by the caller.
  prev_totals: { open: number; won: number; lost: number; leads: number; contracts_sent: number; billed: number };
  prev_values: { pipeline: number; sold: number; billed: number };
  closing_rate: number | null;
  prev_closing_rate: number | null;
  win_rate: number | null;
  funnel: {
    leads: number;
    contracts_sent: number;
    signed: number;
    billed: number;
    lead_to_contract: number | null;
    contract_to_signed: number | null;
    signed_to_billed: number | null;
  };
  // Same funnel computed against the comparison window.
  prev_funnel: {
    leads: number;
    contracts_sent: number;
    signed: number;
    billed: number;
    lead_to_contract: number | null;
    contract_to_signed: number | null;
    signed_to_billed: number | null;
  };
  aging: {
    buckets: { label: string; min: number; max: number | null; count: number; value: number }[];
    stalled_count: number;
    stalled_value: number;
    avg_age_days: number | null;
  };
  top_open_deals: {
    jnid: string; name: string | null; status: string | null; sales_rep: string | null;
    source: string | null; estimate_value: number; age_days: number; url: string;
  }[];
  by_status: { status: string; count: number; status_type: number | null }[];
  by_sales_rep: {
    name: string; open: number; won: number; lost: number; contracts_sent: number;
    close_rate: number | null; sold_value: number; pipeline_value: number; avg_deal: number | null;
  }[];
  by_source: { source: string; count: number }[];
  by_record_type: { type: string; count: number }[];
  trend: { week: string; leads_created: number; signed: number; billed: number }[];
  weekly_billed: { week: string; count: number; amount: number }[];
  recent: { jnid: string; name: string | null; status: string | null; status_type: number | null; value: number | null; date_updated: string | null }[];
  targets: JobNimbusTargets;
  progress: {
    wtd_sold: number; mtd_sold: number;
    wtd_billed: number; mtd_billed: number;
    week_start: string; month_start: string;
  };
  filter: { from: string; to: string; compare_from: string; compare_to: string;
            rep: string | null; source: string | null; record_type: string | null };
  available_filters: { reps: string[]; sources: string[]; record_types: string[] };
}

export interface JobNimbusTargets {
  weekly_sold: number | null;
  monthly_sold: number | null;
  weekly_billed: number | null;
  monthly_billed: number | null;
}

export interface AnalyticsQuery {
  from: Date;
  to: Date;
  compareFrom?: Date | null;
  compareTo?: Date | null;
  rep?: string | null;
  source?: string | null;
  recordType?: string | null;
}

// Monday (ISO date) for a given date.
function mondayOf(d: Date): string {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); const off = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + off);
  return x.toISOString().split('T')[0];
}

// Last `n` Monday buckets (oldest → newest).
function lastMondays(n: number): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); const off = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + off);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(thisMonday); d.setDate(d.getDate() - i * 7);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

// Build the extra WHERE-clause fragment + parameters for sales-rep / source /
// record_type filters. `nextIdx` is the next parameter placeholder to use.
function buildFilterSql(opts: AnalyticsQuery, nextIdx: number): { sql: string; params: unknown[]; nextIdx: number } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (opts.rep)        { parts.push(`sales_rep_name = $${nextIdx++}`);   params.push(opts.rep); }
  if (opts.source)     { parts.push(`source_name = $${nextIdx++}`);      params.push(opts.source); }
  if (opts.recordType) { parts.push(`record_type_name = $${nextIdx++}`); params.push(opts.recordType); }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params, nextIdx };
}

// Aggregate counts/values bounded by a [from, to) event window. `open` and
// `pipeline_value` always reflect the *current* open snapshot regardless of
// window — they're not measured by event date.
async function totalsForWindow(from: Date, to: Date, filters: AnalyticsQuery) {
  const f = buildFilterSql(filters, 3);
  const r = (await query(`
    SELECT
      COUNT(*) FILTER (WHERE status_type = 2)                                                              AS open_count,
      COUNT(*) FILTER (WHERE status_type = 4 AND signed_date >= $1 AND signed_date < $2)                   AS won_count,
      COUNT(*) FILTER (WHERE status_type = 5 AND date_updated >= $1 AND date_updated < $2)                 AS lost_count,
      COUNT(*) FILTER (WHERE status_type = 1 AND date_created >= $1 AND date_created < $2)                 AS leads_count,
      COUNT(*) FILTER (WHERE contract_sent AND contract_sent_date >= $1 AND contract_sent_date < $2)       AS contracts_sent,
      COUNT(*) FILTER (WHERE billed_date >= $1 AND billed_date < $2)                                       AS billed_count,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 2), 0)                                      AS pipeline_value,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $1 AND signed_date < $2), 0) AS sold_value,
      COALESCE(SUM(invoice_value)  FILTER (WHERE billed_date >= $1 AND billed_date < $2), 0)               AS billed_value
    FROM jobnimbus_jobs
    WHERE TRUE${f.sql}
  `, [from, to, ...f.params])).rows[0];
  return {
    open: Number(r.open_count),
    won: Number(r.won_count),
    lost: Number(r.lost_count),
    leads: Number(r.leads_count),
    contracts_sent: Number(r.contracts_sent),
    billed: Number(r.billed_count),
    pipeline_value: Number(r.pipeline_value),
    sold_value: Number(r.sold_value),
    billed_value: Number(r.billed_value),
  };
}

// ── Targets (app_settings-backed) ─────────────────────────────────────────────

const TARGET_KEYS: Record<keyof JobNimbusTargets, string> = {
  weekly_sold:    'jobnimbus_target_weekly_sold',
  monthly_sold:   'jobnimbus_target_monthly_sold',
  weekly_billed:  'jobnimbus_target_weekly_billed',
  monthly_billed: 'jobnimbus_target_monthly_billed',
};

export async function getJobNimbusTargets(): Promise<JobNimbusTargets> {
  const entries = await Promise.all(
    (Object.keys(TARGET_KEYS) as (keyof JobNimbusTargets)[]).map(async (k) => [k, await getSetting(TARGET_KEYS[k])] as const),
  );
  const out: JobNimbusTargets = { weekly_sold: null, monthly_sold: null, weekly_billed: null, monthly_billed: null };
  for (const [k, v] of entries) {
    out[k] = v === null ? null : (Number(v) || 0);
  }
  return out;
}

export async function setJobNimbusTargets(t: Partial<JobNimbusTargets>): Promise<JobNimbusTargets> {
  for (const k of Object.keys(t) as (keyof JobNimbusTargets)[]) {
    const key = TARGET_KEYS[k];
    if (!key) continue;
    const v = t[k];
    if (v === null || v === undefined || (v as unknown) === '') {
      await query('DELETE FROM app_settings WHERE key = $1', [key]);
    } else {
      await setSetting(key, String(v));
    }
  }
  return getJobNimbusTargets();
}

export async function getJobNimbusAnalytics(opts: AnalyticsQuery): Promise<JobNimbusAnalytics> {
  const { from, to } = opts;
  // If no explicit compare window, fall back to the equivalent immediately-preceding window.
  const windowMs = to.getTime() - from.getTime();
  const compareTo = opts.compareTo ?? from;
  const compareFrom = opts.compareFrom ?? new Date(from.getTime() - windowMs);

  const t = await totalsForWindow(from, to, opts);
  const p = await totalsForWindow(compareFrom, compareTo, opts);
  const open = t.open;
  const won = t.won;
  const lost = t.lost;
  const leads = t.leads;
  const contractsSent = t.contracts_sent;
  const billed = t.billed;
  const all = open + won + lost;
  // Closing rate = signed ÷ all contracts sent (not just won/lost).
  const closingRate = contractsSent > 0 ? won / contractsSent : null;
  const prevClosingRate = p.contracts_sent > 0 ? p.won / p.contracts_sent : null;
  const winRate = all > 0 ? won / all : null;

  const funnelFor = (x: typeof t) => ({
    leads: x.leads,
    contracts_sent: x.contracts_sent,
    signed: x.won,
    billed: x.billed,
    lead_to_contract: x.leads > 0 ? x.contracts_sent / x.leads : null,
    contract_to_signed: x.contracts_sent > 0 ? x.won / x.contracts_sent : null,
    signed_to_billed: x.won > 0 ? x.billed / x.won : null,
  });
  const funnel = funnelFor(t);
  const prev_funnel = funnelFor(p);

  // Aging of currently-open pipeline (status_type=2). Age = days since
  // COALESCE(date_updated, date_created). Stalled = 30+ days untouched.
  const fAging = buildFilterSql(opts, 1);
  const agingRows = (await query(`
    SELECT
      EXTRACT(EPOCH FROM (NOW() - COALESCE(date_updated, date_created))) / 86400 AS age_days,
      COALESCE(estimate_value, 0) AS val
    FROM jobnimbus_jobs
    WHERE status_type = 2${fAging.sql}
  `, fAging.params)).rows;
  const bucketDefs: { label: string; min: number; max: number | null }[] = [
    { label: '0–14 days', min: 0, max: 14 },
    { label: '15–30 days', min: 14, max: 30 },
    { label: '31–60 days', min: 30, max: 60 },
    { label: '61–90 days', min: 60, max: 90 },
    { label: '90+ days', min: 90, max: null },
  ];
  const buckets = bucketDefs.map((b) => ({ ...b, count: 0, value: 0 }));
  let stalledCount = 0, stalledValue = 0, ageSum = 0, ageN = 0;
  for (const r of agingRows) {
    const age = Number(r.age_days);
    if (!Number.isFinite(age)) continue;
    const v = Number(r.val) || 0;
    ageSum += age; ageN++;
    if (age >= 30) { stalledCount++; stalledValue += v; }
    const b = buckets.find((x) => age >= x.min && (x.max === null || age < x.max));
    if (b) { b.count++; b.value += v; }
  }
  const aging = {
    buckets,
    stalled_count: stalledCount,
    stalled_value: stalledValue,
    avg_age_days: ageN > 0 ? ageSum / ageN : null,
  };

  // By status — current non-lead snapshot.
  const fStatus = buildFilterSql(opts, 1);
  const byStatusResult = await query(`
    SELECT status, status_type, COUNT(*) AS count
    FROM jobnimbus_jobs
    WHERE status_type <> 1 AND status IS NOT NULL${fStatus.sql}
    GROUP BY status, status_type
    ORDER BY count DESC
  `, fStatus.params);

  // By sales rep — uses window $1 plus filter params starting at $2.
  // Skip the rep filter when listing reps — it's the dimension itself.
  const fRep = buildFilterSql({ ...opts, rep: null }, 2);
  const byRepResult = await query(`
    SELECT
      sales_rep_name AS rep,
      COUNT(*) FILTER (WHERE status_type = 2)                            AS open,
      COUNT(*) FILTER (WHERE status_type = 4 AND signed_date >= $1)      AS won,
      COUNT(*) FILTER (WHERE status_type = 5 AND date_updated >= $1)     AS lost,
      COUNT(*) FILTER (WHERE contract_sent AND contract_sent_date >= $1) AS contracts_sent,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $1), 0) AS sold_value,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 2), 0)                       AS pipeline_value,
      AVG(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $1 AND estimate_value > 0) AS avg_deal
    FROM jobnimbus_jobs
    WHERE status_type <> 1 AND sales_rep_name IS NOT NULL AND sales_rep_name <> ''${fRep.sql}
    GROUP BY sales_rep_name
    ORDER BY won DESC, open DESC
    LIMIT 50
  `, [from, ...fRep.params]);
  const byRep = byRepResult.rows.map((r) => {
    const repWon = Number(r.won); const repLost = Number(r.lost); const repSent = Number(r.contracts_sent);
    return {
      name: r.rep, open: Number(r.open), won: repWon, lost: repLost,
      contracts_sent: repSent,
      // Closing rate = signed ÷ contracts sent for this rep.
      close_rate: repSent > 0 ? repWon / repSent : null,
      sold_value: Number(r.sold_value),
      pipeline_value: Number(r.pipeline_value),
      avg_deal: r.avg_deal !== null ? Number(r.avg_deal) : null,
    };
  });

  // By source / record type — non-lead, grouped by readable name.
  // Skip each dimension's own filter (it's the breakdown itself).
  const fSource = buildFilterSql({ ...opts, source: null }, 1);
  const bySourceResult = await query(`
    SELECT source_name AS source, COUNT(*) AS count
    FROM jobnimbus_jobs
    WHERE status_type <> 1 AND source_name IS NOT NULL AND source_name <> ''${fSource.sql}
    GROUP BY source_name ORDER BY count DESC LIMIT 15
  `, fSource.params);
  const fType = buildFilterSql({ ...opts, recordType: null }, 1);
  const byTypeResult = await query(`
    SELECT record_type_name AS type, COUNT(*) AS count
    FROM jobnimbus_jobs
    WHERE status_type <> 1 AND record_type_name IS NOT NULL AND record_type_name <> ''${fType.sql}
    GROUP BY record_type_name ORDER BY count DESC LIMIT 15
  `, fType.params);

  // Weekly trend (12 wk): leads created, jobs signed, jobs billed (+ billed $).
  const weeks = lastMondays(12);
  const idx = new Map(weeks.map((w, i) => [w, i]));
  const trendStart = new Date(weeks[0] + 'T00:00:00');
  const trend = weeks.map((week) => ({ week, leads_created: 0, signed: 0, billed: 0 }));
  const weekly_billed = weeks.map((week) => ({ week, count: 0, amount: 0 }));

  const fTrend = buildFilterSql(opts, 2);
  const trendRows = await query(`
    SELECT date_created, signed_date, billed_date, status_type, invoice_value
    FROM jobnimbus_jobs
    WHERE (date_created >= $1 OR signed_date >= $1 OR billed_date >= $1)${fTrend.sql}
  `, [trendStart, ...fTrend.params]);
  for (const r of trendRows.rows) {
    if (r.date_created && Number(r.status_type) === 1) {
      const i = idx.get(mondayOf(new Date(r.date_created))); if (i !== undefined) trend[i].leads_created++;
    }
    if (r.signed_date) {
      const i = idx.get(mondayOf(new Date(r.signed_date))); if (i !== undefined) trend[i].signed++;
    }
    if (r.billed_date) {
      const i = idx.get(mondayOf(new Date(r.billed_date)));
      if (i !== undefined) { trend[i].billed++; weekly_billed[i].count++; weekly_billed[i].amount += Number(r.invoice_value || 0); }
    }
  }

  // Recent non-lead activity.
  const fRecent = buildFilterSql(opts, 1);
  const recentResult = await query(`
    SELECT jnid, name, status, status_type, COALESCE(invoice_value, estimate_value) AS value, date_updated
    FROM jobnimbus_jobs
    WHERE status_type <> 1${fRecent.sql}
    ORDER BY COALESCE(date_updated, updated_at) DESC
    LIMIT 15
  `, fRecent.params);

  // Top 10 largest currently-open deals.
  const fTop = buildFilterSql(opts, 1);
  const topResult = await query(`
    SELECT jnid, name, status, sales_rep_name, source_name, estimate_value,
      EXTRACT(EPOCH FROM (NOW() - COALESCE(date_updated, date_created))) / 86400 AS age_days
    FROM jobnimbus_jobs
    WHERE status_type = 2 AND COALESCE(estimate_value, 0) > 0${fTop.sql}
    ORDER BY estimate_value DESC NULLS LAST
    LIMIT 10
  `, fTop.params);
  const top_open_deals = topResult.rows.map((r) => ({
    jnid: r.jnid,
    name: r.name,
    status: r.status,
    sales_rep: r.sales_rep_name,
    source: r.source_name,
    estimate_value: Number(r.estimate_value || 0),
    age_days: Math.max(0, Math.round(Number(r.age_days) || 0)),
    url: `https://app.jobnimbus.com/job/${r.jnid}`,
  }));

  // Available filter values — for the picker chips on the frontend. Always
  // unfiltered (independent of current selection) so the user can switch.
  const filters = (await query(`
    SELECT
      ARRAY(SELECT DISTINCT sales_rep_name   FROM jobnimbus_jobs WHERE sales_rep_name   IS NOT NULL AND sales_rep_name   <> '' AND status_type <> 1 ORDER BY 1) AS reps,
      ARRAY(SELECT DISTINCT source_name      FROM jobnimbus_jobs WHERE source_name      IS NOT NULL AND source_name      <> '' AND status_type <> 1 ORDER BY 1) AS sources,
      ARRAY(SELECT DISTINCT record_type_name FROM jobnimbus_jobs WHERE record_type_name IS NOT NULL AND record_type_name <> '' AND status_type <> 1 ORDER BY 1) AS types
  `)).rows[0];

  // Week/month progress against targets (always uses current week & month —
  // independent of the selected window).
  const targets = await getJobNimbusTargets();
  const now = new Date();
  const weekStart = (() => { const x = new Date(now); x.setHours(0,0,0,0); const dow = x.getDay(); const off = dow === 0 ? -6 : 1 - dow; x.setDate(x.getDate() + off); return x; })();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fProg = buildFilterSql(opts, 3);
  const progressRow = (await query(`
    SELECT
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $1), 0) AS wtd_sold,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $2), 0) AS mtd_sold,
      COALESCE(SUM(invoice_value)  FILTER (WHERE billed_date >= $1), 0)                     AS wtd_billed,
      COALESCE(SUM(invoice_value)  FILTER (WHERE billed_date >= $2), 0)                     AS mtd_billed
    FROM jobnimbus_jobs
    WHERE TRUE${fProg.sql}
  `, [weekStart, monthStart, ...fProg.params])).rows[0];

  return {
    totals: { all, open, won, lost, leads, contracts_sent: contractsSent, billed },
    values: { pipeline: Number(t.pipeline_value), sold: Number(t.sold_value), billed: Number(t.billed_value) },
    prev_totals: {
      open: p.open, won: p.won, lost: p.lost, leads: p.leads,
      contracts_sent: p.contracts_sent, billed: p.billed,
    },
    prev_values: { pipeline: Number(p.pipeline_value), sold: Number(p.sold_value), billed: Number(p.billed_value) },
    closing_rate: closingRate,
    prev_closing_rate: prevClosingRate,
    win_rate: winRate,
    funnel,
    prev_funnel,
    aging,
    top_open_deals,
    by_status: byStatusResult.rows.map((r) => ({
      status: r.status,
      status_type: r.status_type !== null ? Number(r.status_type) : null,
      count: Number(r.count),
    })),
    by_sales_rep: byRep,
    by_source: bySourceResult.rows.map((r) => ({ source: r.source, count: Number(r.count) })),
    by_record_type: byTypeResult.rows.map((r) => ({ type: r.type, count: Number(r.count) })),
    trend,
    weekly_billed,
    recent: recentResult.rows.map((r) => ({
      jnid: r.jnid,
      name: r.name,
      status: r.status,
      status_type: r.status_type !== null ? Number(r.status_type) : null,
      value: r.value !== null ? Number(r.value) : null,
      date_updated: r.date_updated ? new Date(r.date_updated).toISOString() : null,
    })),
    targets,
    progress: {
      wtd_sold: Number(progressRow.wtd_sold),
      mtd_sold: Number(progressRow.mtd_sold),
      wtd_billed: Number(progressRow.wtd_billed),
      mtd_billed: Number(progressRow.mtd_billed),
      week_start: weekStart.toISOString(),
      month_start: monthStart.toISOString(),
    },
    filter: {
      from: from.toISOString(), to: to.toISOString(),
      compare_from: compareFrom.toISOString(), compare_to: compareTo.toISOString(),
      rep: opts.rep ?? null, source: opts.source ?? null, record_type: opts.recordType ?? null,
    },
    available_filters: {
      reps: filters?.reps || [],
      sources: filters?.sources || [],
      record_types: filters?.types || [],
    },
  };
}

// ── Drill-down: list the underlying jobs for a dimension/bucket ────────────────

export interface JobNimbusJobRow {
  jnid: string; name: string | null; status: string | null; status_type: number | null;
  sales_rep: string | null; source: string | null; record_type: string | null;
  estimate_value: number | null; invoice_value: number | null;
  date_created: string | null; signed_date: string | null; billed_date: string | null;
  url: string;
}

export async function getJobNimbusJobs(params: {
  dimension: string; key?: string;
  // Either pass an explicit window (preferred) or `days` for back-compat.
  from?: Date; to?: Date; days?: number;
  rep?: string | null; source?: string | null; recordType?: string | null;
  limit?: number;
}): Promise<{ jobs: JobNimbusJobRow[]; total: number }> {
  const { dimension, key } = params;
  const limit = Math.min(Math.max(params.limit || 200, 1), 1000);
  const fromDate = params.from
    ?? new Date(Date.now() - (params.days && params.days > 0 ? params.days : 3650) * 24 * 60 * 60 * 1000);
  const toDate = params.to ?? new Date();

  const where: string[] = [];
  const vals: unknown[] = [];
  let p = 1;

  switch (dimension) {
    case 'leads':          where.push(`status_type = 1`, `date_created >= $${p++}`, `date_created < $${p++}`); vals.push(fromDate, toDate); break;
    case 'open':           where.push(`status_type = 2`); break;
    case 'won':            where.push(`status_type = 4`, `signed_date >= $${p++}`, `signed_date < $${p++}`); vals.push(fromDate, toDate); break;
    case 'contracts_sent': where.push(`contract_sent`, `contract_sent_date >= $${p++}`, `contract_sent_date < $${p++}`); vals.push(fromDate, toDate); break;
    case 'lost':           where.push(`status_type = 5`, `date_updated >= $${p++}`, `date_updated < $${p++}`); vals.push(fromDate, toDate); break;
    case 'billed':         where.push(`billed_date >= $${p++}`, `billed_date < $${p++}`); vals.push(fromDate, toDate); break;
    case 'stalled':        where.push(`status_type = 2`, `COALESCE(date_updated, date_created) < NOW() - INTERVAL '30 days'`); break;
    case 'status':         where.push(`status_type <> 1`, `status = $${p++}`); vals.push(key); break;
    case 'source':         where.push(`status_type <> 1`, `source_name = $${p++}`); vals.push(key); break;
    case 'record_type':    where.push(`status_type <> 1`, `record_type_name = $${p++}`); vals.push(key); break;
    case 'sales_rep':      where.push(`status_type <> 1`, `sales_rep_name = $${p++}`); vals.push(key); break;
    default:               where.push(`status_type <> 1`);
  }

  // Layer dashboard-level filters on top of the dimension filter — but never
  // re-apply the rep/source/type filter when it IS the dimension.
  const filterOpts: AnalyticsQuery = {
    from: fromDate, to: toDate,
    rep:        dimension === 'sales_rep'   ? null : (params.rep ?? null),
    source:     dimension === 'source'      ? null : (params.source ?? null),
    recordType: dimension === 'record_type' ? null : (params.recordType ?? null),
  };
  const f = buildFilterSql(filterOpts, p);
  if (f.sql) where.push(f.sql.replace(/^ AND /, ''));
  vals.push(...f.params);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderCol = dimension === 'billed' ? 'billed_date'
    : dimension === 'won' ? 'signed_date'
    : dimension === 'stalled' ? 'estimate_value'
    : 'COALESCE(date_updated, date_created, updated_at)';

  const rows = await query(`
    SELECT jnid, name, status, status_type, sales_rep_name, source_name, record_type_name,
           estimate_value, invoice_value, date_created, signed_date, billed_date
    FROM jobnimbus_jobs
    ${whereSql}
    ORDER BY ${orderCol} DESC NULLS LAST
    LIMIT ${limit}
  `, vals);

  const iso = (d: unknown) => d ? new Date(d as string).toISOString() : null;
  const jobs: JobNimbusJobRow[] = rows.rows.map((r) => ({
    jnid: r.jnid, name: r.name, status: r.status,
    status_type: r.status_type !== null ? Number(r.status_type) : null,
    sales_rep: r.sales_rep_name, source: r.source_name, record_type: r.record_type_name,
    estimate_value: r.estimate_value !== null ? Number(r.estimate_value) : null,
    invoice_value: r.invoice_value !== null ? Number(r.invoice_value) : null,
    date_created: iso(r.date_created), signed_date: iso(r.signed_date), billed_date: iso(r.billed_date),
    url: `https://app.jobnimbus.com/job/${r.jnid}`,
  }));
  return { jobs, total: jobs.length };
}

// CSV serializer for the drill-down lists. RFC-4180-ish: quote any cell that
// contains a comma, quote, or newline; double-quote any embedded quotes.
export function jobsToCsv(jobs: JobNimbusJobRow[]): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Job', 'Status', 'Sales Rep', 'Source', 'Record Type', 'Estimate $', 'Invoice $', 'Created', 'Signed', 'Billed', 'URL'];
  const fmtDate = (d: string | null) => d ? new Date(d).toISOString().slice(0, 10) : '';
  const fmtMoney = (n: number | null) => n == null ? '' : n.toFixed(2);
  const lines = [header.map(esc).join(',')];
  for (const j of jobs) {
    lines.push([
      j.name || '', j.status || '', j.sales_rep || '', j.source || '', j.record_type || '',
      fmtMoney(j.estimate_value), fmtMoney(j.invoice_value),
      fmtDate(j.date_created), fmtDate(j.signed_date), fmtDate(j.billed_date),
      j.url,
    ].map(esc).join(','));
  }
  return lines.join('\r\n');
}

// ── Scorecard auto-fill (writes data_source='jobnimbus' entries) ───────────────

interface JNMetricDef { name: string; format: 'number' | 'currency' | 'percent'; sort: number; }
const JN_TEAM = process.env.JOBNIMBUS_SCORECARD_TEAM || 'leadership';
const JN_METRICS: JNMetricDef[] = [
  { name: 'New Leads (JobNimbus)',      format: 'number',   sort: 80 },
  { name: 'Contracts Sent (JobNimbus)', format: 'number',   sort: 81 },
  { name: 'Jobs Signed (JobNimbus)',    format: 'number',   sort: 82 },
  { name: '$ Sold (JobNimbus)',         format: 'currency', sort: 83 },
  { name: 'Jobs Billed (JobNimbus)',    format: 'number',   sort: 84 },
  { name: '$ Billed (JobNimbus)',       format: 'currency', sort: 85 },
  { name: 'Closing Rate (JobNimbus)',   format: 'percent',  sort: 86 },
];

async function ensureScorecardTemplates(): Promise<void> {
  for (const m of JN_METRICS) {
    await query(`
      INSERT INTO scorecard_templates (team, metric_name, display_format, sort_order, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (team, metric_name) DO UPDATE SET display_format = EXCLUDED.display_format, is_active = true
    `, [JN_TEAM, m.name, m.format, m.sort]);
  }
}

// Manual scorecard metrics that duplicate a JobNimbus-sourced metric: drop the
// manual template + entries, and inherit the manual goal/color settings onto
// the JN-sourced template so the scorecard keeps the same goal & on-track
// coloring after the merge. Idempotent — re-runs are a no-op once merged.
const DUPLICATE_MANUAL_PAIRS: { manual: string; jn: string }[] = [
  { manual: 'Weekly Sales',  jn: '$ Sold (JobNimbus)' },
  { manual: 'Closing Rate',  jn: 'Closing Rate (JobNimbus)' },
  { manual: 'Appointments',  jn: 'New Leads (JobNimbus)' },
];

async function mergeManualDuplicatesIntoJN(): Promise<void> {
  for (const { manual, jn } of DUPLICATE_MANUAL_PAIRS) {
    // Copy goal/goal_text/lower_is_better/sort_order from the manual template
    // to the JN template, but only on first run (while the JN template still
    // has no goal). This preserves any goal an admin has set later.
    await query(`
      UPDATE scorecard_templates jn
      SET goal            = m.goal,
          goal_text       = m.goal_text,
          lower_is_better = m.lower_is_better,
          sort_order      = m.sort_order
      FROM scorecard_templates m
      WHERE jn.team = $1 AND jn.metric_name = $2
        AND m.team  = $1 AND m.metric_name  = $3
        AND jn.goal IS NULL
    `, [JN_TEAM, jn, manual]);

    // Drop the manual template + its historical entries.
    await query(`DELETE FROM scorecard_entries   WHERE team = $1 AND metric_name = $2`, [JN_TEAM, manual]);
    await query(`DELETE FROM scorecard_templates WHERE team = $1 AND metric_name = $2`, [JN_TEAM, manual]);
  }
}

function computeIsOnTrack(actual: number | null, goal: number | null, lowerIsBetter: boolean): boolean | null {
  if (actual === null || goal === null) return null;
  return lowerIsBetter ? actual <= goal : actual >= goal;
}

// Compute the metrics for one Monday week and upsert as scorecard_entries.
async function fillScorecardWeek(weekMonday: string): Promise<void> {
  const start = new Date(weekMonday + 'T00:00:00');
  const end = new Date(start); end.setDate(end.getDate() + 7);
  // YTD window: Jan 1 of this week's year through the end of this week. Closing
  // rate is reported as the cumulative aggregate, not the week-in-isolation rate.
  const yearStart = new Date(start.getFullYear(), 0, 1);

  const r = (await query(`
    SELECT
      -- "New Leads" = jobs whose JobNimbus next_appointment_date (epoch seconds)
      -- lands inside this week. JobNimbus stores it as a numeric string; coerce
      -- safely and skip anything non-numeric or <= 0.
      COUNT(*) FILTER (
        WHERE (raw->>'next_appointment_date') ~ '^[0-9]+(\\.[0-9]+)?$'
          AND to_timestamp(NULLIF(raw->>'next_appointment_date','')::double precision) >= $1
          AND to_timestamp(NULLIF(raw->>'next_appointment_date','')::double precision) <  $2
      )                                                                                                AS new_leads,
      COUNT(*) FILTER (WHERE contract_sent AND contract_sent_date >= $1 AND contract_sent_date < $2)   AS contracts_sent,
      COUNT(*) FILTER (WHERE status_type = 4 AND signed_date >= $1 AND signed_date < $2)               AS jobs_signed,
      COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 4 AND signed_date >= $1 AND signed_date < $2), 0) AS sold_value,
      COUNT(*) FILTER (WHERE billed_date >= $1 AND billed_date < $2)                                   AS jobs_billed,
      COALESCE(SUM(invoice_value) FILTER (WHERE billed_date >= $1 AND billed_date < $2), 0)            AS billed_value,
      -- YTD-through-end-of-this-week numerator/denominator for closing rate
      COUNT(*) FILTER (WHERE status_type = 4 AND signed_date >= $3 AND signed_date < $2)               AS ytd_signed,
      COUNT(*) FILTER (WHERE contract_sent AND contract_sent_date >= $3 AND contract_sent_date < $2)   AS ytd_contracts_sent
    FROM jobnimbus_jobs
  `, [start, end, yearStart])).rows[0];

  const signed = Number(r.jobs_signed);
  // Closing rate = aggregate YTD signed ÷ YTD contracts sent across all reps,
  // measured through the end of this scorecard week.
  const ytdSigned = Number(r.ytd_signed);
  const ytdContractsSent = Number(r.ytd_contracts_sent);
  const closing = ytdContractsSent > 0 ? ytdSigned / ytdContractsSent : null;

  const valueByName: Record<string, number | null> = {
    'New Leads (JobNimbus)':      Number(r.new_leads),
    'Contracts Sent (JobNimbus)': Number(r.contracts_sent),
    'Jobs Signed (JobNimbus)':    signed,
    '$ Sold (JobNimbus)':         Number(r.sold_value),
    'Jobs Billed (JobNimbus)':    Number(r.jobs_billed),
    '$ Billed (JobNimbus)':       Number(r.billed_value),
    'Closing Rate (JobNimbus)':   closing,
  };

  // Pull each metric's template (goal / goal_text / lower_is_better) so we can
  // stamp goal + is_on_track on every auto-filled entry — this is what drives
  // the scorecard's green/red color coding.
  const tmplResult = await query(
    `SELECT metric_name, goal, goal_text, lower_is_better
       FROM scorecard_templates
      WHERE team = $1 AND metric_name = ANY($2::text[])`,
    [JN_TEAM, JN_METRICS.map((m) => m.name)],
  );
  const tmplByName = new Map<string, { goal: number | null; goal_text: string | null; lower_is_better: boolean }>();
  for (const row of tmplResult.rows) {
    tmplByName.set(row.metric_name, {
      goal: row.goal !== null ? Number(row.goal) : null,
      goal_text: row.goal_text,
      lower_is_better: !!row.lower_is_better,
    });
  }

  for (const m of JN_METRICS) {
    const actual = valueByName[m.name];
    const tmpl = tmplByName.get(m.name);
    const goal = tmpl?.goal ?? null;
    const goalText = tmpl?.goal_text ?? null;
    const lib = tmpl?.lower_is_better ?? false;
    const onTrack = computeIsOnTrack(actual, goal, lib);
    await query(`
      INSERT INTO scorecard_entries (team, week_of, metric_name, goal, goal_text, actual, is_on_track, display_format, lower_is_better, data_source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'jobnimbus')
      ON CONFLICT (team, week_of, metric_name) DO UPDATE SET
        goal            = EXCLUDED.goal,
        goal_text       = EXCLUDED.goal_text,
        actual          = EXCLUDED.actual,
        is_on_track     = EXCLUDED.is_on_track,
        display_format  = EXCLUDED.display_format,
        lower_is_better = EXCLUDED.lower_is_better,
        data_source     = 'jobnimbus',
        updated_at      = NOW()
    `, [JN_TEAM, weekMonday, m.name, goal, goalText, actual, onTrack, m.format, lib]);
  }
}

/** Refresh JobNimbus-sourced scorecard rows for the last `weeksBack` weeks. */
export async function syncScorecardFromJobNimbus(weeksBack = 13): Promise<void> {
  await ensureScorecardTemplates();
  // Merge manual duplicates (Weekly Sales, Closing Rate, Appointments) into
  // their JobNimbus equivalents. Runs after ensureScorecardTemplates so the JN
  // rows exist and can inherit the manual goal/color settings.
  await mergeManualDuplicatesIntoJN();
  for (const w of lastMondays(weeksBack)) {
    await fillScorecardWeek(w);
  }
  // Per-rep Sales scorecard (Pete / Peter / Total).
  for (const w of lastMondays(weeksBack)) {
    await fillSalesScorecardWeek(w);
  }
}

// ── Sales team per-rep scorecard auto-fill ────────────────────────────────────
//
// Mirrors the leadership auto-fill but breaks every metric out by sales rep,
// plus a Total row. Rep matching is first-name based on
// `jobnimbus_jobs.sales_rep_name` (case-insensitive). The week-over-week
// metrics use a Thursday→Wednesday 7-day window ending the Wednesday before
// the scorecard's Monday week_of.

const SALES_TEAM = 'sales';

interface SalesRep { label: string; firstName: string }
const SALES_REPS: SalesRep[] = [
  { label: 'Pete',  firstName: 'Pete'  },
  { label: 'Peter', firstName: 'Peter' },
];

// Metric_name suffixes — must match the seeded scorecard_templates rows.
const SALES_METRICS = {
  weeklySales:    'Weekly Sales',
  closeRate:      'Close Rate',
  totalLeads:     'Total Leads (Prev Week Thu–Wed)',
  appointments:   'Appointments (Last 7 Days Thu–Wed)',
  selfGenLeads:   'Self-Generated Leads (Last 7 Days)',
} as const;

function salesMetricName(repLabel: string, base: string): string {
  return `${repLabel} — ${base}`;
}

// `sales_rep_name` filter clause that matches by first name (case-insensitive),
// or matches "everyone" when firstName is null (used for the Total row).
function repFilterSql(firstName: string | null, paramIdx: number): { sql: string; param: string | null } {
  if (firstName === null) return { sql: 'TRUE', param: null };
  return {
    sql: `LOWER(split_part(COALESCE(sales_rep_name,''), ' ', 1)) = LOWER($${paramIdx})`,
    param: firstName,
  };
}

async function fillSalesScorecardWeek(weekMonday: string): Promise<void> {
  const start = new Date(weekMonday + 'T00:00:00');   // Monday 00:00
  const end   = new Date(start); end.setDate(end.getDate() + 7);
  const yearStart = new Date(start.getFullYear(), 0, 1);
  // Thu→Wed window ending the Wednesday before this Monday.
  // Monday X − 11 days = Thu (start); Monday X − 4 days = next Thu (exclusive end).
  const thuWedStart = new Date(start); thuWedStart.setDate(thuWedStart.getDate() - 11);
  const thuWedEnd   = new Date(start); thuWedEnd.setDate(thuWedEnd.getDate() - 4);

  // Pull each rep's numbers (and a "total" row with no rep filter).
  type RepRow = {
    label: string;
    weeklySales: number;
    closeRate: number | null;
    totalLeads: number;
    appointments: number;
    selfGenLeads: number;
  };
  const rows: RepRow[] = [];

  const repsForAggregation: ({ label: string; firstName: string | null })[] = [
    ...SALES_REPS,
    { label: 'Total', firstName: null },
  ];

  for (const r of repsForAggregation) {
    const f = repFilterSql(r.firstName, 4);
    const params: unknown[] = [start, end, yearStart];
    if (f.param !== null) params.push(f.param);

    const agg = (await query(`
      SELECT
        COALESCE(SUM(estimate_value) FILTER (
          WHERE status_type = 4 AND signed_date >= $1 AND signed_date < $2
        ), 0)                                                                                      AS weekly_sales,
        COUNT(*) FILTER (
          WHERE status_type = 4 AND signed_date >= $3 AND signed_date < $2
        )                                                                                          AS ytd_signed,
        COUNT(*) FILTER (
          WHERE contract_sent AND contract_sent_date >= $3 AND contract_sent_date < $2
        )                                                                                          AS ytd_contracts_sent
      FROM jobnimbus_jobs
      WHERE ${f.sql}
    `, params)).rows[0];

    // Thu→Wed windowed counts (Total Leads + Appointments + Self-Gen).
    const f2 = repFilterSql(r.firstName, 3);
    const params2: unknown[] = [thuWedStart, thuWedEnd];
    if (f2.param !== null) params2.push(f2.param);

    const wkAgg = (await query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status_type = 1 AND date_created >= $1 AND date_created < $2
        )                                                                                          AS total_leads,
        COUNT(*) FILTER (
          WHERE (raw->>'next_appointment_date') ~ '^[0-9]+(\\.[0-9]+)?$'
            AND to_timestamp(NULLIF(raw->>'next_appointment_date','')::double precision) >= $1
            AND to_timestamp(NULLIF(raw->>'next_appointment_date','')::double precision) <  $2
        )                                                                                          AS appointments,
        -- "Self-generated" heuristic: source name contains self/door/knock/referral,
        -- or matches the rep's own name (rep-sourced lead). Tune as needed.
        COUNT(*) FILTER (
          WHERE status_type = 1
            AND date_created >= $1 AND date_created < $2
            AND (
              source_name ILIKE '%self%'
              OR source_name ILIKE '%door%'
              OR source_name ILIKE '%knock%'
              OR source_name ILIKE '%canvas%'
              OR source_name ILIKE '%referral%'
            )
        )                                                                                          AS self_gen_leads
      FROM jobnimbus_jobs
      WHERE ${f2.sql}
    `, params2)).rows[0];

    const ytdSigned = Number(agg.ytd_signed);
    const ytdContractsSent = Number(agg.ytd_contracts_sent);

    rows.push({
      label: r.label,
      weeklySales: Number(agg.weekly_sales),
      closeRate: ytdContractsSent > 0 ? ytdSigned / ytdContractsSent : null,
      totalLeads: Number(wkAgg.total_leads),
      appointments: Number(wkAgg.appointments),
      selfGenLeads: Number(wkAgg.self_gen_leads),
    });
  }

  // Load each template (for goal / goal_text / lower_is_better → on-track coloring).
  const wantedNames: string[] = [];
  for (const row of rows) {
    wantedNames.push(salesMetricName(row.label, SALES_METRICS.weeklySales));
    wantedNames.push(salesMetricName(row.label, SALES_METRICS.closeRate));
    wantedNames.push(salesMetricName(row.label, SALES_METRICS.totalLeads));
    wantedNames.push(salesMetricName(row.label, SALES_METRICS.appointments));
    wantedNames.push(salesMetricName(row.label, SALES_METRICS.selfGenLeads));
  }
  const tmplResult = await query(
    `SELECT metric_name, goal, goal_text, lower_is_better, display_format
       FROM scorecard_templates
      WHERE team = $1 AND metric_name = ANY($2::text[])`,
    [SALES_TEAM, wantedNames],
  );
  const tmplByName = new Map<string, { goal: number | null; goal_text: string | null; lower_is_better: boolean; display_format: string }>();
  for (const t of tmplResult.rows) {
    tmplByName.set(t.metric_name, {
      goal: t.goal !== null ? Number(t.goal) : null,
      goal_text: t.goal_text,
      lower_is_better: !!t.lower_is_better,
      display_format: t.display_format || 'number',
    });
  }

  const upsertEntry = async (metricName: string, actual: number | null, fallbackFormat: string) => {
    const tmpl = tmplByName.get(metricName);
    if (!tmpl) return; // template not seeded — skip (e.g. user renamed it)
    const onTrack = computeIsOnTrack(actual, tmpl.goal, tmpl.lower_is_better);
    await query(`
      INSERT INTO scorecard_entries (team, week_of, metric_name, goal, goal_text, actual, is_on_track, display_format, lower_is_better, data_source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'jobnimbus')
      ON CONFLICT (team, week_of, metric_name) DO UPDATE SET
        goal            = EXCLUDED.goal,
        goal_text       = EXCLUDED.goal_text,
        actual          = EXCLUDED.actual,
        is_on_track     = EXCLUDED.is_on_track,
        display_format  = EXCLUDED.display_format,
        lower_is_better = EXCLUDED.lower_is_better,
        data_source     = 'jobnimbus',
        updated_at      = NOW()
    `, [SALES_TEAM, weekMonday, metricName, tmpl.goal, tmpl.goal_text, actual, onTrack, tmpl.display_format || fallbackFormat, tmpl.lower_is_better]);
  };

  for (const row of rows) {
    await upsertEntry(salesMetricName(row.label, SALES_METRICS.weeklySales),  row.weeklySales,  'currency');
    await upsertEntry(salesMetricName(row.label, SALES_METRICS.closeRate),    row.closeRate,    'percent');
    await upsertEntry(salesMetricName(row.label, SALES_METRICS.totalLeads),   row.totalLeads,   'number');
    await upsertEntry(salesMetricName(row.label, SALES_METRICS.appointments), row.appointments, 'number');
    await upsertEntry(salesMetricName(row.label, SALES_METRICS.selfGenLeads), row.selfGenLeads, 'number');
  }
}

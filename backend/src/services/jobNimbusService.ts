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

// JobNimbus value lives under different keys depending on account config — try in order.
function extractJobValue(job: Record<string, unknown>): number | null {
  const candidates = [
    job.value,
    job.total,
    job.approved_estimate_total,
    job.approved_invoice_total,
    job.estimate_total,
  ];
  for (const c of candidates) {
    const n = toNumOrNull(c);
    if (n !== null) return n;
  }
  return null;
}

/** Upsert a single job pulled from the JobNimbus API into jobnimbus_jobs. */
export async function upsertJobFromApi(job: Record<string, any>): Promise<void> {
  const jnid = String(job.jnid || job.id || '').trim();
  if (!jnid) return;

  const name = job.name || job.display_name || null;
  const statusName = job.status_name ? String(job.status_name) : (job.status ? String(job.status) : null);
  const statusType = deriveStatusType(statusName);
  const value = extractJobValue(job);
  const dateCreated = toDateOrNull(job.date_created);
  const dateUpdated = toDateOrNull(job.date_updated ?? job.date_status_change ?? job.date_created);

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
    [jnid, name ? String(name) : null, statusName, statusType, value, dateCreated, dateUpdated, JSON.stringify(job)],
  );
}

/**
 * Fetch all Jobs from JobNimbus, paginating until exhausted. JobNimbus returns
 * { count, results } and accepts `from` / `size` query params.
 */
export async function fetchAllJobsFromApi(): Promise<Record<string, any>[]> {
  const apiKey = process.env.JOBNIMBUS_API_KEY;
  if (!apiKey) throw new Error('JOBNIMBUS_API_KEY is not set');

  const client = axios.create({
    baseURL: JN_API_BASE,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const all: Record<string, any>[] = [];
  const size = 100;
  let from = 0;
  // Guard against runaway loops — cap at 100 pages (10,000 jobs).
  for (let page = 0; page < 100; page++) {
    const resp = await client.get('/jobs', { params: { from, size } });
    const results: Record<string, any>[] = resp.data?.results || [];
    all.push(...results);
    if (results.length < size) break;
    from += size;
  }
  return all;
}

let _syncing = false;

/** Pull every job from the JobNimbus API and upsert into the local table. */
export async function syncJobNimbus(): Promise<{ fetched: number; saved: number; errors: number; skipped?: boolean }> {
  if (_syncing) return { fetched: 0, saved: 0, errors: 0, skipped: true };
  _syncing = true;
  try {
    const jobs = await fetchAllJobsFromApi();
    let saved = 0;
    let errors = 0;
    for (const job of jobs) {
      try {
        await upsertJobFromApi(job);
        saved++;
      } catch (err) {
        errors++;
        console.error('[jobnimbus] upsert failed:', (err as Error).message);
      }
    }
    await setSetting('jobnimbus_last_sync', new Date().toISOString());
    await setSetting('jobnimbus_last_count', String(saved));
    return { fetched: jobs.length, saved, errors };
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
        if (!r.skipped) console.log(`[jobnimbus] sync complete — fetched ${r.fetched}, saved ${r.saved}, errors ${r.errors}`);
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
  last_received: string | null;
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await query(`
    SELECT
      COUNT(*)                                                                          AS total_jobs,
      COUNT(*) FILTER (WHERE status_type NOT IN (4,5) OR status_type IS NULL)           AS open_jobs,
      COUNT(*) FILTER (WHERE status_type = 4 AND date_updated >= $1)                    AS won_this_month,
      COALESCE(SUM(value) FILTER (WHERE status_type NOT IN (4,5) OR status_type IS NULL), 0) AS pipeline_value,
      MAX(updated_at)                                                                   AS last_received
    FROM jobnimbus_jobs
  `, [monthStart]);

  const row = result.rows[0];
  return {
    total_jobs:     Number(row.total_jobs),
    open_jobs:      Number(row.open_jobs),
    won_this_month: Number(row.won_this_month),
    pipeline_value: Number(row.pipeline_value),
    last_received:  row.last_received ? new Date(row.last_received).toISOString() : null,
  };
}

// ── Analytics (for live dashboard page) ───────────────────────────────────────

export interface JobNimbusAnalytics {
  totals: { all: number; open: number; won: number; lost: number };
  closing_rate: number | null;
  win_rate: number | null;
  by_status: { status: string; count: number; status_type: number | null }[];
  by_sales_rep: { name: string; open: number; won: number; lost: number; close_rate: number | null }[];
  by_source: { source: string; count: number }[];
  by_record_type: { type: string; count: number }[];
  trend: { week: string; created: number; won: number }[];
  recent: { jnid: string; name: string | null; status: string | null; status_type: number | null; date_updated: string | null }[];
  filter: { from: string; to: string };
}

export async function getJobNimbusAnalytics(days: number): Promise<JobNimbusAnalytics> {
  const now = new Date();
  const to = now;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Jobs in window — based on date_created (when the lead came in)
  // We include jobs where date_created is null too (count under "no date")
  const inWindow = `(date_created IS NULL OR date_created >= $1)`;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalsResult = await query(`
    SELECT
      COUNT(*)                                                              AS all_count,
      COUNT(*) FILTER (WHERE status_type NOT IN (4,5) OR status_type IS NULL) AS open_count,
      COUNT(*) FILTER (WHERE status_type = 4)                               AS won_count,
      COUNT(*) FILTER (WHERE status_type = 5)                               AS lost_count
    FROM jobnimbus_jobs WHERE ${inWindow}
  `, [from]);
  const t = totalsResult.rows[0];
  const all = Number(t.all_count);
  const won = Number(t.won_count);
  const lost = Number(t.lost_count);
  const open = Number(t.open_count);
  const closingRate = (won + lost) > 0 ? won / (won + lost) : null;
  const winRate = all > 0 ? won / all : null;

  // ── By status ────────────────────────────────────────────────────────────
  const byStatusResult = await query(`
    SELECT status, status_type, COUNT(*) AS count
    FROM jobnimbus_jobs
    WHERE ${inWindow} AND status IS NOT NULL
    GROUP BY status, status_type
    ORDER BY count DESC
  `, [from]);

  // ── By sales rep (from raw JSON) ─────────────────────────────────────────
  // Tries multiple common field names since they vary by Zapier mapping
  const byRepResult = await query(`
    SELECT
      COALESCE(
        raw->>'sales_rep_name',
        raw->>'Sales Rep Name',
        raw->>'sales_rep'
      ) AS rep,
      COUNT(*) FILTER (WHERE status_type NOT IN (4,5) OR status_type IS NULL) AS open,
      COUNT(*) FILTER (WHERE status_type = 4)                                 AS won,
      COUNT(*) FILTER (WHERE status_type = 5)                                 AS lost
    FROM jobnimbus_jobs
    WHERE ${inWindow}
      AND COALESCE(raw->>'sales_rep_name', raw->>'Sales Rep Name', raw->>'sales_rep') IS NOT NULL
    GROUP BY rep
    ORDER BY (COUNT(*) FILTER (WHERE status_type = 4)) DESC, COUNT(*) DESC
    LIMIT 20
  `, [from]);

  const byRep = byRepResult.rows.map((r) => {
    const repWon = Number(r.won);
    const repLost = Number(r.lost);
    return {
      name: r.rep,
      open: Number(r.open),
      won: repWon,
      lost: repLost,
      close_rate: (repWon + repLost) > 0 ? repWon / (repWon + repLost) : null,
    };
  });

  // ── By source ─────────────────────────────────────────────────────────────
  const bySourceResult = await query(`
    SELECT
      COALESCE(raw->>'source', raw->>'Source Name', raw->>'source_name') AS source,
      COUNT(*) AS count
    FROM jobnimbus_jobs
    WHERE ${inWindow}
      AND COALESCE(raw->>'source', raw->>'Source Name', raw->>'source_name') IS NOT NULL
      AND COALESCE(raw->>'source', raw->>'Source Name', raw->>'source_name') <> ''
    GROUP BY source
    ORDER BY count DESC
    LIMIT 15
  `, [from]);

  // ── By record type ───────────────────────────────────────────────────────
  const byTypeResult = await query(`
    SELECT
      COALESCE(raw->>'record_type', raw->>'Record Type Name', raw->>'record_type_name') AS type,
      COUNT(*) AS count
    FROM jobnimbus_jobs
    WHERE ${inWindow}
      AND COALESCE(raw->>'record_type', raw->>'Record Type Name', raw->>'record_type_name') IS NOT NULL
      AND COALESCE(raw->>'record_type', raw->>'Record Type Name', raw->>'record_type_name') <> ''
    GROUP BY type
    ORDER BY count DESC
    LIMIT 15
  `, [from]);

  // ── Trend by week ────────────────────────────────────────────────────────
  // Build buckets in JS for last 12 weeks (Mondays)
  const weeks: { week: string; created: number; won: number }[] = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = today.getDay(); const offset = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + offset);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisMonday); d.setDate(d.getDate() - i * 7);
    weeks.push({ week: d.toISOString().split('T')[0], created: 0, won: 0 });
  }
  const trendStart = new Date(thisMonday); trendStart.setDate(trendStart.getDate() - 11 * 7);

  const trendResult = await query(`
    SELECT
      DATE_TRUNC('week', date_created) AS wk_created,
      DATE_TRUNC('week', date_updated) AS wk_updated,
      status_type
    FROM jobnimbus_jobs
    WHERE (date_created >= $1 OR date_updated >= $1)
  `, [trendStart]);

  for (const row of trendResult.rows) {
    if (row.wk_created) {
      const k = new Date(row.wk_created).toISOString().split('T')[0];
      const bucket = weeks.find((w) => w.week === k);
      if (bucket) bucket.created++;
    }
    if (row.wk_updated && Number(row.status_type) === 4) {
      const k = new Date(row.wk_updated).toISOString().split('T')[0];
      const bucket = weeks.find((w) => w.week === k);
      if (bucket) bucket.won++;
    }
  }

  // ── Recent activity ──────────────────────────────────────────────────────
  const recentResult = await query(`
    SELECT jnid, name, status, status_type, date_updated
    FROM jobnimbus_jobs
    ORDER BY COALESCE(date_updated, updated_at) DESC
    LIMIT 15
  `);

  return {
    totals:        { all, open, won, lost },
    closing_rate:  closingRate,
    win_rate:      winRate,
    by_status:     byStatusResult.rows.map((r) => ({
      status: r.status,
      status_type: r.status_type !== null ? Number(r.status_type) : null,
      count: Number(r.count),
    })),
    by_sales_rep:  byRep,
    by_source:     bySourceResult.rows.map((r) => ({ source: r.source, count: Number(r.count) })),
    by_record_type: byTypeResult.rows.map((r) => ({ type: r.type, count: Number(r.count) })),
    trend:         weeks,
    recent:        recentResult.rows.map((r) => ({
      jnid: r.jnid,
      name: r.name,
      status: r.status,
      status_type: r.status_type !== null ? Number(r.status_type) : null,
      date_updated: r.date_updated ? new Date(r.date_updated).toISOString() : null,
    })),
    filter: { from: from.toISOString(), to: to.toISOString() },
  };
}

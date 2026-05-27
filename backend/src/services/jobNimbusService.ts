import crypto from 'crypto';
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

export async function isJobNimbusConfigured(): Promise<boolean> {
  const token = await getWebhookToken();
  return !!token;
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

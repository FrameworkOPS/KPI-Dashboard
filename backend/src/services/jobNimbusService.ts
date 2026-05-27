import axios from 'axios';
import { query } from '../config/database';

interface JNJob {
  jnid: string;
  number: string;
  name: string;
  status: string;
  status_type: number;
  value: number | null;
  date_created: number;
  date_updated: number;
}

interface JNResponse {
  results: JNJob[];
  count: number;
}

async function getApiKey(): Promise<string | null> {
  try {
    const result = await query("SELECT value FROM app_settings WHERE key = 'jobnimbus_api_key'");
    if (result.rows[0]?.value) return result.rows[0].value;
  } catch {
    // table may not exist yet
  }
  return process.env.JOBNIMBUS_API_KEY || null;
}

export async function isJobNimbusConfigured(): Promise<boolean> {
  const key = await getApiKey();
  return !!key;
}

export async function setJobNimbusApiKey(apiKey: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('jobnimbus_api_key', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [apiKey],
  );
}

export async function removeJobNimbusApiKey(): Promise<void> {
  await query("DELETE FROM app_settings WHERE key = 'jobnimbus_api_key'");
}

export async function getJobNimbusSummary(): Promise<{
  open_jobs: number;
  won_this_month: number;
  pipeline_value: number;
  total_jobs: number;
}> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('JobNimbus API key not configured');

  const response = await axios.get<JNResponse>(
    'https://app.jobnimbus.com/api1/jobs?size=1000&sort=-date_updated',
    {
      headers: { Authorization: `api ${apiKey}` },
      timeout: 10000,
    },
  );

  const jobs = response.data.results || [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;

  let openJobs = 0;
  let wonThisMonth = 0;
  let pipelineValue = 0;

  for (const job of jobs) {
    const isWon = job.status_type === 4 || job.status?.toLowerCase().includes('complet');
    const isLost = job.status_type === 5 || job.status?.toLowerCase().includes('lost');

    if (!isWon && !isLost) {
      openJobs++;
      pipelineValue += job.value || 0;
    }

    if (isWon && job.date_updated >= monthStart) {
      wonThisMonth++;
    }
  }

  return {
    open_jobs: openJobs,
    won_this_month: wonThisMonth,
    pipeline_value: pipelineValue,
    total_jobs: jobs.length,
  };
}

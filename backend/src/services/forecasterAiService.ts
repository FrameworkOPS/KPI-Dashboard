import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../config/database';
import {
  getJnPipelineSummary,
  getForecasterSettings,
  updateForecasterSettings,
  listSalesRepCloseRates,
  upsertSalesRepCloseRate,
  deleteSalesRepCloseRate,
} from './jnPipelineService';

const MODEL = process.env.FORECASTER_AI_MODEL || 'claude-sonnet-4-5';

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

const FORECASTER_SYSTEM_PROMPT = `You are the Forecaster AI for Skyright Roofing's KPI Dashboard.

You have tools that can READ live operational data and WRITE certain types of data. Your job is to help leadership project, model scenarios, and update the forecast based on conversations.

# Tool categories

Tools are tagged as one of:

- **[READ]** — pull live data. Use freely.
- **[DATA]** — write a routine data record (sales forecast week, capacity block, pipeline item). Just do it; confirm what you did with the row(s) you changed.
- **[CONFIG]** — change a setting that affects ALL downstream calculations (closing rate, average SQs per contract, JobNimbus material field key, sales-rep close rates, crew capacity, scenario sandboxing). These can re-shape every forecast and KPI in the dashboard.
- **[SCENARIO]** — run a what-if without persisting. Use freely for projections.

# CRITICAL: Two-step confirmation for [CONFIG] tools

Before calling any [CONFIG] tool:
1. State exactly what you're about to change, what it currently is, and what it will become.
2. Spell out which dashboards/forecasts will move as a result (e.g. "every shingle lead-time projection will shift", "JobNimbus weighted pipeline drops by ~X SQs").
3. Ask the user to confirm with a clear "yes" before you proceed.

If the user has already said something unambiguous like "yes, set the close rate to 40%", you can skip step 3 and proceed — but still summarise the impact in your reply.

When you do call a [CONFIG] tool, pass \`confirmed: true\` so the tool knows the user agreed. Without that flag, [CONFIG] tools refuse and return a confirmation-required marker.

# Data sources

- Manual pipeline_items + live JobNimbus pipeline (contracts × close-rate × avg SQ; work orders use their JobNimbus # of sqs field)
- Active crews with ramp-up + capacity
- Sales forecast (projected weekly square footage by job type)
- 6-month rolling production forecast
- 12-week rolling KPI metrics
- Sales-rep level close-rate overrides
- Capacity blocks (custom_projects)

# Style

- Show the math when you project. Round to whole SQs and whole dollars.
- Use markdown tables for multi-row data.
- Lead-time colours: 4–5 wks green, 6–8 wks yellow, 8+ wks red.
- Be concise. Skip preamble.
- If a change would push lead time over 8 weeks anywhere in the 26-week window, flag it.
- 1 SQ = 100 sq ft. Materials are 'shingle' or 'metal'.`;

const SKY_SYSTEM_PROMPT = `You are Sky, the AI operating assistant inside Skyright Roofing's KPI Dashboard.

Your job is to help users understand and act on every part of this application: dashboard KPIs, scorecards, rocks, issues, to-dos, meetings, V/TO, accountability, JobNimbus, production pipeline, crews, sales forecasts, production forecasts, metrics, capacity blocks, and Forecaster AI data.

# Tool categories

Tools are tagged as one of:

- **[READ]** — pull live data. Use freely.
- **[DATA]** — write a routine data record (sales forecast week, capacity block, pipeline item). Just do it; confirm what you wrote with the row(s) you changed.
- **[CONFIG]** — change a setting that affects ALL downstream calculations (closing rate, average SQs per contract, JobNimbus material field key, sales-rep close rates, crew capacity). These reshape every forecast and KPI in the dashboard.
- **[SCENARIO]** — run a what-if without persisting. Use freely for projections.

# CRITICAL: Two-step confirmation for [CONFIG] tools

Before calling any [CONFIG] tool:
1. State exactly what you're about to change, what it currently is, and what it will become.
2. Spell out which dashboards/forecasts will move as a result.
3. Ask the user to confirm with a clear "yes" before you proceed.

If the user has already said something unambiguous like "yes, set the close rate to 40%", you can skip step 3 and proceed — but still summarise the impact in your reply.

When you do call a [CONFIG] tool, pass \`confirmed: true\` so the tool knows the user agreed. Without that flag, [CONFIG] tools refuse and return a confirmation-required marker.

# How to work

- Answer from live app data whenever a tool can answer the question.
- When forecasting, show the math in plain terms. 1 SQ = 100 sq ft. Shingles are $600/SQ and metal is $1,000/SQ.
- Be concise and operational. Give next actions when useful.
- Distinguish observed data from assumptions.
- Do not invent customers, jobs, reps, due dates, or financial numbers. Pull them with tools or say what is missing.`;

const TOOLS: Anthropic.Tool[] = [
  // ── READ ────────────────────────────────────────────────────────────────────
  {
    name: 'get_app_overview',
    description: '[READ] High-level operating snapshot across scorecard, rocks, issues, to-dos, meetings, JobNimbus, pipeline, crews, and production forecast.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_scorecard_snapshot',
    description: '[READ] Current scorecard entries, optionally filtered by team and week_of.',
    input_schema: {
      type: 'object',
      properties: {
        team: { type: 'string' },
        week_of: { type: 'string', description: 'ISO date YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'get_eos_work',
    description: '[READ] EOS operating work: rocks, open issues, open to-dos, and upcoming meetings.',
    input_schema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Optional team filter' },
      },
    },
  },
  {
    name: 'get_accountability_snapshot',
    description: '[READ] Accountability chart seats and owners.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_jobnimbus_snapshot',
    description: '[READ] JobNimbus summary and live pipeline details including jobs by rep.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_pipeline',
    description: '[READ] Current pipeline: manual entries aggregated by material + live JobNimbus summary. Contracts are weighted by close rate; work orders use the JobNimbus # of sqs field.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_crews',
    description: '[READ] All active crews with capacity, ramp-up training period, lead/super counts.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_sales_forecast',
    description: '[READ] Weekly sales forecast (projected SQs to be sold per week). Defaults to next 26 weeks.',
    input_schema: {
      type: 'object',
      properties: {
        start_week: { type: 'string' },
        end_week:   { type: 'string' },
      },
    },
  },
  {
    name: 'get_production_forecast',
    description: '[READ] 6-month rolling production forecast — weekly pipeline depletion, production rate, lead time, crew events.',
    input_schema: {
      type: 'object',
      properties: { weeks: { type: 'integer', description: 'Default 26. Use 13 or 39 for 3 or 9 month views.' } },
    },
  },
  {
    name: 'get_metrics_dashboard',
    description: '[READ] 12-week KPI dashboard: current pipeline, production rates, lead times, crews, revenue.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_capacity_blocks',
    description: '[READ] Active custom_projects — crews unavailable for a date range.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_forecaster_settings',
    description: '[READ] Current forecaster config: JobNimbus material field, global closing rate, average SQs per contract.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_sales_rep_close_rates',
    description: '[READ] Per-sales-rep closing rate overrides. Reps not listed use the global rate.',
    input_schema: { type: 'object', properties: {} },
  },

  // ── SCENARIO ────────────────────────────────────────────────────────────────
  {
    name: 'simulate_production_forecast',
    description: '[SCENARIO] Run a what-if forecast WITHOUT persisting. Add/remove crews, override sales forecast weeks, add capacity blocks, or apply a pipeline delta. Use freely to answer "what if" questions.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: { type: 'integer', description: '13, 26, or 39. Default 26.' },
        add_crews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              crew_name: { type: 'string' },
              crew_type: { type: 'string', enum: ['shingle', 'metal'] },
              start_date: { type: 'string', description: 'ISO YYYY-MM-DD' },
              weekly_sq_capacity: { type: 'number' },
              training_period_days: { type: 'integer' },
              terminate_date: { type: 'string' },
            },
            required: ['crew_name', 'crew_type', 'start_date'],
          },
        },
        remove_crew_ids: { type: 'array', items: { type: 'string' }, description: 'Crew UUIDs to simulate as removed' },
        pipeline_delta: {
          type: 'object',
          properties: { shingle: { type: 'number' }, metal: { type: 'number' } },
          description: 'Add (positive) or remove (negative) SQs from the starting pipeline',
        },
        sales_forecast_override: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              week: { type: 'string', description: 'ISO Monday date YYYY-MM-DD' },
              job_type: { type: 'string', enum: ['shingle', 'metal'] },
              projected_square_footage: { type: 'number' },
            },
            required: ['week', 'job_type', 'projected_square_footage'],
          },
        },
        add_capacity_blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              crew_id: { type: 'string' },
              start_date: { type: 'string' },
              end_date: { type: 'string' },
            },
            required: ['crew_id', 'start_date', 'end_date'],
          },
        },
      },
    },
  },

  // ── DATA writes ─────────────────────────────────────────────────────────────
  {
    name: 'set_sales_forecast',
    description: '[DATA] Set the projected square footage for a specific week + job_type. Upserts on conflict.',
    input_schema: {
      type: 'object',
      properties: {
        week:                     { type: 'string', description: 'ISO Monday date YYYY-MM-DD' },
        job_type:                 { type: 'string', enum: ['shingle', 'metal'] },
        projected_square_footage: { type: 'number' },
      },
      required: ['week', 'job_type', 'projected_square_footage'],
    },
  },
  {
    name: 'add_capacity_block',
    description: '[DATA] Add a custom_project capacity block — removes a crew from production for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        crew_id:      { type: 'string' },
        project_name: { type: 'string' },
        start_date:   { type: 'string' },
        end_date:     { type: 'string' },
        notes:        { type: 'string' },
      },
      required: ['crew_id', 'project_name', 'start_date', 'end_date'],
    },
  },
  {
    name: 'add_pipeline_item',
    description: '[DATA] Add a manual pipeline_item (a job awaiting production).',
    input_schema: {
      type: 'object',
      properties: {
        job_type:                     { type: 'string', enum: ['shingle', 'metal'] },
        square_footage:               { type: 'number' },
        revenue_per_sq:               { type: 'number' },
        estimated_days_to_completion: { type: 'integer' },
        added_date:                   { type: 'string', description: 'ISO YYYY-MM-DD' },
        target_start_date:            { type: 'string' },
        notes:                        { type: 'string' },
      },
      required: ['job_type', 'square_footage', 'revenue_per_sq', 'estimated_days_to_completion', 'added_date'],
    },
  },

  // ── CONFIG writes (require confirmed: true) ─────────────────────────────────
  {
    name: 'update_forecaster_settings',
    description: '[CONFIG] Change the global closing rate, average SQs per contract, or the JobNimbus material field key. Affects ALL forecasts that use the JN-derived pipeline. Requires confirmed: true.',
    input_schema: {
      type: 'object',
      properties: {
        closing_rate:           { type: 'number', description: '0.0–1.0' },
        avg_sqs_per_contract:   { type: 'number' },
        material_field_key:     { type: 'string' },
        confirmed:              { type: 'boolean' },
      },
    },
  },
  {
    name: 'set_sales_rep_close_rate',
    description: '[CONFIG] Set or override the closing rate for a specific sales rep. Used to weight JobNimbus contracts more accurately. Requires confirmed: true.',
    input_schema: {
      type: 'object',
      properties: {
        sales_rep_name: { type: 'string' },
        close_rate:     { type: 'number', description: '0.0–1.0' },
        notes:          { type: 'string' },
        confirmed:      { type: 'boolean' },
      },
      required: ['sales_rep_name', 'close_rate'],
    },
  },
  {
    name: 'delete_sales_rep_close_rate',
    description: '[CONFIG] Remove a sales-rep close-rate override — that rep will revert to the global rate. Requires confirmed: true.',
    input_schema: {
      type: 'object',
      properties: {
        sales_rep_name: { type: 'string' },
        confirmed:      { type: 'boolean' },
      },
      required: ['sales_rep_name'],
    },
  },
  {
    name: 'update_crew_capacity',
    description: '[CONFIG] Change a crew\'s weekly_sq_capacity or training_period_days. Affects every weekly forecast. Requires confirmed: true.',
    input_schema: {
      type: 'object',
      properties: {
        crew_id:              { type: 'string' },
        weekly_sq_capacity:   { type: 'number' },
        training_period_days: { type: 'integer' },
        confirmed:            { type: 'boolean' },
      },
      required: ['crew_id'],
    },
  },
];

// Marker returned by CONFIG tools when confirmed is not true — caught by the AI prompt protocol.
function requiresConfirmation(toolName: string, summary: string): any {
  return {
    requires_confirmation: true,
    tool: toolName,
    message: `[CONFIRMATION REQUIRED] Tell the user exactly what's about to change and ask them to confirm. Then re-call this tool with confirmed: true. Summary: ${summary}`,
  };
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function tool_get_pipeline(): Promise<any> {
  const manualResult = await pool.query(
    `SELECT job_type, COALESCE(SUM(square_footage),0) AS total_sqs,
            COALESCE(SUM(total_revenue),0) AS total_revenue,
            COUNT(*) AS job_count
     FROM pipeline_items WHERE is_active = true GROUP BY job_type ORDER BY job_type`
  );
  const manual: Record<string, any> = {};
  for (const r of manualResult.rows) {
    manual[r.job_type] = { sqs: Number(r.total_sqs), revenue: Number(r.total_revenue), count: Number(r.job_count) };
  }
  const jn = await getJnPipelineSummary();
  return {
    manual_pipeline: manual,
    jobnimbus_live: { shingle: jn.shingle, metal: jn.metal, unknown_material: jn.unknown, settings: jn.settings },
    combined_sqs: {
      shingle: (manual.shingle?.sqs || 0) + jn.shingle.total_sqs + jn.unknown.total_sqs / 2,
      metal:   (manual.metal?.sqs   || 0) + jn.metal.total_sqs   + jn.unknown.total_sqs / 2,
    },
  };
}

async function tool_get_scorecard_snapshot(input: any): Promise<any> {
  const params: any[] = [];
  const where: string[] = [];
  if (input?.team) { params.push(input.team); where.push(`team = $${params.length}`); }
  if (input?.week_of) { params.push(input.week_of); where.push(`week_of = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const entries = await pool.query(
    `SELECT team, week_of, metric_name, goal, actual, is_on_track, data_source, notes
     FROM scorecard_entries
     ${whereSql}
     ORDER BY week_of DESC, team, metric_name
     LIMIT 120`,
    params,
  );
  const totals = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_on_track = true) AS on_track,
       COUNT(*) FILTER (WHERE is_on_track = false) AS off_track
     FROM scorecard_entries ${whereSql}`,
    params,
  );
  return { totals: totals.rows[0], entries: entries.rows };
}

async function tool_get_eos_work(input: any): Promise<any> {
  const team = input?.team ? String(input.team) : null;
  const teamWhere = team ? 'AND team = $1' : '';
  const params = team ? [team] : [];
  const [rocks, issues, todos, meetings] = await Promise.all([
    pool.query(
      `SELECT r.id, r.title, r.status, r.completion_percentage, r.due_date, r.team,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS owner
       FROM rocks r LEFT JOIN users u ON u.id = r.owner_id
       WHERE COALESCE(r.status, '') <> 'done' ${teamWhere}
       ORDER BY r.due_date NULLS LAST, r.created_at DESC
       LIMIT 30`,
      params,
    ),
    pool.query(
      `SELECT i.id, i.title, i.priority, i.status, i.team,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS owner
       FROM issues i LEFT JOIN users u ON u.id = i.owner_id
       WHERE COALESCE(i.status, '') <> 'solved' ${teamWhere}
       ORDER BY CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_at DESC
       LIMIT 30`,
      params,
    ),
    pool.query(
      `SELECT t.id, t.title, t.status, t.due_date, t.team,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS owner
       FROM todos t LEFT JOIN users u ON u.id = t.owner_id
       WHERE COALESCE(t.status, '') <> 'complete' ${teamWhere}
       ORDER BY t.due_date NULLS LAST, t.created_at DESC
       LIMIT 30`,
      params,
    ),
    pool.query(
      `SELECT id, team || ' Level 10' AS title, team, meeting_date, meeting_time, status
       FROM meetings
       WHERE meeting_date >= CURRENT_DATE ${teamWhere}
       ORDER BY meeting_date ASC
       LIMIT 20`,
      params,
    ),
  ]);
  return { rocks: rocks.rows, issues: issues.rows, todos: todos.rows, upcoming_meetings: meetings.rows };
}

async function tool_get_accountability_snapshot(): Promise<any> {
  const r = await pool.query(
    `SELECT s.id, s.seat_name, s.seat_description, s.owner_name, s.sort_order,
            parent.seat_name AS parent_seat,
            COALESCE(u.first_name || ' ' || u.last_name, u.email) AS owner
     FROM accountability_seats s
     LEFT JOIN accountability_seats parent ON parent.id = s.parent_seat_id
     LEFT JOIN users u ON u.id = s.owner_id
     ORDER BY COALESCE(parent.sort_order, 0), s.sort_order, s.seat_name
     LIMIT 120`
  );
  return { seats: r.rows };
}

async function tool_get_jobnimbus_snapshot(): Promise<any> {
  const pipeline = await getJnPipelineSummary();
  let summary: any = null;
  try {
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status_type <> 1) AS total_jobs,
         COUNT(*) FILTER (WHERE status_type = 1) AS leads,
         COUNT(*) FILTER (WHERE status_type = 2) AS open_jobs,
         COUNT(*) FILTER (WHERE status_type = 4) AS won_jobs,
         COUNT(*) FILTER (WHERE contract_sent = true) AS contracts_sent,
         COALESCE(SUM(estimate_value) FILTER (WHERE status_type = 2), 0) AS open_estimate_value,
         MAX(updated_at) AS last_received
       FROM jobnimbus_jobs`
    );
    summary = r.rows[0];
  } catch {
    summary = { unavailable: true };
  }
  return { summary, pipeline };
}

async function tool_get_app_overview(): Promise<any> {
  const [scorecard, eos, jobnimbus, pipeline, forecast] = await Promise.all([
    tool_get_scorecard_snapshot({}),
    tool_get_eos_work({}),
    tool_get_jobnimbus_snapshot(),
    tool_get_pipeline(),
    tool_get_production_forecast({ weeks: 8 }),
  ]);
  return { scorecard, eos, jobnimbus, pipeline, production_forecast: forecast };
}

async function tool_get_crews(): Promise<any> {
  const r = await pool.query(
    `SELECT c.id, c.crew_name, c.crew_type, c.team_members, c.start_date, c.terminate_date,
            c.training_period_days, c.weekly_sq_capacity, c.revenue_per_sq,
            COALESCE(cs.lead_count, 0) AS lead_count,
            COALESCE(cs.super_count, 0) AS super_count
     FROM crews c
     LEFT JOIN crew_staff cs ON cs.crew_id = c.id AND cs.is_active = true
     WHERE c.is_active = true
     ORDER BY c.crew_type, c.crew_name`
  );
  return { crews: r.rows };
}

async function tool_get_sales_forecast(input: any): Promise<any> {
  const start = input?.start_week || new Date().toISOString().slice(0, 10);
  const end = input?.end_week || new Date(Date.now() + 182 * 86400000).toISOString().slice(0, 10);
  const r = await pool.query(
    `SELECT forecast_week, job_type, projected_square_footage
     FROM sales_forecast WHERE forecast_week >= $1 AND forecast_week <= $2
     ORDER BY forecast_week, job_type`,
    [start, end]
  );
  return { start_week: start, end_week: end, forecasts: r.rows };
}

async function tool_get_production_forecast(input: any): Promise<any> {
  const { getSixMonthForecastData } = await import('../controllers/forecastController');
  return getSixMonthForecastData(Number(input?.weeks) || 26);
}

async function tool_simulate_production_forecast(input: any): Promise<any> {
  const { getSixMonthForecastData } = await import('../controllers/forecastController');
  const weeks = Number(input?.weeks) || 26;
  const result = await getSixMonthForecastData(weeks, {
    add_crews:               input?.add_crews,
    remove_crew_ids:         input?.remove_crew_ids,
    pipeline_delta:          input?.pipeline_delta,
    sales_forecast_override: input?.sales_forecast_override,
    add_capacity_blocks:     input?.add_capacity_blocks,
  });
  return { scenario_applied: true, ...result };
}

async function tool_get_metrics_dashboard(): Promise<any> {
  const { getMetricsDashboardData } = await import('../controllers/metricsController');
  return getMetricsDashboardData();
}

async function tool_get_capacity_blocks(): Promise<any> {
  const r = await pool.query(
    `SELECT cp.id, cp.project_name, cp.start_date, cp.end_date, cp.notes,
            c.crew_name, c.crew_type
     FROM custom_projects cp JOIN crews c ON c.id = cp.crew_id
     WHERE cp.is_active = true AND cp.end_date >= CURRENT_DATE
     ORDER BY cp.start_date`
  );
  return { capacity_blocks: r.rows };
}

async function tool_get_forecaster_settings(): Promise<any> {
  return getForecasterSettings();
}

async function tool_get_sales_rep_close_rates(): Promise<any> {
  const settings = await getForecasterSettings();
  const overrides = await listSalesRepCloseRates();
  return { global_close_rate: settings.closing_rate, overrides };
}

// ── DATA writes ────────────────────────────────────────────────────────────────

async function tool_set_sales_forecast(input: any, userId: string | null): Promise<any> {
  const { week, job_type, projected_square_footage } = input || {};
  if (!week || !job_type || projected_square_footage === undefined) {
    return { error: 'week, job_type, projected_square_footage required' };
  }
  await pool.query(
    `INSERT INTO sales_forecast (forecast_week, job_type, projected_square_footage, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (forecast_week, job_type) DO UPDATE
       SET projected_square_footage = EXCLUDED.projected_square_footage, updated_at = NOW()`,
    [week, job_type, projected_square_footage, userId],
  );
  return { ok: true, written: { week, job_type, projected_square_footage } };
}

async function tool_add_capacity_block(input: any, userId: string | null): Promise<any> {
  const { crew_id, project_name, start_date, end_date, notes } = input || {};
  if (!crew_id || !project_name || !start_date || !end_date) {
    return { error: 'crew_id, project_name, start_date, end_date required' };
  }
  if (new Date(start_date) >= new Date(end_date)) {
    return { error: 'start_date must be before end_date' };
  }
  const r = await pool.query(
    `INSERT INTO custom_projects (crew_id, project_name, start_date, end_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [crew_id, project_name, start_date, end_date, notes || null, userId],
  );
  return { ok: true, created_id: r.rows[0].id };
}

async function tool_add_pipeline_item(input: any, userId: string | null): Promise<any> {
  const { job_type, square_footage, revenue_per_sq, estimated_days_to_completion, added_date, target_start_date, notes } = input || {};
  if (!job_type || !square_footage || !revenue_per_sq || !estimated_days_to_completion || !added_date) {
    return { error: 'job_type, square_footage, revenue_per_sq, estimated_days_to_completion, added_date required' };
  }
  const total = Number(square_footage) * Number(revenue_per_sq);
  const r = await pool.query(
    `INSERT INTO pipeline_items
       (job_type, square_footage, estimated_days_to_completion, revenue_per_sq, total_revenue,
        status, added_date, target_start_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9) RETURNING id`,
    [job_type, square_footage, estimated_days_to_completion, revenue_per_sq, total, added_date, target_start_date || null, notes || null, userId],
  );
  return { ok: true, created_id: r.rows[0].id, total_revenue: total };
}

// ── CONFIG writes ──────────────────────────────────────────────────────────────

async function tool_update_forecaster_settings(input: any): Promise<any> {
  if (input?.confirmed !== true) {
    return requiresConfirmation('update_forecaster_settings',
      `closing_rate=${input?.closing_rate}, avg_sqs_per_contract=${input?.avg_sqs_per_contract}, material_field_key=${input?.material_field_key}`);
  }
  const updated = await updateForecasterSettings({
    closing_rate: input.closing_rate,
    avg_sqs_per_contract: input.avg_sqs_per_contract,
    material_field_key: input.material_field_key,
  });
  return { ok: true, warning: 'Base function change — all JN-weighted projections recalculate on next read.', updated };
}

async function tool_set_sales_rep_close_rate(input: any, userId: string | null): Promise<any> {
  if (input?.confirmed !== true) {
    return requiresConfirmation('set_sales_rep_close_rate',
      `${input?.sales_rep_name} → ${input?.close_rate} (${Math.round(Number(input?.close_rate) * 100)}%)`);
  }
  const result = await upsertSalesRepCloseRate(input.sales_rep_name, Number(input.close_rate), input.notes ?? null, userId);
  return { ok: true, warning: `Sales rep override changes JN pipeline weighting for ${result.sales_rep_name}.`, result };
}

async function tool_delete_sales_rep_close_rate(input: any): Promise<any> {
  if (input?.confirmed !== true) {
    return requiresConfirmation('delete_sales_rep_close_rate',
      `Remove override for ${input?.sales_rep_name} — they'll revert to the global rate.`);
  }
  const ok = await deleteSalesRepCloseRate(input.sales_rep_name);
  return ok ? { ok: true, deleted: input.sales_rep_name } : { error: 'No override existed for that rep' };
}

async function tool_update_crew_capacity(input: any): Promise<any> {
  if (input?.confirmed !== true) {
    return requiresConfirmation('update_crew_capacity',
      `crew ${input?.crew_id}: weekly_sq_capacity=${input?.weekly_sq_capacity}, training_period_days=${input?.training_period_days}`);
  }
  const { crew_id, weekly_sq_capacity, training_period_days } = input;
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  if (weekly_sq_capacity !== undefined)   { updates.push(`weekly_sq_capacity=$${p++}`);   values.push(weekly_sq_capacity); }
  if (training_period_days !== undefined) { updates.push(`training_period_days=$${p++}`); values.push(training_period_days); }
  if (!updates.length) return { error: 'No fields to update' };
  updates.push('updated_at=NOW()');
  values.push(crew_id);
  const r = await pool.query(
    `UPDATE crews SET ${updates.join(',')} WHERE id=$${p} RETURNING id, crew_name, weekly_sq_capacity, training_period_days`,
    values,
  );
  if (!r.rows.length) return { error: 'Crew not found' };
  return { ok: true, warning: `Capacity change for ${r.rows[0].crew_name} reshapes every weekly forecast.`, updated: r.rows[0] };
}

async function executeTool(name: string, input: any, userId: string | null): Promise<any> {
  try {
    switch (name) {
      case 'get_app_overview':               return await tool_get_app_overview();
      case 'get_scorecard_snapshot':         return await tool_get_scorecard_snapshot(input);
      case 'get_eos_work':                   return await tool_get_eos_work(input);
      case 'get_accountability_snapshot':    return await tool_get_accountability_snapshot();
      case 'get_jobnimbus_snapshot':         return await tool_get_jobnimbus_snapshot();
      case 'get_pipeline':                   return await tool_get_pipeline();
      case 'get_crews':                      return await tool_get_crews();
      case 'get_sales_forecast':             return await tool_get_sales_forecast(input);
      case 'get_production_forecast':        return await tool_get_production_forecast(input);
      case 'get_metrics_dashboard':          return await tool_get_metrics_dashboard();
      case 'get_capacity_blocks':            return await tool_get_capacity_blocks();
      case 'get_forecaster_settings':        return await tool_get_forecaster_settings();
      case 'get_sales_rep_close_rates':      return await tool_get_sales_rep_close_rates();
      case 'simulate_production_forecast':   return await tool_simulate_production_forecast(input);
      case 'set_sales_forecast':             return await tool_set_sales_forecast(input, userId);
      case 'add_capacity_block':             return await tool_add_capacity_block(input, userId);
      case 'add_pipeline_item':              return await tool_add_pipeline_item(input, userId);
      case 'update_forecaster_settings':     return await tool_update_forecaster_settings(input);
      case 'set_sales_rep_close_rate':       return await tool_set_sales_rep_close_rate(input, userId);
      case 'delete_sales_rep_close_rate':    return await tool_delete_sales_rep_close_rate(input);
      case 'update_crew_capacity':           return await tool_update_crew_capacity(input);
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  reply: string;
  tool_calls: Array<{ name: string; input: any; warning?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

// CONFIG tool names — used to flag warnings in the UI
const CONFIG_TOOLS = new Set([
  'update_forecaster_settings',
  'set_sales_rep_close_rate',
  'delete_sales_rep_close_rate',
  'update_crew_capacity',
]);

async function chatWithSystem(systemPrompt: string, disabledName: string, history: ChatMessage[], userId: string | null = null): Promise<ChatResult> {
  const client = getClient();
  if (!client) {
    return {
      reply: `ANTHROPIC_API_KEY is not set on the server. ${disabledName} is disabled until an admin configures the key.`,
      tool_calls: [],
    };
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const toolCalls: Array<{ name: string; input: any; warning?: string }> = [];
  const MAX_ITERATIONS = 8;
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
    usage.input_tokens += resp.usage.input_tokens;
    usage.output_tokens += resp.usage.output_tokens;

    if (resp.stop_reason === 'tool_use') {
      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: resp.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const result = await executeTool(use.name, use.input, userId);
        // Surface warnings/config flags to the UI
        const warning = (result && typeof result === 'object' && result.warning) ? String(result.warning)
          : (CONFIG_TOOLS.has(use.name) && (use.input as any)?.confirmed === true) ? `Base-function change via ${use.name}` : undefined;
        toolCalls.push({ name: use.name, input: use.input, warning });
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const reply = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { reply: reply || '(no response)', tool_calls: toolCalls, usage };
  }

  return {
    reply: 'The AI took too many tool-use iterations. Try rephrasing your question more specifically.',
    tool_calls: toolCalls,
    usage,
  };
}

export async function chatWithForecaster(history: ChatMessage[], userId: string | null = null): Promise<ChatResult> {
  return chatWithSystem(FORECASTER_SYSTEM_PROMPT, 'The Forecaster AI', history, userId);
}

export async function chatWithSky(history: ChatMessage[], userId: string | null = null): Promise<ChatResult> {
  return chatWithSystem(SKY_SYSTEM_PROMPT, 'Sky', history, userId);
}

export function isForecasterAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

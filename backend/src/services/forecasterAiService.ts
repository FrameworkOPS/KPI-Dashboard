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

const FORECASTER_MODEL = process.env.FORECASTER_AI_MODEL || 'claude-sonnet-4-6';
const SKY_MODEL        = process.env.SKY_AI_MODEL        || 'claude-haiku-4-5-20251001';

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

- **[READ]** — pull live data. Use freely and proactively.
- **[DATA]** — write a routine record: rocks, issues, to-dos, scorecard actuals, meetings (create or update notes), V/TO sections, accountability seats, sales forecast weeks, pipeline items (add, update, or delete), capacity blocks, crews (add, update, or deactivate), crew staffing counts, and people-analyzer entries. **Call the tool immediately — no confirmation, no "would you like me to", no asking permission. Execute, then confirm what changed.**
- **[CONFIG]** — change a global setting that reshapes ALL downstream forecasts and KPIs (closing rate, avg SQs, material field key, sales-rep rates, crew capacity). Requires explicit user confirmation before executing.
- **[SCENARIO]** — what-if projection without persisting. Use freely.

# CRITICAL: Two-step confirmation for [CONFIG] tools only

Before any [CONFIG] tool call:
1. State what's changing, what it is now, and what it will become.
2. Spell out which forecasts/KPIs shift as a result.
3. Ask the user to confirm with a clear "yes" before proceeding.

If the user already said something unambiguous (e.g. "yes, set the close rate to 40%"), skip step 3 — but still summarise impact. Pass \`confirmed: true\` in the call or the tool will refuse.

# How to work

- **For any data-entry request, call the [DATA] tool first. Do not describe what you're about to do — do it, then report the result.**
- If you need a user UUID to set an owner, call list_users first, then proceed.
- Answer from live app data whenever a tool can answer the question.
- When forecasting, show the math. 1 SQ = 100 sq ft. Shingles $600/SQ, metal $1,000/SQ.
- Be concise and operational. Give next actions when useful.
- Do not invent customers, jobs, reps, dates, or numbers. Pull them with tools or say what is missing.`;

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

  {
    name: 'get_current_date',
    description: '[READ] Returns today\'s date, day of week, and the Monday anchor for the current week plus the next 8 Mondays. Call this before any date-dependent write so you can resolve phrases like "starting today" or "next week" into exact ISO dates.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_users',
    description: '[READ] List all users on the roster — name, email, id, team, role. Use to resolve names to UUIDs when creating or updating rocks, issues, or to-dos.',
    input_schema: {
      type: 'object',
      properties: {
        include_roster_only: { type: 'boolean', description: 'Include roster-only people who cannot log in (default true)' },
      },
    },
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

  {
    name: 'delete_sales_forecast',
    description: '[DATA] Delete sales forecast entries. Omit job_type to delete both shingle and metal for the given week range. Omit start_week/end_week to delete ALL entries (use carefully).',
    input_schema: {
      type: 'object',
      properties: {
        start_week: { type: 'string', description: 'ISO Monday date YYYY-MM-DD — delete entries on or after this week' },
        end_week:   { type: 'string', description: 'ISO Monday date YYYY-MM-DD — delete entries on or before this week' },
        job_type:   { type: 'string', enum: ['shingle', 'metal'], description: 'Omit to delete both types' },
      },
    },
  },

  {
    name: 'set_sales_forecast_range',
    description: '[DATA] Bulk-upsert the same projected SQ count across consecutive weeks. Use when the user says something like "add 8 weeks at 100 SQs of shingle starting today". Call get_current_date first to resolve "today" to the correct Monday anchor.',
    input_schema: {
      type: 'object',
      properties: {
        start_week:               { type: 'string', description: 'ISO Monday date YYYY-MM-DD for the first week' },
        job_type:                 { type: 'string', enum: ['shingle', 'metal'] },
        projected_square_footage: { type: 'number', description: 'SQs to forecast for EACH week in the range' },
        weeks_count:              { type: 'integer', description: 'Number of consecutive weeks to set (default 8, max 52)' },
      },
      required: ['start_week', 'job_type', 'projected_square_footage'],
    },
  },

  // ── EOS DATA writes ──────────────────────────────────────────────────────────
  {
    name: 'create_rock',
    description: '[DATA] Create a new quarterly rock.',
    input_schema: {
      type: 'object',
      properties: {
        team:        { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        quarter:     { type: 'integer', description: '1–4' },
        year:        { type: 'integer' },
        owner_id:    { type: 'string', description: 'UUID from list_users' },
        due_date:    { type: 'string', description: 'ISO YYYY-MM-DD' },
      },
      required: ['team', 'title'],
    },
  },
  {
    name: 'update_rock',
    description: '[DATA] Update an existing rock — status, completion %, title, description, or due date.',
    input_schema: {
      type: 'object',
      properties: {
        id:                    { type: 'string', description: 'Rock UUID' },
        title:                 { type: 'string' },
        description:           { type: 'string' },
        status:                { type: 'string', enum: ['on_track', 'off_track', 'done', 'at_risk'] },
        completion_percentage: { type: 'integer', description: '0–100' },
        due_date:              { type: 'string' },
        owner_id:              { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_issue',
    description: '[DATA] Create a new IDS issue.',
    input_schema: {
      type: 'object',
      properties: {
        team:        { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        priority:    { type: 'string', enum: ['high', 'medium', 'low'] },
        owner_id:    { type: 'string' },
      },
      required: ['team', 'title'],
    },
  },
  {
    name: 'update_issue',
    description: '[DATA] Update an existing issue — status (open/solved/dropped), priority, title, or description.',
    input_schema: {
      type: 'object',
      properties: {
        id:          { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        status:      { type: 'string', enum: ['open', 'solved', 'dropped'] },
        priority:    { type: 'string', enum: ['high', 'medium', 'low'] },
        owner_id:    { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_todo',
    description: '[DATA] Create a new to-do.',
    input_schema: {
      type: 'object',
      properties: {
        team:        { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        owner_id:    { type: 'string' },
        due_date:    { type: 'string', description: 'ISO YYYY-MM-DD' },
      },
      required: ['team', 'title'],
    },
  },
  {
    name: 'update_todo',
    description: '[DATA] Update an existing to-do — status (pending/in_progress/complete), due date, or title.',
    input_schema: {
      type: 'object',
      properties: {
        id:       { type: 'string' },
        title:    { type: 'string' },
        status:   { type: 'string', enum: ['pending', 'in_progress', 'complete'] },
        due_date: { type: 'string' },
        owner_id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_scorecard_actual',
    description: '[DATA] Set the actual value for a scorecard metric for a given team + week. Upserts on conflict.',
    input_schema: {
      type: 'object',
      properties: {
        team:        { type: 'string' },
        week_of:     { type: 'string', description: 'ISO Monday date YYYY-MM-DD' },
        metric_name: { type: 'string' },
        actual:      { type: 'number' },
        is_on_track: { type: 'boolean' },
        notes:       { type: 'string' },
      },
      required: ['team', 'week_of', 'metric_name', 'actual'],
    },
  },
  {
    name: 'update_meeting_notes',
    description: '[DATA] Update agenda notes, status, or rating on a Level 10 meeting.',
    input_schema: {
      type: 'object',
      properties: {
        id:               { type: 'string', description: 'Meeting UUID' },
        status:           { type: 'string', enum: ['scheduled', 'in_progress', 'completed'] },
        segue:            { type: 'string' },
        scorecard_notes:  { type: 'string' },
        rocks_notes:      { type: 'string' },
        headlines:        { type: 'string' },
        todos_notes:      { type: 'string' },
        ids_issues:       { type: 'string' },
        conclude_notes:   { type: 'string' },
        rating:           { type: 'integer', description: '1–10' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_vto_section',
    description: '[DATA] Update a V/TO section\'s content. section_key must be one of: core_values, core_focus, ten_year_target, marketing_strategy, three_year_picture, one_year_plan.',
    input_schema: {
      type: 'object',
      properties: {
        section_key: { type: 'string', enum: ['core_values','core_focus','ten_year_target','marketing_strategy','three_year_picture','one_year_plan'] },
        content:     { type: 'object', description: 'JSON object with the section\'s data fields — merged with existing content' },
      },
      required: ['section_key', 'content'],
    },
  },
  {
    name: 'update_accountability_seat',
    description: '[DATA] Update the owner or description of an accountability chart seat. Set owner_id (UUID) for a system user or owner_name (free text) for someone not in the roster.',
    input_schema: {
      type: 'object',
      properties: {
        id:               { type: 'string', description: 'Seat UUID from get_accountability_snapshot' },
        owner_id:         { type: 'string', description: 'UUID from list_users — clears owner_name' },
        owner_name:       { type: 'string', description: 'Free-text name — clears owner_id' },
        seat_description: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // ── CREW DATA writes ─────────────────────────────────────────────────────────
  {
    name: 'add_crew',
    description: '[DATA] Create a new crew. crew_type must be "shingle" or "metal". Defaults: shingle=600/SQ revenue, 200 SQ/week capacity; metal=1000/SQ, 100 SQ/week.',
    input_schema: {
      type: 'object',
      properties: {
        crew_name:            { type: 'string' },
        crew_type:            { type: 'string', enum: ['shingle', 'metal'] },
        team_members:         { type: 'integer', description: 'Number of people on the crew' },
        training_period_days: { type: 'integer', description: 'Days before crew is at full capacity' },
        start_date:           { type: 'string', description: 'ISO YYYY-MM-DD' },
        revenue_per_sq:       { type: 'number', description: 'Default: 600 (shingle) or 1000 (metal)' },
        weekly_sq_capacity:   { type: 'number', description: 'Default: 200 (shingle) or 100 (metal)' },
        terminate_date:       { type: 'string', description: 'ISO YYYY-MM-DD — omit for ongoing crews' },
      },
      required: ['crew_name', 'crew_type'],
    },
  },
  {
    name: 'update_crew',
    description: '[DATA] Update a crew\'s name, team size, dates, or active status. To change weekly SQ capacity or training days, use update_crew_capacity [CONFIG].',
    input_schema: {
      type: 'object',
      properties: {
        id:             { type: 'string', description: 'Crew UUID from get_crews' },
        crew_name:      { type: 'string' },
        team_members:   { type: 'integer' },
        start_date:     { type: 'string', description: 'ISO YYYY-MM-DD' },
        terminate_date: { type: 'string', description: 'ISO YYYY-MM-DD — pass null to clear' },
        is_active:      { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'deactivate_crew',
    description: '[DATA] Soft-delete a crew — sets is_active=false. The crew will no longer appear in forecasts.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Crew UUID from get_crews' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_crew_staff',
    description: '[DATA] Record the current lead/supervisor headcount for a crew. Deactivates the prior staffing record and inserts a new one.',
    input_schema: {
      type: 'object',
      properties: {
        crew_id:     { type: 'string', description: 'Crew UUID' },
        lead_count:  { type: 'integer', description: 'Number of leads (default 0)' },
        super_count: { type: 'integer', description: 'Number of supervisors (default 0)' },
        added_date:  { type: 'string', description: 'ISO YYYY-MM-DD — effective date of this staffing change' },
        notes:       { type: 'string' },
      },
      required: ['crew_id', 'added_date'],
    },
  },

  // ── MEETING DATA writes ───────────────────────────────────────────────────────
  {
    name: 'create_meeting',
    description: '[DATA] Schedule a new Level 10 meeting. team must be one of: leadership, sales, production.',
    input_schema: {
      type: 'object',
      properties: {
        team:         { type: 'string', enum: ['leadership', 'sales', 'production'] },
        meeting_date: { type: 'string', description: 'ISO YYYY-MM-DD' },
        meeting_time: { type: 'string', description: 'HH:MM (24-hour) — defaults to 08:30' },
        meeting_link: { type: 'string', description: 'Zoom/Meet URL' },
        status:       { type: 'string', enum: ['scheduled', 'in_progress', 'complete'] },
      },
      required: ['team', 'meeting_date'],
    },
  },

  // ── PIPELINE DATA writes ──────────────────────────────────────────────────────
  {
    name: 'update_pipeline_item',
    description: '[DATA] Update an existing manual pipeline item. Automatically recalculates total_revenue when square_footage or revenue_per_sq changes.',
    input_schema: {
      type: 'object',
      properties: {
        id:                           { type: 'string', description: 'Pipeline item UUID' },
        job_type:                     { type: 'string', enum: ['shingle', 'metal'] },
        square_footage:               { type: 'number' },
        revenue_per_sq:               { type: 'number' },
        estimated_days_to_completion: { type: 'integer' },
        status:                       { type: 'string', enum: ['pending', 'in_progress', 'complete'] },
        target_start_date:            { type: 'string', description: 'ISO YYYY-MM-DD' },
        notes:                        { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_pipeline_item',
    description: '[DATA] Soft-delete a manual pipeline item — removes it from production forecasts.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Pipeline item UUID' },
      },
      required: ['id'],
    },
  },

  // ── PEOPLE ANALYZER DATA writes (tool def) ───────────────────────────────────────────────
  {
    name: 'set_people_analyzer_entry',
    description: '[DATA] Create or update a quarterly People Analyzer evaluation. value_scores is an object of core-value-name → "plus", "plus_minus", or "minus".',
    input_schema: {
      type: 'object',
      properties: {
        subject_user_id: { type: 'string', description: 'User UUID from list_users' },
        quarter:         { type: 'integer', description: '1–4' },
        year:            { type: 'integer' },
        value_scores:    {
          type: 'object',
          description: 'e.g. {"Integrity": "plus", "Grit": "plus_minus"}',
          additionalProperties: { type: 'string' },
        },
        gwc_get:      { type: 'boolean', description: 'Gets it — understands their role' },
        gwc_want:     { type: 'boolean', description: 'Wants it — motivated in their role' },
        gwc_capacity: { type: 'boolean', description: 'Capacity to do it — skills and bandwidth' },
        notes:        { type: 'string' },
      },
      required: ['subject_user_id', 'quarter', 'year'],
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
    `INSERT INTO sales_forecast (forecast_week, job_type, projected_square_footage, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (forecast_week, job_type) DO UPDATE
       SET projected_square_footage = EXCLUDED.projected_square_footage,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [week, job_type, projected_square_footage, userId],
  );
  return { ok: true, written: { week, job_type, projected_square_footage } };
}

async function tool_delete_sales_forecast(input: any): Promise<any> {
  const { start_week, end_week, job_type } = input || {};
  const conditions: string[] = [];
  const values: any[] = [];
  let p = 1;
  if (start_week) { conditions.push(`forecast_week >= $${p++}`); values.push(start_week); }
  if (end_week)   { conditions.push(`forecast_week <= $${p++}`); values.push(end_week); }
  if (job_type)   { conditions.push(`job_type = $${p++}`);       values.push(job_type); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const r = await pool.query(`DELETE FROM sales_forecast ${where} RETURNING forecast_week, job_type`, values);
  return { ok: true, deleted_count: r.rowCount, deleted: r.rows };
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

// ── EOS READ ──────────────────────────────────────────────────────────────────

async function tool_list_users(input: any): Promise<any> {
  const includeRosterOnly = input?.include_roster_only !== false;
  const r = await pool.query(
    `SELECT id, email, first_name, last_name, role, team, roster_only,
            COALESCE(first_name || ' ' || last_name, email) AS name
     FROM users
     WHERE active = true ${includeRosterOnly ? '' : 'AND roster_only = false'}
     ORDER BY last_name, first_name`,
  );
  return { users: r.rows };
}

// ── EOS DATA writes ───────────────────────────────────────────────────────────

async function tool_create_rock(input: any, userId: string | null): Promise<any> {
  const { team, title, description, quarter, year, owner_id, due_date } = input || {};
  if (!team || !title) return { error: 'team and title required' };
  const r = await pool.query(
    `INSERT INTO rocks (team, title, description, quarter, year, owner_id, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, title, team, status`,
    [team, title, description || null, quarter || null, year || null, owner_id || null, due_date || null, userId],
  );
  return { ok: true, created: r.rows[0] };
}

async function tool_update_rock(input: any): Promise<any> {
  const { id, ...fields } = input || {};
  if (!id) return { error: 'id required' };
  const allowed = ['title', 'description', 'status', 'completion_percentage', 'due_date', 'owner_id'];
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { updates.push(`${key}=$${p++}`); values.push(fields[key]); }
  }
  if (!updates.length) return { error: 'No fields to update' };
  updates.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE rocks SET ${updates.join(',')} WHERE id=$${p} RETURNING id, title, status, completion_percentage`,
    values,
  );
  if (!r.rows.length) return { error: 'Rock not found' };
  return { ok: true, updated: r.rows[0] };
}

async function tool_create_issue(input: any, userId: string | null): Promise<any> {
  const { team, title, description, priority, owner_id } = input || {};
  if (!team || !title) return { error: 'team and title required' };
  const r = await pool.query(
    `INSERT INTO issues (team, title, description, priority, owner_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, team, priority, status`,
    [team, title, description || null, priority || 'medium', owner_id || null, userId],
  );
  return { ok: true, created: r.rows[0] };
}

async function tool_update_issue(input: any): Promise<any> {
  const { id, ...fields } = input || {};
  if (!id) return { error: 'id required' };
  const allowed = ['title', 'description', 'status', 'priority', 'owner_id'];
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { updates.push(`${key}=$${p++}`); values.push(fields[key]); }
  }
  if (!updates.length) return { error: 'No fields to update' };
  updates.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE issues SET ${updates.join(',')} WHERE id=$${p} RETURNING id, title, status, priority`,
    values,
  );
  if (!r.rows.length) return { error: 'Issue not found' };
  return { ok: true, updated: r.rows[0] };
}

async function tool_create_todo(input: any, userId: string | null): Promise<any> {
  const { team, title, description, owner_id, due_date } = input || {};
  if (!team || !title) return { error: 'team and title required' };
  const r = await pool.query(
    `INSERT INTO todos (team, title, description, owner_id, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, team, status, due_date`,
    [team, title, description || null, owner_id || null, due_date || null, userId],
  );
  return { ok: true, created: r.rows[0] };
}

async function tool_update_todo(input: any): Promise<any> {
  const { id, ...fields } = input || {};
  if (!id) return { error: 'id required' };
  const allowed = ['title', 'description', 'status', 'due_date', 'owner_id'];
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { updates.push(`${key}=$${p++}`); values.push(fields[key]); }
  }
  if (!updates.length) return { error: 'No fields to update' };
  updates.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE todos SET ${updates.join(',')} WHERE id=$${p} RETURNING id, title, status, due_date`,
    values,
  );
  if (!r.rows.length) return { error: 'To-do not found' };
  return { ok: true, updated: r.rows[0] };
}

async function tool_set_scorecard_actual(input: any, userId: string | null): Promise<any> {
  const { team, week_of, metric_name, actual, is_on_track, notes } = input || {};
  if (!team || !week_of || !metric_name || actual === undefined) {
    return { error: 'team, week_of, metric_name, actual required' };
  }
  await pool.query(
    `INSERT INTO scorecard_entries (team, week_of, metric_name, actual, is_on_track, notes, data_source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'manual',$7)
     ON CONFLICT (team, week_of, metric_name) DO UPDATE
       SET actual=$4, is_on_track=$5, notes=COALESCE($6, scorecard_entries.notes), updated_at=NOW()`,
    [team, week_of, metric_name, actual, is_on_track ?? null, notes || null, userId],
  );
  return { ok: true, written: { team, week_of, metric_name, actual, is_on_track } };
}

async function tool_update_meeting_notes(input: any): Promise<any> {
  const { id, ...fields } = input || {};
  if (!id) return { error: 'id required' };
  const allowed = ['status', 'segue', 'scorecard_notes', 'rocks_notes', 'headlines', 'todos_notes', 'ids_issues', 'conclude_notes', 'rating'];
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { updates.push(`${key}=$${p++}`); values.push(fields[key]); }
  }
  if (!updates.length) return { error: 'No fields to update' };
  updates.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE meetings SET ${updates.join(',')} WHERE id=$${p} RETURNING id, team, meeting_date, status, rating`,
    values,
  );
  if (!r.rows.length) return { error: 'Meeting not found' };
  return { ok: true, updated: r.rows[0] };
}

async function tool_update_vto_section(input: any, userId: string | null): Promise<any> {
  const { section_key, content } = input || {};
  if (!section_key || !content) return { error: 'section_key and content required' };
  const r = await pool.query(
    `UPDATE vto_sections SET content=$1, updated_by=$2, updated_at=NOW()
     WHERE section_key=$3 RETURNING section_key, title`,
    [JSON.stringify(content), userId, section_key],
  );
  if (!r.rows.length) return { error: `VTO section '${section_key}' not found` };
  return { ok: true, updated: r.rows[0] };
}

async function tool_update_accountability_seat(input: any): Promise<any> {
  const { id, owner_id, owner_name, seat_description } = input || {};
  if (!id) return { error: 'id required' };
  const setClauses: string[] = [];
  const values: any[] = [];
  let p = 1;
  if (owner_id !== undefined) {
    setClauses.push(`owner_id=$${p++}`, `owner_name=NULL`);
    values.push(owner_id);
  } else if (owner_name !== undefined) {
    setClauses.push(`owner_name=$${p++}`, `owner_id=NULL`);
    values.push(owner_name);
  }
  if (seat_description !== undefined) { setClauses.push(`seat_description=$${p++}`); values.push(seat_description); }
  if (!setClauses.length) return { error: 'No fields to update' };
  setClauses.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE accountability_seats SET ${setClauses.join(',')} WHERE id=$${p}
     RETURNING id, seat_name, owner_name, owner_id`,
    values,
  );
  if (!r.rows.length) return { error: 'Seat not found' };
  return { ok: true, updated: r.rows[0] };
}

// ── CREW DATA writes ──────────────────────────────────────────────────────────

async function tool_add_crew(input: any, userId: string | null): Promise<any> {
  const { crew_name, crew_type, team_members, training_period_days, start_date, revenue_per_sq, weekly_sq_capacity, terminate_date } = input || {};
  if (!crew_name || !crew_type) {
    return { error: 'crew_name and crew_type required' };
  }
  if (!['shingle', 'metal'].includes(crew_type)) return { error: 'crew_type must be "shingle" or "metal"' };
  const defaultRevenue  = crew_type === 'shingle' ? 600  : 1000;
  const defaultCapacity = crew_type === 'shingle' ? 200  : 100;
  const effectiveStartDate = start_date || new Date().toISOString().slice(0, 10);
  const r = await pool.query(
    `INSERT INTO crews (crew_name, crew_type, team_members, training_period_days, start_date,
       terminate_date, revenue_per_sq, weekly_sq_capacity, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
     RETURNING id, crew_name, crew_type, weekly_sq_capacity, revenue_per_sq`,
    [crew_name, crew_type, team_members ?? 0, training_period_days ?? 0, effectiveStartDate,
     terminate_date || null, revenue_per_sq ?? defaultRevenue, weekly_sq_capacity ?? defaultCapacity, userId],
  );
  return { ok: true, created: r.rows[0] };
}

async function tool_update_crew(input: any): Promise<any> {
  const { id, crew_name, team_members, start_date, terminate_date, is_active } = input || {};
  if (!id) return { error: 'id required' };
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  if (crew_name      !== undefined) { updates.push(`crew_name=$${p++}`);      values.push(crew_name); }
  if (team_members   !== undefined) { updates.push(`team_members=$${p++}`);   values.push(team_members); }
  if (start_date     !== undefined) { updates.push(`start_date=$${p++}`);     values.push(start_date); }
  if (terminate_date !== undefined) { updates.push(`terminate_date=$${p++}`); values.push(terminate_date || null); }
  if (is_active      !== undefined) { updates.push(`is_active=$${p++}`);      values.push(is_active); }
  if (!updates.length) return { error: 'No fields to update' };
  updates.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE crews SET ${updates.join(',')} WHERE id=$${p} RETURNING id, crew_name, is_active`,
    values,
  );
  if (!r.rows.length) return { error: 'Crew not found' };
  return { ok: true, updated: r.rows[0] };
}

async function tool_deactivate_crew(input: any): Promise<any> {
  const { id } = input || {};
  if (!id) return { error: 'id required' };
  const r = await pool.query(
    `UPDATE crews SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING id, crew_name`,
    [id],
  );
  if (!r.rows.length) return { error: 'Crew not found' };
  return { ok: true, deactivated: r.rows[0] };
}

async function tool_set_crew_staff(input: any, userId: string | null): Promise<any> {
  const { crew_id, lead_count, super_count, added_date, notes } = input || {};
  if (!crew_id || !added_date) return { error: 'crew_id and added_date required' };
  await pool.query(
    'UPDATE crew_staff SET is_active=false, updated_at=NOW() WHERE crew_id=$1 AND is_active=true',
    [crew_id],
  );
  const r = await pool.query(
    `INSERT INTO crew_staff (crew_id, lead_count, super_count, added_date, notes, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id, crew_id, lead_count, super_count, added_date`,
    [crew_id, lead_count ?? 0, super_count ?? 0, added_date, notes || null, userId],
  );
  return { ok: true, created: r.rows[0] };
}

// ── MEETING DATA writes ───────────────────────────────────────────────────────

async function tool_create_meeting(input: any, userId: string | null): Promise<any> {
  const { team, meeting_date, meeting_time, meeting_link, status } = input || {};
  if (!team || !meeting_date) return { error: 'team and meeting_date required' };
  const r = await pool.query(
    `INSERT INTO meetings (team, meeting_date, meeting_time, meeting_link, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, team, meeting_date, meeting_time, status`,
    [team, meeting_date, meeting_time || '08:30', meeting_link || null, status || 'scheduled', userId],
  );
  return { ok: true, created: r.rows[0] };
}

// ── PIPELINE DATA writes ──────────────────────────────────────────────────────

async function tool_update_pipeline_item(input: any): Promise<any> {
  const { id, job_type, square_footage, revenue_per_sq, estimated_days_to_completion, status, target_start_date, notes } = input || {};
  if (!id) return { error: 'id required' };
  const updates: string[] = [];
  const values: any[] = [];
  let p = 1;
  const newSq  = square_footage  !== undefined ? Number(square_footage)  : null;
  const newRev = revenue_per_sq  !== undefined ? Number(revenue_per_sq)  : null;
  if (job_type  !== undefined) { updates.push(`job_type=$${p++}`);  values.push(job_type); }
  if (newSq     !== null)      { updates.push(`square_footage=$${p++}`);  values.push(newSq); }
  if (newRev    !== null)      { updates.push(`revenue_per_sq=$${p++}`);  values.push(newRev); }
  if (estimated_days_to_completion !== undefined) { updates.push(`estimated_days_to_completion=$${p++}`); values.push(estimated_days_to_completion); }
  if (status    !== undefined) { updates.push(`status=$${p++}`);    values.push(status); }
  if (target_start_date !== undefined) { updates.push(`target_start_date=$${p++}`); values.push(target_start_date || null); }
  if (notes     !== undefined) { updates.push(`notes=$${p++}`);     values.push(notes || null); }
  if (!updates.length) return { error: 'No fields to update' };
  if (newSq !== null && newRev !== null) {
    updates.push(`total_revenue=$${p++}`); values.push(newSq * newRev);
  } else if (newSq !== null) {
    updates.push(`total_revenue=$${p++} * revenue_per_sq`); values.push(newSq);
  } else if (newRev !== null) {
    updates.push(`total_revenue=square_footage * $${p++}`); values.push(newRev);
  }
  updates.push('updated_at=NOW()');
  values.push(id);
  const r = await pool.query(
    `UPDATE pipeline_items SET ${updates.join(',')} WHERE id=$${p} AND is_active=true
     RETURNING id, job_type, square_footage, revenue_per_sq, total_revenue, status`,
    values,
  );
  if (!r.rows.length) return { error: 'Pipeline item not found' };
  return { ok: true, updated: r.rows[0] };
}

async function tool_delete_pipeline_item(input: any): Promise<any> {
  const { id } = input || {};
  if (!id) return { error: 'id required' };
  const r = await pool.query(
    `UPDATE pipeline_items SET is_active=false, updated_at=NOW() WHERE id=$1 AND is_active=true RETURNING id`,
    [id],
  );
  if (!r.rows.length) return { error: 'Pipeline item not found' };
  return { ok: true, deleted_id: r.rows[0].id };
}

// ── DATE READ ─────────────────────────────────────────────────────────────────

function tool_get_current_date(): any {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayOfWeek = dayNames[now.getUTCDay()];
  const dayIndex = now.getUTCDay();
  const daysBack = dayIndex === 0 ? 6 : dayIndex - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - daysBack);
  const upcomingMondays: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const d = new Date(thisMonday);
    d.setUTCDate(thisMonday.getUTCDate() + i * 7);
    upcomingMondays.push(d.toISOString().slice(0, 10));
  }
  return {
    today,
    day_of_week: dayOfWeek,
    current_week_monday: upcomingMondays[0],
    next_week_monday: upcomingMondays[1],
    upcoming_mondays: upcomingMondays,
  };
}

async function tool_set_sales_forecast_range(input: any, userId: string | null): Promise<any> {
  const { start_week, job_type, projected_square_footage, weeks_count } = input || {};
  if (!start_week || !job_type || projected_square_footage === undefined) {
    return { error: 'start_week, job_type, projected_square_footage required' };
  }
  const n = Math.min(Math.max(Number(weeks_count) || 8, 1), 52);
  const start = new Date(start_week);
  const written: Array<{ week: string; job_type: string; projected_square_footage: number }> = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i * 7);
    const week = d.toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO sales_forecast (forecast_week, job_type, projected_square_footage, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (forecast_week, job_type) DO UPDATE
         SET projected_square_footage = EXCLUDED.projected_square_footage,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [week, job_type, projected_square_footage, userId],
    );
    written.push({ week, job_type, projected_square_footage: Number(projected_square_footage) });
  }
  return { ok: true, weeks_written: written.length, written };
}

// ── PEOPLE ANALYZER DATA writes ───────────────────────────────────────────────

async function tool_set_people_analyzer_entry(input: any, userId: string | null): Promise<any> {
  const { subject_user_id, quarter, year, value_scores, gwc_get, gwc_want, gwc_capacity, notes } = input || {};
  if (!subject_user_id || !quarter || !year) {
    return { error: 'subject_user_id, quarter, year required' };
  }
  const r = await pool.query(
    `INSERT INTO people_analyzer_entries
       (subject_user_id, quarter, year, value_scores, gwc_get, gwc_want, gwc_capacity, notes, evaluated_by)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
     ON CONFLICT (subject_user_id, quarter, year) DO UPDATE SET
       value_scores = EXCLUDED.value_scores,
       gwc_get      = EXCLUDED.gwc_get,
       gwc_want     = EXCLUDED.gwc_want,
       gwc_capacity = EXCLUDED.gwc_capacity,
       notes        = EXCLUDED.notes,
       evaluated_by = EXCLUDED.evaluated_by,
       updated_at   = NOW()
     RETURNING id, subject_user_id, quarter, year, gwc_get, gwc_want, gwc_capacity`,
    [subject_user_id, quarter, year, JSON.stringify(value_scores || {}),
     gwc_get ?? null, gwc_want ?? null, gwc_capacity ?? null,
     notes?.trim() || null, userId],
  );
  return { ok: true, upserted: r.rows[0] };
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
      case 'get_current_date':               return tool_get_current_date();
      case 'get_sales_forecast':             return await tool_get_sales_forecast(input);
      case 'get_production_forecast':        return await tool_get_production_forecast(input);
      case 'get_metrics_dashboard':          return await tool_get_metrics_dashboard();
      case 'get_capacity_blocks':            return await tool_get_capacity_blocks();
      case 'get_forecaster_settings':        return await tool_get_forecaster_settings();
      case 'get_sales_rep_close_rates':      return await tool_get_sales_rep_close_rates();
      case 'simulate_production_forecast':   return await tool_simulate_production_forecast(input);
      case 'set_sales_forecast':             return await tool_set_sales_forecast(input, userId);
      case 'set_sales_forecast_range':       return await tool_set_sales_forecast_range(input, userId);
      case 'delete_sales_forecast':          return await tool_delete_sales_forecast(input);
      case 'add_capacity_block':             return await tool_add_capacity_block(input, userId);
      case 'add_pipeline_item':              return await tool_add_pipeline_item(input, userId);
      case 'update_forecaster_settings':     return await tool_update_forecaster_settings(input);
      case 'set_sales_rep_close_rate':       return await tool_set_sales_rep_close_rate(input, userId);
      case 'delete_sales_rep_close_rate':    return await tool_delete_sales_rep_close_rate(input);
      case 'update_crew_capacity':           return await tool_update_crew_capacity(input);
      // EOS READ
      case 'list_users':                    return await tool_list_users(input);
      // EOS DATA
      case 'create_rock':                   return await tool_create_rock(input, userId);
      case 'update_rock':                   return await tool_update_rock(input);
      case 'create_issue':                  return await tool_create_issue(input, userId);
      case 'update_issue':                  return await tool_update_issue(input);
      case 'create_todo':                   return await tool_create_todo(input, userId);
      case 'update_todo':                   return await tool_update_todo(input);
      case 'set_scorecard_actual':          return await tool_set_scorecard_actual(input, userId);
      case 'update_meeting_notes':          return await tool_update_meeting_notes(input);
      case 'update_vto_section':            return await tool_update_vto_section(input, userId);
      case 'update_accountability_seat':    return await tool_update_accountability_seat(input);
      // Crew DATA
      case 'add_crew':                  return await tool_add_crew(input, userId);
      case 'update_crew':               return await tool_update_crew(input);
      case 'deactivate_crew':           return await tool_deactivate_crew(input);
      case 'set_crew_staff':            return await tool_set_crew_staff(input, userId);
      // Meeting DATA
      case 'create_meeting':            return await tool_create_meeting(input, userId);
      // Pipeline DATA
      case 'update_pipeline_item':      return await tool_update_pipeline_item(input);
      case 'delete_pipeline_item':      return await tool_delete_pipeline_item(input);
      // People Analyzer DATA
      case 'set_people_analyzer_entry': return await tool_set_people_analyzer_entry(input, userId);
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

async function chatWithSystem(
  systemPrompt: string,
  disabledName: string,
  history: ChatMessage[],
  userId: string | null = null,
  model: string = FORECASTER_MODEL,
  maxTokens: number = 4096,
): Promise<ChatResult> {
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
      model,
      max_tokens: maxTokens,
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
  return chatWithSystem(FORECASTER_SYSTEM_PROMPT, 'The Forecaster AI', history, userId, FORECASTER_MODEL, 4096);
}

export async function chatWithSky(history: ChatMessage[], userId: string | null = null): Promise<ChatResult> {
  return chatWithSystem(SKY_SYSTEM_PROMPT, 'Sky', history, userId, SKY_MODEL, 1024);
}

export function isForecasterAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

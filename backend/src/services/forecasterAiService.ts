import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../config/database';
import { getJnPipelineSummary, getForecasterSettings } from './jnPipelineService';

const MODEL = process.env.FORECASTER_AI_MODEL || 'claude-sonnet-4-5';

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

const SYSTEM_PROMPT = `You are the Forecaster AI for Skyright Roofing's KPI Dashboard.

You have read-only access to live operational data via tools. You CANNOT write or update anything — any change the user wants to make must be done by them in the dashboard UI. If they ask you to update data, walk them through where to click and explain the impact.

Your job is to help leadership project, model scenarios, and surface insights from:
- The current pipeline (manual entries + live JobNimbus data)
- Active crews and their effective weekly capacity (including ramp-up)
- Sales forecast (projected weekly square footage by job type for the next 6 months)
- The 6-month production forecast (rolling pipeline depletion model)
- Current KPI metrics (12-week rolling)

Always cite numbers you reference. Show the math when you make projections. Round to whole SQs and whole dollars for clarity. When you spot something concerning (lead time blowing out, a crew under-utilized, a material out of balance), call it out proactively.

Materials are 'shingle' or 'metal'. SQ = roofing square = 100 sq ft. Lead time = weeks of backlog at current production rate. Use 4-5 wks = green, 6-8 wks = yellow, 8+ wks = red.

Be concise. Use markdown tables for multi-row data. Skip preamble.`;

// Tool definitions — Anthropic tool_use schema
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_pipeline',
    description: 'Returns the current pipeline: manual pipeline_items aggregated by material type (shingle/metal), plus a separate live JobNimbus pipeline summary with contracts_sent and work_orders by material. Use this first to understand current backlog.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_crews',
    description: 'Returns all active crews with: id, crew_name, crew_type (shingle/metal), team_members, start_date, training_period_days, weekly_sq_capacity, revenue_per_sq, lead_count, super_count. Use this to compute production capacity.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_sales_forecast',
    description: 'Returns the weekly sales forecast (projected square footage to be SOLD per week by job type) for the requested date range. Defaults to next 26 weeks.',
    input_schema: {
      type: 'object',
      properties: {
        start_week: { type: 'string', description: 'ISO date YYYY-MM-DD for first Monday (optional)' },
        end_week:   { type: 'string', description: 'ISO date YYYY-MM-DD for last Monday (optional)' },
      },
    },
  },
  {
    name: 'get_production_forecast',
    description: 'Runs the 6-month rolling production forecast and returns weekly projections: pipeline depletion, production rate, lead time, and crew events. Pass weeks=13|26|39 for 3/6/9 month outlook.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: { type: 'integer', description: 'Number of weeks to project (13, 26, or 39). Default 26.' },
      },
    },
  },
  {
    name: 'get_metrics_dashboard',
    description: 'Returns the 12-week rolling KPI dashboard: current pipeline, production rates, lead times in days, active crews, revenue projections per week. Use for snapshot of "current state".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_capacity_blocks',
    description: 'Returns active custom_projects (capacity blocks) — date ranges when specific crews are unavailable. Use this when explaining gaps in production capacity.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_forecaster_settings',
    description: 'Returns current forecaster configuration: JobNimbus material field key, closing rate, average SQs per contract.',
    input_schema: { type: 'object', properties: {} },
  },
];

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
    manual[r.job_type] = {
      sqs: Number(r.total_sqs),
      revenue: Number(r.total_revenue),
      count: Number(r.job_count),
    };
  }
  const jn = await getJnPipelineSummary();
  return {
    manual_pipeline: manual,
    jobnimbus_live: {
      shingle: jn.shingle,
      metal: jn.metal,
      unknown_material: jn.unknown,
      settings: jn.settings,
    },
    combined_sqs: {
      shingle: (manual.shingle?.sqs || 0) + jn.shingle.total_sqs + jn.unknown.total_sqs / 2,
      metal:   (manual.metal?.sqs   || 0) + jn.metal.total_sqs   + jn.unknown.total_sqs / 2,
    },
  };
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
     FROM sales_forecast
     WHERE forecast_week >= $1 AND forecast_week <= $2
     ORDER BY forecast_week, job_type`,
    [start, end]
  );
  return { start_week: start, end_week: end, forecasts: r.rows };
}

async function tool_get_production_forecast(input: any): Promise<any> {
  const weeks = Number(input?.weeks) || 26;
  // Reuse the controller logic via HTTP? Direct call is cleaner.
  const { getSixMonthForecastData } = await import('../controllers/forecastController');
  return getSixMonthForecastData(weeks);
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

async function executeTool(name: string, input: any): Promise<any> {
  try {
    switch (name) {
      case 'get_pipeline':             return await tool_get_pipeline();
      case 'get_crews':                return await tool_get_crews();
      case 'get_sales_forecast':       return await tool_get_sales_forecast(input);
      case 'get_production_forecast':  return await tool_get_production_forecast(input);
      case 'get_metrics_dashboard':    return await tool_get_metrics_dashboard();
      case 'get_capacity_blocks':      return await tool_get_capacity_blocks();
      case 'get_forecaster_settings':  return await tool_get_forecaster_settings();
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
  tool_calls: Array<{ name: string; input: any }>;
  usage?: { input_tokens: number; output_tokens: number };
}

/** Run a single user turn — handles tool-use loop internally and returns the final reply. */
export async function chatWithForecaster(history: ChatMessage[]): Promise<ChatResult> {
  const client = getClient();
  if (!client) {
    return {
      reply: '⚠️ ANTHROPIC_API_KEY is not set on the server. The Forecaster AI is disabled until an admin configures the key.',
      tool_calls: [],
    };
  }

  // Build messages in Anthropic format
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: Array<{ name: string; input: any }> = [];
  const MAX_ITERATIONS = 6;
  let usage = { input_tokens: 0, output_tokens: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
    usage.input_tokens += resp.usage.input_tokens;
    usage.output_tokens += resp.usage.output_tokens;

    if (resp.stop_reason === 'tool_use') {
      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      // Append assistant turn (contains tool_use blocks)
      messages.push({ role: 'assistant', content: resp.content });
      // Execute each tool and append a single user message with all tool_results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        toolCalls.push({ name: use.name, input: use.input });
        const result = await executeTool(use.name, use.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // stop_reason === 'end_turn' (or other terminal) — return the text content
    const reply = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { reply: reply || '(no response)', tool_calls: toolCalls, usage };
  }

  return {
    reply: '⚠️ The AI took too many tool-use iterations. Try rephrasing your question more specifically.',
    tool_calls: toolCalls,
    usage,
  };
}

export function isForecasterAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

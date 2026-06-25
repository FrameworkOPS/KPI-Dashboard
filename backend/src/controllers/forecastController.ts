import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getJnPipelineSqsByType } from '../services/jnPipelineService';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

export interface ScenarioOverrides {
  add_crews?: Array<{
    crew_name: string;
    crew_type: 'shingle' | 'metal';
    start_date: string;
    weekly_sq_capacity?: number;
    training_period_days?: number;
    terminate_date?: string | null;
  }>;
  remove_crew_ids?: string[];
  pipeline_delta?: { shingle?: number; metal?: number };  // additive SQs vs current
  sales_forecast_override?: Array<{ week: string; job_type: 'shingle' | 'metal'; projected_square_footage: number }>;
  add_capacity_blocks?: Array<{ crew_id: string; start_date: string; end_date: string }>;
}

/** Pure data function — used by HTTP handler and AI tools. Pass scenario to run a what-if without persisting. */
export async function getSixMonthForecastData(weeksParam: number = 26, scenario?: ScenarioOverrides): Promise<any> {
  const weeks = Math.min(Math.max(weeksParam, 1), 52);

  const crewsResult = await pool.query(
    `SELECT id, crew_name, crew_type, start_date, terminate_date, training_period_days, weekly_sq_capacity, revenue_per_sq, is_active
     FROM crews WHERE is_active=true ORDER BY start_date`
  );
  let crews: any[] = crewsResult.rows;
  if (scenario?.remove_crew_ids?.length) {
    const removeSet = new Set(scenario.remove_crew_ids);
    crews = crews.filter((c) => !removeSet.has(c.id));
  }
  if (scenario?.add_crews?.length) {
    for (const c of scenario.add_crews) {
      crews.push({
        id: `scenario-crew-${crews.length}`,
        crew_name: c.crew_name,
        crew_type: c.crew_type,
        start_date: c.start_date,
        terminate_date: c.terminate_date || null,
        training_period_days: c.training_period_days ?? 28,
        weekly_sq_capacity: c.weekly_sq_capacity ?? (c.crew_type === 'shingle' ? 200 : 100),
        revenue_per_sq: c.crew_type === 'shingle' ? 600 : 1000,
        is_active: true,
      });
    }
  }

  const projResult = await pool.query(
    `SELECT crew_id, project_name, start_date, end_date FROM custom_projects WHERE is_active=true`
  );
  const customProjects: any[] = [...projResult.rows];
  if (scenario?.add_capacity_blocks?.length) {
    for (const b of scenario.add_capacity_blocks) {
      customProjects.push({ crew_id: b.crew_id, project_name: 'Scenario block', start_date: b.start_date, end_date: b.end_date });
    }
  }

  // Manual pipeline + live JobNimbus pipeline — combined per material type
  const pipelineResult = await pool.query(
    `SELECT job_type, COALESCE(SUM(square_footage), 0) AS total_sqs
     FROM pipeline_items WHERE is_active=true GROUP BY job_type`
  );
  const manualMap: Record<string, number> = {};
  for (const row of pipelineResult.rows) {
    manualMap[row.job_type] = parseFloat(row.total_sqs) || 0;
  }
  let jn = { shingle: 0, metal: 0 };
  try { jn = await getJnPipelineSqsByType(); } catch { /* JN may not be configured */ }

  let rollingShingle = (manualMap['shingle'] || 0) + jn.shingle + (scenario?.pipeline_delta?.shingle || 0);
  let rollingMetal   = (manualMap['metal']   || 0) + jn.metal   + (scenario?.pipeline_delta?.metal   || 0);

  const today = new Date();
  const startWeek = getMonday(today);
  const endDate   = addDays(startWeek, weeks * 7);
  const sfResult = await pool.query(
    `SELECT forecast_week, job_type, projected_square_footage
     FROM sales_forecast
     WHERE forecast_week >= $1 AND forecast_week <= $2`,
    [formatDate(startWeek), formatDate(endDate)]
  );
  const sfMap: Record<string, Record<string, number>> = {};
  for (const row of sfResult.rows) {
    const wk = String(row.forecast_week).slice(0, 10);
    if (!sfMap[wk]) sfMap[wk] = {};
    sfMap[wk][row.job_type] = parseFloat(row.projected_square_footage) || 0;
  }
  if (scenario?.sales_forecast_override?.length) {
    for (const o of scenario.sales_forecast_override) {
      const wk = String(o.week).slice(0, 10);
      if (!sfMap[wk]) sfMap[wk] = {};
      sfMap[wk][o.job_type] = Number(o.projected_square_footage) || 0;
    }
  }

  const weeklyData = [];
  let prevCrewIds: Set<string> = new Set(crews.map((c: any) => c.id));

  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(startWeek, i * 7);
    const weekEnd   = addDays(weekStart, 6);
    const weekStr   = formatDate(weekStart);

    let prodShingle = 0;
    let prodMetal   = 0;
    const weekCrewIds = new Set<string>();
    const crewChanges: Array<{ type: string; crew_name: string; crew_type: string; date: string }> = [];
    const weekCustomProjects: Array<{ name: string; start_date: string; end_date: string }> = [];

    for (const crew of crews) {
      const crewStart = new Date(crew.start_date);
      const crewEnd   = crew.terminate_date ? new Date(crew.terminate_date) : null;
      if (crewStart > weekEnd) continue;
      if (crewEnd && crewEnd < weekStart) continue;
      weekCrewIds.add(crew.id);

      const daysSinceStart = Math.floor((weekStart.getTime() - crewStart.getTime()) / (1000 * 60 * 60 * 24));
      const rampUpDays     = crew.training_period_days || 30;
      let rampMultiplier   = daysSinceStart >= rampUpDays ? 1.0 : daysSinceStart / rampUpDays;
      if (crewEnd) {
        const daysUntilEnd = Math.floor((crewEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEnd < rampUpDays) rampMultiplier = Math.min(rampMultiplier, daysUntilEnd / rampUpDays);
      }

      const blocked = customProjects.some((p: any) => {
        if (p.crew_id !== crew.id) return false;
        const ps = new Date(p.start_date);
        const pe = new Date(p.end_date);
        return ps <= weekEnd && pe >= weekStart;
      });
      if (blocked) {
        weekCustomProjects.push(...customProjects
          .filter((p: any) => p.crew_id === crew.id && new Date(p.start_date) <= weekEnd && new Date(p.end_date) >= weekStart)
          .map((p: any) => ({ name: p.project_name, start_date: String(p.start_date).slice(0, 10), end_date: String(p.end_date).slice(0, 10) }))
        );
        continue;
      }

      const capacity = (parseFloat(crew.weekly_sq_capacity) || (crew.crew_type === 'shingle' ? 200 : 100)) * rampMultiplier;
      if (crew.crew_type === 'shingle') prodShingle += capacity;
      else if (crew.crew_type === 'metal') prodMetal += capacity;
    }

    for (const id of weekCrewIds) {
      if (!prevCrewIds.has(id)) {
        const c = crews.find((x: any) => x.id === id);
        if (c) crewChanges.push({ type: 'added', crew_name: c.crew_name, crew_type: c.crew_type, date: weekStr });
      }
    }
    for (const id of prevCrewIds) {
      if (!weekCrewIds.has(id)) {
        const c = crews.find((x: any) => x.id === id);
        if (c) crewChanges.push({ type: 'removed', crew_name: c.crew_name, crew_type: c.crew_type, date: weekStr });
      }
    }
    prevCrewIds = new Set(weekCrewIds);

    const salesShingle = sfMap[weekStr]?.['shingle'] || 0;
    const salesMetal   = sfMap[weekStr]?.['metal']   || 0;
    rollingShingle = Math.max(0, rollingShingle - prodShingle + salesShingle);
    rollingMetal   = Math.max(0, rollingMetal   - prodMetal   + salesMetal);

    const leadShingle = prodShingle > 0 ? Math.round(rollingShingle / prodShingle) : 99;
    const leadMetal   = prodMetal   > 0 ? Math.round(rollingMetal   / prodMetal)   : 99;

    weeklyData.push({
      week: weekStr,
      pipeline_sqs_shingles: Math.round(rollingShingle),
      pipeline_sqs_metal:    Math.round(rollingMetal),
      production_rate_shingles: Math.round(prodShingle),
      production_rate_metal:    Math.round(prodMetal),
      sales_forecast_shingles:  Math.round(salesShingle),
      sales_forecast_metal:     Math.round(salesMetal),
      lead_time_weeks_shingle:  Math.min(leadShingle, 99),
      lead_time_weeks_metal:    Math.min(leadMetal, 99),
      crew_changes: crewChanges,
      custom_projects: weekCustomProjects,
    });
  }

  return {
    weeks: weeklyData,
    initial_pipeline: {
      shingle: { manual: manualMap['shingle'] || 0, jobnimbus: jn.shingle, total: rollingShingle + 0 },
      metal:   { manual: manualMap['metal']   || 0, jobnimbus: jn.metal,   total: rollingMetal + 0 },
    },
  };
}

export async function getSixMonthForecast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const weeksParam = parseInt(req.query.weeks as string) || 26;
    const data = await getSixMonthForecastData(weeksParam);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

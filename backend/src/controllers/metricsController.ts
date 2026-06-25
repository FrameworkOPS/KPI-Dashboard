import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getMetricsDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const today    = new Date();
    const start    = req.query.startWeek ? new Date(req.query.startWeek as string) : getMonday(today);
    const numWeeks = 12;
    const end      = addDays(start, numWeeks * 7);

    // Active crews
    const crewsResult = await pool.query(
      `SELECT c.id, c.crew_name, c.crew_type, c.start_date, c.terminate_date,
              c.training_period_days, c.weekly_sq_capacity, c.revenue_per_sq,
              COALESCE(cs.lead_count, 0) AS lead_count,
              COALESCE(cs.super_count, 0) AS super_count
       FROM crews c
       LEFT JOIN crew_staff cs ON cs.crew_id = c.id AND cs.is_active = true
       WHERE c.is_active = true`
    );
    const crews = crewsResult.rows;

    // Custom projects (blocks)
    const projResult = await pool.query(
      `SELECT crew_id, project_name, start_date, end_date FROM custom_projects WHERE is_active=true`
    );
    const customProjects = projResult.rows;

    // Pipeline totals
    const pipelineResult = await pool.query(
      `SELECT job_type, COALESCE(SUM(square_footage), 0) AS total_sqs,
              COALESCE(SUM(total_revenue), 0) AS total_revenue,
              COUNT(*) AS job_count
       FROM pipeline_items WHERE is_active=true GROUP BY job_type`
    );
    const pipelineMap: Record<string, any> = {};
    for (const row of pipelineResult.rows) {
      pipelineMap[row.job_type] = {
        sqs: parseFloat(row.total_sqs) || 0,
        revenue: parseFloat(row.total_revenue) || 0,
        count: parseInt(row.job_count) || 0,
      };
    }

    // Sales forecasts in window
    const sfResult = await pool.query(
      `SELECT forecast_week, job_type, projected_square_footage
       FROM sales_forecast WHERE forecast_week >= $1 AND forecast_week <= $2`,
      [formatDate(start), formatDate(end)]
    );
    const sfMap: Record<string, Record<string, number>> = {};
    for (const row of sfResult.rows) {
      const wk = String(row.forecast_week).slice(0, 10);
      if (!sfMap[wk]) sfMap[wk] = {};
      sfMap[wk][row.job_type] = parseFloat(row.projected_square_footage) || 0;
    }

    // Revenue rates
    const revenuePerSq: Record<string, number> = { shingle: 600, metal: 1000 };
    for (const crew of crews) {
      if (crew.revenue_per_sq) {
        revenuePerSq[crew.crew_type] = Math.max(revenuePerSq[crew.crew_type] || 0, parseFloat(crew.revenue_per_sq));
      }
    }

    // Build 12-week rolling metrics
    let rollingShingle = pipelineMap['shingle']?.sqs || 0;
    let rollingMetal   = pipelineMap['metal']?.sqs   || 0;
    const weeklyMetrics = [];

    for (let i = 0; i < numWeeks; i++) {
      const weekStart = addDays(start, i * 7);
      const weekEnd   = addDays(weekStart, 6);
      const weekStr   = formatDate(weekStart);

      let prodShingle = 0;
      let prodMetal   = 0;
      const crewDetails: any[] = [];

      for (const crew of crews) {
        const crewStart = new Date(crew.start_date);
        const crewEnd   = crew.terminate_date ? new Date(crew.terminate_date) : null;
        if (crewStart > weekEnd) continue;
        if (crewEnd && crewEnd < weekStart) continue;

        const daysSinceStart = Math.max(0, Math.floor((weekStart.getTime() - crewStart.getTime()) / (1000 * 60 * 60 * 24)));
        const rampDays = crew.training_period_days || 30;
        const rampPct  = daysSinceStart >= rampDays ? 1.0 : daysSinceStart / rampDays;

        const blocked = customProjects.some((p: any) =>
          p.crew_id === crew.id && new Date(p.start_date) <= weekEnd && new Date(p.end_date) >= weekStart
        );

        const baseCap  = parseFloat(crew.weekly_sq_capacity) || (crew.crew_type === 'shingle' ? 200 : 100);
        const effCap   = blocked ? 0 : baseCap * rampPct;

        if (crew.crew_type === 'shingle') prodShingle += effCap;
        else if (crew.crew_type === 'metal') prodMetal += effCap;

        crewDetails.push({
          id: crew.id,
          crew_name: crew.crew_name,
          crew_type: crew.crew_type,
          weekly_sq_capacity: baseCap,
          effective_capacity: Math.round(effCap),
          ramp_pct: Math.round(rampPct * 100),
          is_blocked: blocked,
          lead_count: parseInt(crew.lead_count) || 0,
          super_count: parseInt(crew.super_count) || 0,
        });
      }

      const salesShingle = sfMap[weekStr]?.['shingle'] || 0;
      const salesMetal   = sfMap[weekStr]?.['metal']   || 0;

      const prevShingle = rollingShingle;
      const prevMetal   = rollingMetal;
      rollingShingle = Math.max(0, rollingShingle - prodShingle + salesShingle);
      rollingMetal   = Math.max(0, rollingMetal   - prodMetal   + salesMetal);

      const leadShingle = prodShingle > 0 ? prevShingle / prodShingle : 99;
      const leadMetal   = prodMetal   > 0 ? prevMetal   / prodMetal   : 99;

      weeklyMetrics.push({
        week: weekStr,
        pipeline_sqs_shingle:      Math.round(prevShingle),
        pipeline_sqs_metal:        Math.round(prevMetal),
        production_rate_shingle:   Math.round(prodShingle),
        production_rate_metal:     Math.round(prodMetal),
        sales_forecast_shingle:    Math.round(salesShingle),
        sales_forecast_metal:      Math.round(salesMetal),
        lead_time_days_shingle:    Math.round(leadShingle * 7),
        lead_time_days_metal:      Math.round(leadMetal * 7),
        revenue_shingle:           Math.round(prodShingle * (revenuePerSq['shingle'] || 600)),
        revenue_metal:             Math.round(prodMetal   * (revenuePerSq['metal']   || 1000)),
        crew_details:              i === 0 ? crewDetails : [],
      });
    }

    // Current week summary
    const current = weeklyMetrics[0] || {};
    const totalLeads  = crews.reduce((s: number, c: any) => s + (parseInt(c.lead_count)  || 0), 0);
    const totalSupers = crews.reduce((s: number, c: any) => s + (parseInt(c.super_count) || 0), 0);

    res.json({
      success: true,
      data: {
        current: {
          pipeline_shingle:    pipelineMap['shingle']?.sqs     || 0,
          pipeline_metal:      pipelineMap['metal']?.sqs       || 0,
          production_shingle:  current.production_rate_shingle || 0,
          production_metal:    current.production_rate_metal   || 0,
          lead_time_shingle:   current.lead_time_days_shingle  || 0,
          lead_time_metal:     current.lead_time_days_metal    || 0,
          active_crews:        crews.length,
          total_leads:         totalLeads,
          total_supers:        totalSupers,
          revenue_shingle:     current.revenue_shingle         || 0,
          revenue_metal:       current.revenue_metal           || 0,
        },
        weeks: weeklyMetrics,
        crew_details: weeklyMetrics[0]?.crew_details || [],
      },
    });
  } catch (err) { next(err); }
}

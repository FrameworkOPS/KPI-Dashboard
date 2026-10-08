import { pool } from '../config/database';

export interface ScorecardTemplate {
  goal: number | null;
  goal_text: string | null;
  display_format: string;
  lower_is_better: boolean;
}

/** On track means meeting the goal in the metric's direction. */
export function computeOnTrack(
  goal: number | null | undefined,
  actual: number | null | undefined,
  lowerIsBetter: boolean,
): boolean | null {
  if (goal == null || actual == null) return null;
  return lowerIsBetter ? actual <= goal : actual >= goal;
}

/** The template that defines a metric, or null when it has none. */
export async function scorecardTemplateFor(team: string, metricName: string): Promise<ScorecardTemplate | null> {
  const result = await pool.query(
    `SELECT goal, goal_text, display_format, lower_is_better
       FROM scorecard_templates WHERE team = $1 AND metric_name = $2`,
    [team, metricName],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    goal: row.goal !== null ? Number(row.goal) : null,
    goal_text: row.goal_text,
    display_format: row.display_format || 'number',
    lower_is_better: row.lower_is_better === true,
  };
}

import { Response, NextFunction } from 'express';
import { pool, query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';

export async function getScorecardEntries(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, week } = req.query;
    const user = req.user!;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`se.team = $${paramCount++}`);
      values.push(team);
    } else {
      // Filter by user's accessible teams
      if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
        conditions.push(`se.team = $${paramCount++}`);
        values.push(user.team);
      }
    }

    if (week) {
      conditions.push(`se.week_of = $${paramCount++}`);
      values.push(week);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT se.*, u.first_name, u.last_name, u.email
       FROM scorecard_entries se
       LEFT JOIN users u ON se.created_by = u.id
       ${whereClause}
       ORDER BY se.week_of DESC, se.team, se.metric_name`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createScorecardEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, week_of, metric_name, goal, actual, data_source, notes } = req.body;
    const user = req.user!;

    if (!team || !week_of || !metric_name) {
      res.status(400).json({ error: 'team, week_of, and metric_name are required' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const isOnTrack = goal != null && actual != null ? actual >= goal : null;

    const result = await pool.query(
      `INSERT INTO scorecard_entries
         (team, week_of, metric_name, goal, actual, is_on_track, data_source, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (team, week_of, metric_name) DO UPDATE SET
         goal = EXCLUDED.goal,
         actual = EXCLUDED.actual,
         is_on_track = EXCLUDED.is_on_track,
         data_source = EXCLUDED.data_source,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [team, week_of, metric_name, goal ?? null, actual ?? null, isOnTrack, data_source || 'manual', notes || null, user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateScorecardEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { goal, actual, is_on_track, data_source, notes, metric_name } = req.body;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM scorecard_entries WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Scorecard entry not found' });
      return;
    }

    const entry = existing.rows[0];
    if (!canAccessTeam(user.role, user.team, entry.team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const updatedGoal = goal !== undefined ? goal : entry.goal;
    const updatedActual = actual !== undefined ? actual : entry.actual;
    const computedIsOnTrack = is_on_track !== undefined
      ? is_on_track
      : (updatedGoal != null && updatedActual != null ? updatedActual >= updatedGoal : null);

    const result = await pool.query(
      `UPDATE scorecard_entries SET
         metric_name = COALESCE($1, metric_name),
         goal = $2,
         actual = $3,
         is_on_track = $4,
         data_source = COALESCE($5, data_source),
         notes = $6,
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [metric_name || null, updatedGoal, updatedActual, computedIsOnTrack, data_source || null, notes !== undefined ? notes : entry.notes, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteScorecardEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM scorecard_entries WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Scorecard entry not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    if (user.role === 'manager' && existing.rows[0].created_by !== user.id) {
      res.status(403).json({ error: 'You can only delete your own entries' });
      return;
    }

    await pool.query('DELETE FROM scorecard_entries WHERE id = $1', [id]);
    res.json({ message: 'Scorecard entry deleted' });
  } catch (err) {
    next(err);
  }
}

export async function getTemplates(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = req.query.team as string | undefined;
    const userTeam = req.user?.team;
    const userRole = req.user?.role;

    let targetTeam = team;
    if (userRole === 'manager' && userTeam !== 'all') {
      targetTeam = userTeam;
    }

    const whereClause = targetTeam ? 'WHERE team = $1 AND is_active = true' : 'WHERE is_active = true';
    const params = targetTeam ? [targetTeam] : [];

    const result = await query(
      `SELECT * FROM scorecard_templates ${whereClause} ORDER BY team, sort_order`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function getScorecardHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, weeks: weeksParam } = req.query;
    const user = req.user!;
    const numWeeks = Math.min(parseInt(String(weeksParam || '13')) || 13, 52);

    // Current Monday
    const now = new Date();
    const dow = now.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() + diff);
    currentMonday.setHours(0, 0, 0, 0);
    const toISO = (d: Date) => d.toISOString().split('T')[0];

    // Window start
    const startMonday = new Date(currentMonday);
    startMonday.setDate(startMonday.getDate() - (numWeeks - 1) * 7);

    // Ordered list of week dates (oldest → newest)
    const weekDates: string[] = [];
    for (let i = 0; i < numWeeks; i++) {
      const d = new Date(startMonday);
      d.setDate(d.getDate() + i * 7);
      weekDates.push(toISO(d));
    }

    const conditions: string[] = [`se.week_of >= $1`, `se.week_of <= $2`];
    const values: unknown[] = [toISO(startMonday), toISO(currentMonday)];
    let p = 3;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`se.team = $${p++}`);
      values.push(team);
    } else if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
      conditions.push(`se.team = $${p++}`);
      values.push(user.team);
    }

    const result = await pool.query(
      `SELECT se.*,
              COALESCE(st.sort_order, se.sort_order, 9999) AS effective_sort
       FROM scorecard_entries se
       LEFT JOIN scorecard_templates st
         ON st.team = se.team AND st.metric_name = se.metric_name AND st.is_active = true
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(st.sort_order, se.sort_order, 9999), se.team, se.metric_name, se.week_of`,
      values,
    );

    interface WeekEntry {
      id: string; actual: number | null; is_on_track: boolean | null;
      data_source: string; notes: string | null;
    }
    interface MetricRow {
      metric_name: string; team: string; display_format: string;
      goal: number | null; goal_text: string | null; lower_is_better: boolean;
      sort_order: number; data: Record<string, WeekEntry>;
    }

    const metricMap = new Map<string, MetricRow>();

    for (const row of result.rows) {
      const key = `${row.team}||${row.metric_name}`;
      if (!metricMap.has(key)) {
        metricMap.set(key, {
          metric_name: row.metric_name,
          team: row.team,
          display_format: row.display_format || 'number',
          goal: row.goal !== null ? Number(row.goal) : null,
          goal_text: row.goal_text,
          lower_is_better: row.lower_is_better ?? false,
          sort_order: Number(row.effective_sort),
          data: {},
        });
      }
      const m = metricMap.get(key)!;
      const weekKey = typeof row.week_of === 'string'
        ? row.week_of.split('T')[0]
        : toISO(new Date(row.week_of));
      m.data[weekKey] = {
        id: row.id,
        actual: row.actual !== null ? Number(row.actual) : null,
        is_on_track: row.is_on_track,
        data_source: row.data_source,
        notes: row.notes,
      };
      if (row.goal !== null) m.goal = Number(row.goal);
      if (row.goal_text !== null) m.goal_text = row.goal_text;
    }

    const metrics = Array.from(metricMap.values())
      .sort((a, b) => a.sort_order - b.sort_order || a.metric_name.localeCompare(b.metric_name));

    res.json({ weeks: weekDates, metrics });
  } catch (err) {
    next(err);
  }
}

export async function createWeekFromTemplate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, week_of } = req.body;
    if (!team || !week_of) {
      res.status(400).json({ error: 'team and week_of are required' });
      return;
    }

    // Get templates for this team
    const templates = await query(
      'SELECT * FROM scorecard_templates WHERE team = $1 AND is_active = true ORDER BY sort_order',
      [team]
    );

    if (templates.rows.length === 0) {
      res.status(404).json({ error: 'No templates found for this team' });
      return;
    }

    // Insert entries (skip if already exist)
    let created = 0;
    for (const t of templates.rows) {
      const existing = await query(
        'SELECT id FROM scorecard_entries WHERE team=$1 AND week_of=$2 AND metric_name=$3',
        [team, week_of, t.metric_name]
      );
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO scorecard_entries
           (team, week_of, metric_name, goal, goal_text, display_format, lower_is_better, data_source, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8)`,
          [team, week_of, t.metric_name, t.goal, t.goal_text, t.display_format, t.lower_is_better, req.user?.id]
        );
        created++;
      }
    }

    res.json({ message: `Created ${created} entries for week of ${week_of}`, created });
  } catch (err) {
    next(err);
  }
}

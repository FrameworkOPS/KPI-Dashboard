import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';
import { sendMeetingReminder } from '../services/emailService';

// EOS Level 10 meeting agenda — keep in sync with the frontend MeetingRunner.
// `sort_order` drives the wizard, `planned_minutes` drives the per-stage timer.
const MEETING_STAGES: { key: string; label: string; minutes: number }[] = [
  { key: 'segue',     label: 'Segue',           minutes: 5 },
  { key: 'scorecard', label: 'Scorecard',       minutes: 5 },
  { key: 'rocks',     label: 'Rock Review',     minutes: 5 },
  { key: 'headlines', label: 'Headlines',       minutes: 5 },
  { key: 'todos',     label: 'To-Do List',      minutes: 5 },
  { key: 'ids',       label: 'IDS — Issues',    minutes: 60 },
  { key: 'conclude',  label: 'Conclude',        minutes: 5 },
];

// Recurring meeting rules: every week, one meeting per team on the named day at
// 08:30 (interpreted as the team's local time by the calendar/reminder layer).
// dayOfWeek follows JS conventions: 0=Sun, 1=Mon, …
const RECURRING_RULES: { team: string; dayOfWeek: number; time: string }[] = [
  { team: 'production', dayOfWeek: 2, time: '08:30' }, // Tuesday
  { team: 'leadership', dayOfWeek: 3, time: '08:30' }, // Wednesday
  { team: 'sales',      dayOfWeek: 4, time: '08:30' }, // Thursday
];

function weekDateForDow(reference: Date, targetDow: number): string {
  // Returns YYYY-MM-DD for the given day-of-week within the same week (Mon-start)
  // containing `reference`.
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const currentDow = d.getDay(); // 0=Sun..6=Sat
  // Treat Monday as the week anchor: shift so Mon=0..Sun=6
  const fromMon = (currentDow + 6) % 7;
  const targetFromMon = (targetDow + 6) % 7;
  d.setDate(d.getDate() - fromMon + targetFromMon);
  return d.toISOString().split('T')[0];
}

// Lazily ensure the recurring meeting rows exist for the current and next week.
// Idempotent — uses the (team, meeting_date) unique index. Safe to call on
// every GET /meetings.
async function ensureRecurringMeetings(): Promise<void> {
  const now = new Date();
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7);
  for (const rule of RECURRING_RULES) {
    for (const ref of [now, nextWeek]) {
      const date = weekDateForDow(ref, rule.dayOfWeek);
      // EXISTS-check insert: avoids needing a unique constraint on
      // (team, meeting_date), which we can't add safely if old deploys have
      // duplicate manual rows for the same team on the same day.
      await pool.query(
        `INSERT INTO meetings (team, meeting_date, meeting_time, status, is_recurring)
         SELECT $1, $2::DATE, $3, 'scheduled', true
         WHERE NOT EXISTS (
           SELECT 1 FROM meetings WHERE team = $1 AND meeting_date = $2::DATE
         )`,
        [rule.team, date, rule.time],
      );
    }
  }
}

export async function getMeetings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureRecurringMeetings();
    const { team } = req.query;
    const user = req.user!;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (team) {
      if (!canAccessTeam(user.role, user.team, team as string, user.teams)) {
        res.status(403).json({ error: 'Access to this team is not allowed' });
        return;
      }
      conditions.push(`m.team = $${paramCount++}`);
      values.push(team);
    } else if (user.role !== 'admin' && user.role !== 'leadership' && user.team !== 'all') {
      conditions.push(`m.team = $${paramCount++}`);
      values.push(user.team);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT m.*,
         u.first_name AS creator_first_name, u.last_name AS creator_last_name, u.email AS creator_email
       FROM meetings m
       LEFT JOIN users u ON m.created_by = u.id
       ${whereClause}
       ORDER BY m.meeting_date DESC, m.created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      team, meeting_date, meeting_time, meeting_link, attendee_emails,
      segue, scorecard_notes, rocks_notes,
      headlines, todos_notes, ids_issues, conclude_notes, rating, status,
    } = req.body;
    const user = req.user!;

    if (!team || !meeting_date) {
      res.status(400).json({ error: 'team and meeting_date are required' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    if (rating !== undefined && (rating < 1 || rating > 10)) {
      res.status(400).json({ error: 'Rating must be between 1 and 10' });
      return;
    }

    const validStatuses = ['scheduled', 'in_progress', 'complete'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `INSERT INTO meetings
         (team, meeting_date, meeting_time, meeting_link, attendee_emails,
          segue, scorecard_notes, rocks_notes, headlines,
          todos_notes, ids_issues, conclude_notes, rating, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        team, meeting_date,
        meeting_time || null,
        meeting_link || null,
        attendee_emails ? JSON.stringify(attendee_emails) : null,
        segue || null, scorecard_notes || null, rocks_notes || null,
        headlines || null, todos_notes || null, ids_issues || null,
        conclude_notes || null, rating || null, status || 'scheduled', user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    const {
      meeting_time, meeting_link, attendee_emails,
      segue, scorecard_notes, rocks_notes, headlines,
      todos_notes, ids_issues, conclude_notes, rating, status,
    } = req.body;

    if (rating !== undefined && (rating < 1 || rating > 10)) {
      res.status(400).json({ error: 'Rating must be between 1 and 10' });
      return;
    }

    // Dynamic update — only set columns that were provided
    const sets: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    // Core columns (always present)
    const coreFields: Record<string, unknown> = {
      segue, scorecard_notes, rocks_notes, headlines,
      todos_notes, ids_issues, conclude_notes, rating, status,
    };
    for (const [col, val] of Object.entries(coreFields)) {
      if (val !== undefined) {
        sets.push(`${col} = $${p++}`);
        values.push(val === '' ? null : val);
      }
    }

    // New columns — check if they exist before trying to set them
    let hasNewCols = true;
    try {
      await pool.query(`SELECT meeting_time FROM meetings LIMIT 0`);
    } catch {
      hasNewCols = false;
    }

    if (hasNewCols) {
      if (meeting_time !== undefined) { sets.push(`meeting_time = $${p++}`);     values.push(meeting_time || null); }
      if (meeting_link !== undefined) { sets.push(`meeting_link = $${p++}`);     values.push(meeting_link || null); }
      if (attendee_emails !== undefined) {
        sets.push(`attendee_emails = $${p++}`);
        values.push(Array.isArray(attendee_emails) ? JSON.stringify(attendee_emails) : attendee_emails);
      }
    }

    if (sets.length === 0) {
      // Nothing to update — return current row
      res.json(existing.rows[0]);
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE meetings SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM meetings WHERE id = $1', [id]);
    res.json({ message: 'Meeting deleted' });
  } catch (err) {
    next(err);
  }
}

export async function exportIcs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    const meeting = result.rows[0];
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const dateStr = meeting.meeting_date.toISOString
      ? meeting.meeting_date.toISOString().split('T')[0].replace(/-/g, '')
      : String(meeting.meeting_date).split('T')[0].replace(/-/g, '');

    const timeRaw = (meeting.meeting_time || '09:00').replace(':', '');
    const timeStr = timeRaw.length === 4 ? timeRaw + '00' : timeRaw;
    const endHour = (parseInt(timeStr.slice(0, 2)) + 1).toString().padStart(2, '0');
    const endStr = endHour + timeStr.slice(2);

    const teamLabel = meeting.team.charAt(0).toUpperCase() + meeting.team.slice(1);
    const summary = `${teamLabel} Team — Level 10 Meeting`;
    const description = meeting.meeting_link ? `Join: ${meeting.meeting_link}` : 'FrameworkOPS Level 10 Meeting';
    const location = meeting.meeting_link || '';
    const uid = `${meeting.id}@kpi-dashboard`;
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FrameworkOPS KPI Dashboard//Meeting//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dateStr}T${timeStr}`,
      `DTEND:${dateStr}T${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-${dateStr}.ics"`);
    res.send(ics);
  } catch (err) {
    next(err);
  }
}

export async function sendReminder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const result = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    const meeting = result.rows[0];
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, meeting.team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    // Build recipient list: attendee_emails stored in meeting, plus optionally from query
    let recipients: string[] = [];
    if (meeting.attendee_emails) {
      try {
        const parsed = typeof meeting.attendee_emails === 'string'
          ? JSON.parse(meeting.attendee_emails)
          : meeting.attendee_emails;
        recipients = Array.isArray(parsed) ? parsed : [];
      } catch { /* ignore */ }
    }

    // Allow additional/override emails in request body
    if (req.body.emails && Array.isArray(req.body.emails)) {
      recipients = req.body.emails;
    }

    if (recipients.length === 0) {
      res.status(400).json({ error: 'No recipient emails found. Add attendee emails to the meeting or provide emails in the request body.' });
      return;
    }

    const dateStr = new Date(meeting.meeting_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = meeting.meeting_time || '9:00 AM';
    const teamName = meeting.team.charAt(0).toUpperCase() + meeting.team.slice(1);

    await sendMeetingReminder({
      to: recipients,
      teamName,
      meetingDate: dateStr,
      meetingTime: timeStr,
      meetingLink: meeting.meeting_link || null,
      appUrl: process.env.APP_URL || 'https://web-production-c3567.up.railway.app',
    });

    // Mark reminder as sent
    await pool.query(
      'UPDATE meetings SET reminder_sent = true, updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ success: true, sent_to: recipients });
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('SMTP_')) {
      res.status(503).json({ error: 'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in environment variables.' });
      return;
    }
    next(err);
  }
}

// ── Meeting runner: stages + attendance ────────────────────────────────────────

async function loadStages(meetingId: unknown) {
  const r = await pool.query(
    'SELECT * FROM meeting_stages WHERE meeting_id = $1 ORDER BY sort_order',
    [meetingId],
  );
  return r.rows;
}

async function loadAttendance(meetingId: unknown) {
  const r = await pool.query(
    `SELECT a.*, u.first_name, u.last_name, u.email
       FROM meeting_attendance a
       JOIN users u ON a.user_id = u.id
      WHERE a.meeting_id = $1
      ORDER BY u.first_name, u.last_name`,
    [meetingId],
  );
  return r.rows;
}

// Start the meeting: seed the 7 EOS stages if not already present, mark the
// first stage as started, flip the meeting to in_progress, and seed an
// attendance row for every active user on the team.
export async function startMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    const meeting = existing.rows[0];
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    if (!canAccessTeam(user.role, user.team, meeting.team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    // Seed stages (no-op on conflict)
    for (let i = 0; i < MEETING_STAGES.length; i++) {
      const s = MEETING_STAGES[i];
      await pool.query(
        `INSERT INTO meeting_stages (meeting_id, stage_key, label, planned_minutes, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (meeting_id, stage_key) DO NOTHING`,
        [id, s.key, s.label, s.minutes, i],
      );
    }

    // Start the first stage if nothing has started yet
    await pool.query(
      `UPDATE meeting_stages
          SET started_at = COALESCE(started_at, NOW())
        WHERE meeting_id = $1 AND sort_order = 0`,
      [id],
    );

    // Seed attendance rows for every active user on the team (multi-team aware).
    // ON CONFLICT preserves any prior status / rating.
    await pool.query(
      `INSERT INTO meeting_attendance (meeting_id, user_id, status)
       SELECT $1, u.id, 'present'
         FROM users u
        WHERE u.active = true
          AND (u.team = $2 OR u.teams ? $2)
       ON CONFLICT (meeting_id, user_id) DO NOTHING`,
      [id, meeting.team],
    );

    // Flip meeting status
    await pool.query(
      `UPDATE meetings
          SET status = 'in_progress',
              started_at = COALESCE(started_at, NOW()),
              updated_at = NOW()
        WHERE id = $1`,
      [id],
    );

    const stages = await loadStages(id);
    const attendance = await loadAttendance(id);
    const updated = (await pool.query('SELECT * FROM meetings WHERE id = $1', [id])).rows[0];
    res.json({ meeting: updated, stages, attendance });
  } catch (err) {
    next(err);
  }
}

export async function getMeetingStages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const stages = await loadStages(id);
    const attendance = await loadAttendance(id);
    res.json({ stages, attendance });
  } catch (err) {
    next(err);
  }
}

// Advance to the next stage: mark the current one complete and start the next.
// Accepts stage_key in the body for idempotency / out-of-order safety.
export async function advanceStage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { stage_key } = req.body as { stage_key?: string };
    const user = req.user!;

    const meeting = (await pool.query('SELECT team FROM meetings WHERE id = $1', [id])).rows[0];
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    if (!canAccessTeam(user.role, user.team, meeting.team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    // Find the stage to complete: either explicit key, or the first
    // in-progress stage.
    const current = stage_key
      ? (await pool.query(
          'SELECT * FROM meeting_stages WHERE meeting_id = $1 AND stage_key = $2',
          [id, stage_key],
        )).rows[0]
      : (await pool.query(
          `SELECT * FROM meeting_stages
            WHERE meeting_id = $1 AND completed_at IS NULL
            ORDER BY sort_order LIMIT 1`,
          [id],
        )).rows[0];

    if (!current) {
      res.status(400).json({ error: 'No active stage to advance' });
      return;
    }

    await pool.query(
      `UPDATE meeting_stages
          SET completed_at = COALESCE(completed_at, NOW()),
              started_at   = COALESCE(started_at, NOW())
        WHERE id = $1`,
      [current.id],
    );

    // Start the next stage if one exists
    await pool.query(
      `UPDATE meeting_stages
          SET started_at = COALESCE(started_at, NOW())
        WHERE meeting_id = $1
          AND sort_order = $2`,
      [id, current.sort_order + 1],
    );

    const stages = await loadStages(id);
    res.json({ stages });
  } catch (err) {
    next(err);
  }
}

// Complete the meeting: capture attendance + per-attendee ratings, compute the
// overall meeting rating as the mean of present attendees' ratings, and stamp
// the meeting complete.
export async function completeMeeting(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { attendance } = req.body as {
      attendance?: { user_id: string; status: 'present' | 'absent'; rating?: number | null; comments?: string | null }[];
    };

    const meeting = (await pool.query('SELECT team FROM meetings WHERE id = $1', [id])).rows[0];
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    if (!canAccessTeam(user.role, user.team, meeting.team, user.teams)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    if (Array.isArray(attendance)) {
      for (const a of attendance) {
        if (!a.user_id) continue;
        const status = a.status === 'absent' ? 'absent' : 'present';
        const rating = status === 'absent' ? null
          : (a.rating != null && a.rating >= 1 && a.rating <= 10 ? Math.round(a.rating) : null);
        await pool.query(
          `INSERT INTO meeting_attendance (meeting_id, user_id, status, rating, comments)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (meeting_id, user_id) DO UPDATE SET
             status   = EXCLUDED.status,
             rating   = EXCLUDED.rating,
             comments = EXCLUDED.comments,
             updated_at = NOW()`,
          [id, a.user_id, status, rating, a.comments || null],
        );
      }
    }

    // Close any still-open stages
    await pool.query(
      `UPDATE meeting_stages
          SET completed_at = COALESCE(completed_at, NOW()),
              started_at   = COALESCE(started_at, NOW())
        WHERE meeting_id = $1 AND completed_at IS NULL`,
      [id],
    );

    // Overall rating = average of present attendees' ratings (rounded to int).
    const avg = await pool.query(
      `SELECT ROUND(AVG(rating))::INT AS avg_rating
         FROM meeting_attendance
        WHERE meeting_id = $1 AND status = 'present' AND rating IS NOT NULL`,
      [id],
    );
    const overall = avg.rows[0]?.avg_rating ?? null;

    await pool.query(
      `UPDATE meetings
          SET status = 'complete',
              rating = COALESCE($2, rating),
              completed_at = COALESCE(completed_at, NOW()),
              updated_at = NOW()
        WHERE id = $1`,
      [id, overall],
    );

    const updated = (await pool.query('SELECT * FROM meetings WHERE id = $1', [id])).rows[0];
    const stages = await loadStages(id);
    const att = await loadAttendance(id);
    res.json({ meeting: updated, stages, attendance: att });
  } catch (err) {
    next(err);
  }
}

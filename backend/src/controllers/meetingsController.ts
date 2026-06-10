import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { canAccessTeam } from '../utils/auth';
import { sendMeetingReminder } from '../services/emailService';

export async function getMeetings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
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

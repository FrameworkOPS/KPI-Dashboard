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
      if (!canAccessTeam(user.role, user.team, team as string)) {
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

    if (!canAccessTeam(user.role, user.team, team)) {
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
    const {
      meeting_time, meeting_link, attendee_emails,
      segue, scorecard_notes, rocks_notes, headlines,
      todos_notes, ids_issues, conclude_notes, rating, status,
    } = req.body;
    const user = req.user!;

    const existing = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    if (rating !== undefined && (rating < 1 || rating > 10)) {
      res.status(400).json({ error: 'Rating must be between 1 and 10' });
      return;
    }

    const result = await pool.query(
      `UPDATE meetings SET
         meeting_time = COALESCE($1, meeting_time),
         meeting_link = COALESCE($2, meeting_link),
         attendee_emails = COALESCE($3, attendee_emails),
         segue = COALESCE($4, segue),
         scorecard_notes = COALESCE($5, scorecard_notes),
         rocks_notes = COALESCE($6, rocks_notes),
         headlines = COALESCE($7, headlines),
         todos_notes = COALESCE($8, todos_notes),
         ids_issues = COALESCE($9, ids_issues),
         conclude_notes = COALESCE($10, conclude_notes),
         rating = COALESCE($11, rating),
         status = COALESCE($12, status),
         updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        meeting_time !== undefined ? meeting_time : null,
        meeting_link !== undefined ? meeting_link : null,
        attendee_emails !== undefined ? JSON.stringify(attendee_emails) : null,
        segue !== undefined ? segue : null,
        scorecard_notes !== undefined ? scorecard_notes : null,
        rocks_notes !== undefined ? rocks_notes : null,
        headlines !== undefined ? headlines : null,
        todos_notes !== undefined ? todos_notes : null,
        ids_issues !== undefined ? ids_issues : null,
        conclude_notes !== undefined ? conclude_notes : null,
        rating !== undefined ? rating : null,
        status || null,
        id,
      ]
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

    if (!canAccessTeam(user.role, user.team, existing.rows[0].team)) {
      res.status(403).json({ error: 'Access to this team is not allowed' });
      return;
    }

    await pool.query('DELETE FROM meetings WHERE id = $1', [id]);
    res.json({ message: 'Meeting deleted' });
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

    if (!canAccessTeam(user.role, user.team, meeting.team)) {
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

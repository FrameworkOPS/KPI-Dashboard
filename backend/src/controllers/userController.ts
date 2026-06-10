import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { sendInvitationEmail, isEmailConfigured } from '../services/emailService';

const VALID_ROLES = ['admin', 'leadership', 'manager', 'team_member'];
const VALID_TEAMS = ['sales', 'production', 'office', 'leadership', 'all'];

function appUrl(): string {
  return process.env.APP_URL || 'https://web-production-c3567.up.railway.app';
}

function makeInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Best meeting link for a team: prefer an upcoming meeting, else the most recent.
async function teamMeetingLink(team: string): Promise<string | null> {
  try {
    const r = await pool.query(
      `SELECT meeting_link FROM meetings
       WHERE team = $1 AND meeting_link IS NOT NULL AND meeting_link <> ''
       ORDER BY (meeting_date >= CURRENT_DATE) DESC, meeting_date ASC
       LIMIT 1`,
      [team],
    );
    return r.rows[0]?.meeting_link || null;
  } catch {
    return null;
  }
}

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, team, active, roster_only, job_duties, created_at,
              (invite_token IS NOT NULL) AS invited
       FROM users
       ORDER BY first_name, last_name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, first_name, last_name, role, team, active, invite, roster_only, job_duties } = req.body;
    const wantsInvite = invite === true || invite === 'true';
    const isRosterOnly = roster_only === true || roster_only === 'true';

    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }
    if (team && !VALID_TEAMS.includes(team)) {
      res.status(400).json({ error: `team must be one of: ${VALID_TEAMS.join(', ')}` });
      return;
    }
    if (!isRosterOnly && !email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!isRosterOnly) {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'A user with that email already exists' });
        return;
      }
    }

    let password_hash: string | null = null;
    let inviteToken: string | null = null;
    let inviteExpires: Date | null = null;
    let isActive: boolean;
    let emailValue: string | null = null;

    if (isRosterOnly) {
      // Org-chart-only person: no auth, can never log in (active=false + no hash).
      password_hash = null;
      isActive = false;
      emailValue = email ? email.toLowerCase().trim() : null;
    } else if (wantsInvite) {
      // Invited users get an unusable random password + are inactive until they accept.
      password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
      inviteToken = makeInviteToken();
      inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      isActive = false;
      emailValue = email.toLowerCase().trim();
    } else {
      if (!password) {
        res.status(400).json({ error: 'password is required (or set invite: true to send an invitation)' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      password_hash = await bcrypt.hash(password, 12);
      isActive = active !== false;
      emailValue = email.toLowerCase().trim();
    }

    const dutiesArr = Array.isArray(job_duties)
      ? job_duties.map((d: unknown) => String(d).trim()).filter(Boolean)
      : [];

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, team, active,
                          invite_token, invite_expires, roster_only, job_duties)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING id, email, first_name, last_name, role, team, active, roster_only, job_duties,
                 created_at, (invite_token IS NOT NULL) AS invited`,
      [
        emailValue,
        password_hash,
        first_name || '',
        last_name || '',
        role || 'team_member',
        team || 'all',
        isActive,
        inviteToken,
        inviteExpires,
        isRosterOnly,
        JSON.stringify(dutiesArr),
      ]
    );
    const user = result.rows[0];

    let email_warning: string | undefined;
    if (wantsInvite && !isRosterOnly) {
      if (!isEmailConfigured()) {
        email_warning = 'User created, but email is not configured (set SMTP_USER / SMTP_PASS on the server). Use "Resend Invite" once email works.';
      } else {
        try {
          const inviteUrl = `${appUrl()}/set-password?token=${inviteToken}`;
          const meetingLink = await teamMeetingLink(user.team);
          await sendInvitationEmail({
            to: user.email,
            firstName: user.first_name,
            inviteUrl,
            teamName: user.team,
            meetingLink,
            appUrl: appUrl(),
          });
        } catch (e) {
          email_warning = `User created, but the invitation email failed to send: ${(e as Error).message}`;
        }
      }
    }

    res.status(201).json({ ...user, email_warning });
  } catch (err) {
    next(err);
  }
}

// Re-send (or send) an invitation email with a fresh token — admin only.
export async function resendInvite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const u = (await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!isEmailConfigured()) {
      res.status(400).json({ error: 'Email is not configured (set SMTP_USER / SMTP_PASS on the server).' });
      return;
    }

    const inviteToken = makeInviteToken();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET invite_token = $1, invite_expires = $2, updated_at = NOW() WHERE id = $3',
      [inviteToken, inviteExpires, id],
    );

    const inviteUrl = `${appUrl()}/set-password?token=${inviteToken}`;
    const meetingLink = await teamMeetingLink(u.team);
    await sendInvitationEmail({
      to: u.email,
      firstName: u.first_name,
      inviteUrl,
      teamName: u.team,
      meetingLink,
      appUrl: appUrl(),
    });

    res.json({ message: 'Invitation re-sent' });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { email, password, first_name, last_name, role, team, active, roster_only, job_duties } = req.body;

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Build dynamic update
    const sets: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (email !== undefined)       { sets.push(`email = $${p++}`);        values.push(email ? email.toLowerCase().trim() : null); }
    if (first_name !== undefined)  { sets.push(`first_name = $${p++}`);   values.push(first_name); }
    if (last_name !== undefined)   { sets.push(`last_name = $${p++}`);    values.push(last_name); }
    if (role !== undefined)        { sets.push(`role = $${p++}`);         values.push(role); }
    if (team !== undefined)        { sets.push(`team = $${p++}`);         values.push(team); }
    if (active !== undefined)      { sets.push(`active = $${p++}`);       values.push(active); }
    if (roster_only !== undefined) { sets.push(`roster_only = $${p++}`);  values.push(!!roster_only); }
    if (job_duties !== undefined) {
      const dutiesArr = Array.isArray(job_duties)
        ? job_duties.map((d: unknown) => String(d).trim()).filter(Boolean)
        : [];
      sets.push(`job_duties = $${p++}::jsonb`);
      values.push(JSON.stringify(dutiesArr));
    }

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sets.push(`password_hash = $${p++}`);
      values.push(hash);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields provided to update' });
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${p}
       RETURNING id, email, first_name, last_name, role, team, active, roster_only, job_duties, created_at`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const requestingUser = req.user!;

    if (requestingUser.id === id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
}

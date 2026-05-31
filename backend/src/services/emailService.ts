import nodemailer from 'nodemailer';

function getTransporter() {
  // Default to Gmail; auto-correct the common "smpt." typo.
  let host = process.env.SMTP_HOST || 'smtp.gmail.com';
  if (/^smpt\./i.test(host)) host = host.replace(/^smpt\./i, 'smtp.');
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS environment variables are required');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

const APP_URL_DEFAULT = 'https://web-production-c3567.up.railway.app';

export interface InvitationOptions {
  to: string;
  firstName?: string | null;
  inviteUrl: string;
  teamName?: string | null;
  meetingLink?: string | null;
  appUrl?: string;
}

export async function sendInvitationEmail(opts: InvitationOptions): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const appUrl = opts.appUrl || APP_URL_DEFAULT;
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi,';
  const teamLine = opts.teamName
    ? `<p style="margin:0 0 8px;color:#94a3b8;font-size:14px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">${opts.teamName} Team</p>`
    : '';

  const meetingBlock = opts.meetingLink
    ? `<div style="margin:24px 0;padding:16px;background:#0f172a;border:1px solid #334155;border-radius:8px;">
         <p style="margin:0 0 10px;color:#94a3b8;font-size:13px;">Your team's Level 10 meeting link:</p>
         <a href="${opts.meetingLink}" style="color:#60a5fa;font-size:14px;word-break:break-all;">${opts.meetingLink}</a>
       </div>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
    <div style="background:#1d4ed8;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">You're invited 🎉</h1>
    </div>
    <div style="padding:28px 32px;">
      ${teamLine}
      <p style="margin:0 0 16px;color:#f1f5f9;font-size:16px;">${greeting}</p>
      <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px;line-height:1.6;">
        You've been invited to join the <strong>FrameworkOPS KPI Dashboard</strong>. Click below to set your
        password and activate your account.
      </p>
      <p style="margin:24px 0;">
        <a href="${opts.inviteUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
          Set Password &amp; Join
        </a>
      </p>
      <p style="margin:0 0 4px;color:#64748b;font-size:12px;">Or paste this link into your browser:</p>
      <a href="${opts.inviteUrl}" style="color:#60a5fa;font-size:12px;word-break:break-all;">${opts.inviteUrl}</a>
      ${meetingBlock}
      <p style="margin:24px 0 0;color:#64748b;font-size:13px;">This invitation link expires in 7 days.</p>
    </div>
    <div style="padding:16px 32px;background:#0f172a;border-top:1px solid #1e293b;">
      <p style="margin:0;color:#475569;font-size:12px;">FrameworkOPS KPI Dashboard · <a href="${appUrl}/eula" style="color:#475569;">EULA</a> · <a href="${appUrl}/privacy" style="color:#475569;">Privacy</a></p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: "You're invited to the FrameworkOPS KPI Dashboard",
    html,
  });
}

export interface MeetingReminderOptions {
  to: string[];
  teamName: string;
  meetingDate: string;   // e.g. "Monday, April 7, 2026"
  meetingTime: string;   // e.g. "9:00 AM"
  meetingLink: string | null;
  appUrl: string;
}

export async function sendMeetingReminder(opts: MeetingReminderOptions): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const appUrl = opts.appUrl || 'https://web-production-c3567.up.railway.app';

  const linkBlock = opts.meetingLink
    ? `<p style="margin:16px 0;">
         <a href="${opts.meetingLink}" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none;">
           Join Meeting
         </a>
       </p>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
    <div style="background:#1d4ed8;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">📅 Meeting Reminder</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">
        ${opts.teamName} Team
      </p>
      <h2 style="margin:0 0 20px;color:#f1f5f9;font-size:22px;font-weight:700;">
        Level 10 Meeting
      </h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #334155;color:#94a3b8;font-size:14px;width:90px;">Date</td>
          <td style="padding:10px 0;border-bottom:1px solid #334155;color:#f1f5f9;font-size:14px;font-weight:600;">${opts.meetingDate}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#94a3b8;font-size:14px;">Time</td>
          <td style="padding:10px 0;color:#f1f5f9;font-size:14px;font-weight:600;">${opts.meetingTime}</td>
        </tr>
      </table>
      ${linkBlock}
      <p style="margin:20px 0 0;color:#64748b;font-size:13px;">
        Prepare your scorecard updates, rock statuses, and any issues to bring to the table.
        <a href="${appUrl}/meetings" style="color:#60a5fa;text-decoration:none;">View in Dashboard →</a>
      </p>
    </div>
    <div style="padding:16px 32px;background:#0f172a;border-top:1px solid #1e293b;">
      <p style="margin:0;color:#475569;font-size:12px;">FrameworkOPS KPI Dashboard · <a href="${appUrl}/eula" style="color:#475569;">EULA</a> · <a href="${appUrl}/privacy" style="color:#475569;">Privacy</a></p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from,
    to: opts.to.join(', '),
    subject: `Reminder: ${opts.teamName} Team Level 10 — ${opts.meetingDate} at ${opts.meetingTime}`,
    html,
  });
}

import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import StatusBadge from '../components/StatusBadge'
import MeetingRunner from '../components/MeetingRunner'
import {
  getMeetingsApi,
  createMeetingApi,
  updateMeetingApi,
  deleteMeetingApi,
  sendMeetingReminderApi,
  downloadMeetingIcsApi,
} from '../services/api'
import { Meeting, TeamType } from '../types'
import { useAuthStore } from '../store/authStore'
import { isoDate, parseLocalDate } from '../utils/dates'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(isoDate(d) + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

function buildGoogleCalendarUrl(meeting: Meeting): string {
  const date = isoDate(meeting.meeting_date).replace(/-/g, '')
  const time = meeting.meeting_time?.replace(':', '') || '090000'
  const timeStr = time.length === 4 ? time + '00' : time
  // 1-hour event by default
  const endHour = (parseInt(timeStr.slice(0, 2)) + 1).toString().padStart(2, '0')
  const endStr = endHour + timeStr.slice(2)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${meeting.team.charAt(0).toUpperCase() + meeting.team.slice(1)} Team — Level 10 Meeting`,
    dates: `${date}T${timeStr}/${date}T${endStr}`,
    details: meeting.meeting_link ? `Join: ${meeting.meeting_link}` : 'FrameworkOPS Level 10 Meeting',
    location: meeting.meeting_link || '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ── Agenda definition ─────────────────────────────────────────────────────────
const AGENDA = [
  { key: 'segue',           label: 'Segue',           duration: '5 min',  description: 'Share good news — personal and professional.' },
  { key: 'scorecard_notes', label: 'Scorecard Review', duration: '5 min',  description: 'Review KPI scorecard, identify any off-track metrics.' },
  { key: 'rocks_notes',     label: 'Rock Review',      duration: '5 min',  description: 'Each rock is on track or off track. Move issues to IDS.' },
  { key: 'headlines',       label: 'Headlines',        duration: '5 min',  description: 'Customer and employee headlines — good news and bad.' },
  { key: 'todos_notes',     label: 'To-Do List',       duration: '5 min',  description: "Review last week's 7-day to-dos. Complete or move to IDS." },
  { key: 'ids_issues',      label: 'IDS — Issues',     duration: '60 min', description: 'Identify, Discuss, Solve the most important issues.' },
  { key: 'conclude_notes',  label: 'Conclude',         duration: '5 min',  description: 'Recap to-dos, cascade messages, rate the meeting.' },
]

// ── Meeting Detail Modal ──────────────────────────────────────────────────────
interface MeetingDetailProps {
  meeting: Meeting
  onUpdate: () => void
  onClose: () => void
}

const MeetingDetail: React.FC<MeetingDetailProps> = ({ meeting, onUpdate, onClose }) => {
  const { user } = useAuthStore()
  const canEdit = user?.role === 'admin' || user?.role === 'leadership'

  const [form, setForm] = useState<Partial<Meeting>>({ ...meeting })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reminderMsg, setReminderMsg] = useState<string | null>(null)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [attendeesInput, setAttendeesInput] = useState(
    (meeting.attendee_emails || []).join(', ')
  )

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const emails = attendeesInput
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
      await updateMeetingApi(meeting.id, { ...form, attendee_emails: emails })
      onUpdate()
    } catch (e: any) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendReminder = async () => {
    setSendingReminder(true)
    setReminderMsg(null)
    try {
      const emails = attendeesInput.split(',').map((e) => e.trim()).filter(Boolean)
      await sendMeetingReminderApi(meeting.id, emails.length > 0 ? emails : undefined)
      setReminderMsg('Reminder sent!')
      setTimeout(() => setReminderMsg(null), 4000)
    } catch (e: any) {
      setReminderMsg(e.response?.data?.error || 'Failed to send reminder')
      setTimeout(() => setReminderMsg(null), 5000)
    } finally {
      setSendingReminder(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const textareaCls = inputCls + ' resize-none'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 px-4 py-6 overflow-y-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white capitalize">
              {meeting.team} Team — Level 10 Meeting
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {fmtDate(meeting.meeting_date)}{meeting.meeting_time ? ` · ${meeting.meeting_time}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={meeting.status} />
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}

          {/* Meeting link + calendar */}
          <div className="bg-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Meeting Details</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Time</label>
                <input
                  type="time"
                  className={inputCls}
                  value={form.meeting_time || ''}
                  onChange={(e) => setForm({ ...form, meeting_time: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Meeting['status'] })}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Meeting Link (Google Meet, Zoom, etc.)</label>
              <input
                type="url"
                className={inputCls}
                placeholder="https://meet.google.com/abc-defg-hij"
                value={form.meeting_link || ''}
                onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Attendee Emails
                <span className="text-slate-500 font-normal ml-1">(comma-separated — used for reminders)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="sales@demo.frameworkops.com, production@demo.frameworkops.com"
                value={attendeesInput}
                onChange={(e) => setAttendeesInput(e.target.value)}
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {form.meeting_link && (
                <a
                  href={form.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Join Meeting
                </a>
              )}
              <a
                href={buildGoogleCalendarUrl({ ...meeting, ...form } as Meeting)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Add to Google Calendar
              </a>
              {canEdit && (
                <button
                  onClick={handleSendReminder}
                  disabled={sendingReminder}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {sendingReminder ? 'Sending…' : 'Send Reminder'}
                </button>
              )}
              {meeting.reminder_sent && (
                <span className="text-xs text-slate-500">✓ Reminder sent</span>
              )}
            </div>
            {reminderMsg && (
              <p className={`text-xs font-medium ${reminderMsg.includes('sent') ? 'text-green-400' : 'text-red-400'}`}>
                {reminderMsg}
              </p>
            )}
          </div>

          {/* Agenda sections */}
          {AGENDA.map((section) => (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-white">{section.label}</label>
                <span className="text-xs text-slate-500">{section.duration}</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">{section.description}</p>
              <textarea
                rows={section.key === 'ids_issues' ? 6 : 3}
                className={textareaCls}
                value={(form as any)[section.key] || ''}
                onChange={(e) => setForm({ ...form, [section.key]: e.target.value })}
                placeholder={`Notes for ${section.label}…`}
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-semibold text-white mb-1">Meeting Rating (1–10)</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-32 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.rating ?? ''}
              onChange={(e) => setForm({ ...form, rating: e.target.value ? +e.target.value : null })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
            <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Close</button>
            <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const Meetings: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? user.team as TeamType : 'all'
  )
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [runningMeeting, setRunningMeeting] = useState<Meeting | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    team: user?.role === 'manager' ? user.team : 'leadership',
    meeting_date: new Date().toISOString().split('T')[0],
    meeting_time: '09:00',
    meeting_link: '',
    attendee_emails: '',
  })
  const [creating, setCreating] = useState(false)

  const loadMeetings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getMeetingsApi(team === 'all' ? undefined : team)
      setMeetings(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [team])

  useEffect(() => { loadMeetings() }, [loadMeetings])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const emails = createForm.attendee_emails
        .split(',').map((e) => e.trim()).filter(Boolean)
      const res = await createMeetingApi({
        team: createForm.team,
        meeting_date: createForm.meeting_date,
        meeting_time: createForm.meeting_time || null,
        meeting_link: createForm.meeting_link || null,
        attendee_emails: emails,
        status: 'scheduled',
      })
      setShowCreateForm(false)
      await loadMeetings()
      setSelectedMeeting(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this meeting?')) return
    try {
      await deleteMeetingApi(id)
      await loadMeetings()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const sorted = [...meetings].sort(
    (a, b) => parseLocalDate(b.meeting_date).getTime() - parseLocalDate(a.meeting_date).getTime()
  )

  const inputCls = 'bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <>
      <Header
        title="Meetings"
        actions={
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Meeting
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <TeamFilter value={team} onChange={setTeam} />

        {showCreateForm && (
          <form onSubmit={handleCreate} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Schedule Meeting</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Team</label>
                <select
                  className={inputCls}
                  value={createForm.team}
                  onChange={(e) => setCreateForm({ ...createForm, team: e.target.value as 'leadership' | 'sales' | 'production' | 'office' })}
                  disabled={user?.role === 'manager'}
                >
                  <option value="leadership">Leadership</option>
                  <option value="sales">Sales</option>
                  <option value="production">Production</option>
                  <option value="office">Office</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  required
                  className={inputCls}
                  value={createForm.meeting_date}
                  onChange={(e) => setCreateForm({ ...createForm, meeting_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Time</label>
                <input
                  type="time"
                  className={inputCls}
                  value={createForm.meeting_time}
                  onChange={(e) => setCreateForm({ ...createForm, meeting_time: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2">
                <button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 h-[38px] flex-shrink-0">
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowCreateForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors h-[38px] flex-shrink-0">Cancel</button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Meeting Link (optional)</label>
              <input
                type="url"
                className={`${inputCls} w-full`}
                placeholder="https://meet.google.com/abc-defg-hij"
                value={createForm.meeting_link}
                onChange={(e) => setCreateForm({ ...createForm, meeting_link: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Attendee Emails (comma-separated)</label>
              <input
                type="text"
                className={`${inputCls} w-full`}
                placeholder="sales@demo.frameworkops.com, production@demo.frameworkops.com"
                value={createForm.attendee_emails}
                onChange={(e) => setCreateForm({ ...createForm, attendee_emails: e.target.value })}
              />
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No meetings found.</div>
        ) : (
          <div className="space-y-2">
            {sorted.map((meeting) => {
              const isPast = parseLocalDate(meeting.meeting_date) < new Date()
              return (
                <div
                  key={meeting.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 md:px-5 py-4 hover:border-slate-600 transition-colors cursor-pointer"
                  onClick={() => setSelectedMeeting(meeting)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      meeting.status === 'complete' ? 'bg-green-500/20' :
                      meeting.status === 'in_progress' ? 'bg-blue-500/20' : 'bg-slate-700'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        meeting.status === 'complete' ? 'text-green-400' :
                        meeting.status === 'in_progress' ? 'text-blue-400' : 'text-slate-400'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white capitalize">
                        {meeting.team} Team — Level 10 Meeting
                      </p>
                      <p className={`text-xs mt-0.5 ${isPast && meeting.status !== 'complete' ? 'text-yellow-400' : 'text-slate-400'}`}>
                        {fmtDate(meeting.meeting_date)}{meeting.meeting_time ? ` · ${meeting.meeting_time}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Start / Resume meeting — primary action for active meetings */}
                      {meeting.status !== 'complete' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRunningMeeting(meeting) }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {meeting.status === 'in_progress' ? 'Resume' : 'Start'}
                        </button>
                      )}
                      {/* Quick action buttons — stop propagation so they don't open modal */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            const res = await downloadMeetingIcsApi(meeting.id)
                            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/calendar' }))
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `meeting-${meeting.meeting_date}.ics`
                            a.click()
                            URL.revokeObjectURL(url)
                          } catch { /* ignore */ }
                        }}
                        title="Download .ics"
                        className="hidden md:flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white border border-slate-600 rounded-lg text-xs font-medium transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        .ics
                      </button>
                      {meeting.meeting_link && (
                        <a
                          href={meeting.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Join meeting"
                          className="hidden md:flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Join
                        </a>
                      )}

                      {meeting.rating && (
                        <span className={`text-sm font-bold ${
                          meeting.rating >= 8 ? 'text-green-400' :
                          meeting.rating >= 6 ? 'text-yellow-400' : 'text-red-400'
                        }`}>{meeting.rating}/10</span>
                      )}
                      <StatusBadge status={meeting.status} />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id) }}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedMeeting && (
        <MeetingDetail
          meeting={selectedMeeting}
          onUpdate={() => { loadMeetings(); setSelectedMeeting(null) }}
          onClose={() => setSelectedMeeting(null)}
        />
      )}
      {runningMeeting && (
        <MeetingRunner
          meeting={runningMeeting}
          onClose={() => { loadMeetings(); setRunningMeeting(null) }}
          onComplete={() => { loadMeetings(); setRunningMeeting(null) }}
        />
      )}
    </>
  )
}

export default Meetings

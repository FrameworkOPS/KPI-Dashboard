import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import StatusBadge from '../components/StatusBadge'
import {
  getMeetingsApi,
  createMeetingApi,
  updateMeetingApi,
  deleteMeetingApi,
} from '../services/api'
import { Meeting, TeamType } from '../types'
import { useAuthStore } from '../store/authStore'

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

const AGENDA = [
  { key: 'segue', label: 'Segue', duration: '5 min', description: 'Share good news — personal and professional.' },
  { key: 'scorecard_notes', label: 'Scorecard Review', duration: '5 min', description: 'Review KPI scorecard, identify any off-track metrics.' },
  { key: 'rocks_notes', label: 'Rock Review', duration: '5 min', description: 'Each rock is on track or off track. Move issues to IDS.' },
  { key: 'headlines', label: 'Headlines', duration: '5 min', description: 'Customer and employee headlines — good news and bad.' },
  { key: 'todos_notes', label: 'To-Do List', duration: '5 min', description: 'Review last week\'s 7-day to-dos. Complete or move to IDS.' },
  { key: 'ids_issues', label: 'IDS — Issues', duration: '60 min', description: 'Identify, Discuss, Solve the most important issues.' },
  { key: 'conclude_notes', label: 'Conclude', duration: '5 min', description: 'Recap to-dos, cascade messages, rate the meeting.' },
]

interface MeetingDetailProps {
  meeting: Meeting
  onUpdate: () => void
  onClose: () => void
}

const MeetingDetail: React.FC<MeetingDetailProps> = ({ meeting, onUpdate, onClose }) => {
  const [form, setForm] = useState<Partial<Meeting>>({ ...meeting })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateMeetingApi(meeting.id, form)
      onUpdate()
    } catch (e: any) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const textareaCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 px-4 py-6 overflow-y-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              {meeting.team.charAt(0).toUpperCase() + meeting.team.slice(1)} Team Meeting
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(meeting.meeting_date)}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={meeting.status} />
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Meeting Rating (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.rating ?? ''}
                onChange={(e) => setForm({ ...form, rating: e.target.value ? +e.target.value : null })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Status</label>
              <select
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Meeting['status'] })}
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
              </select>
            </div>
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

const Meetings: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? user.team as TeamType : 'all'
  )
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    team: user?.role === 'manager' ? user.team : 'sales',
    meeting_date: new Date().toISOString().split('T')[0],
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
      const res = await createMeetingApi({ ...createForm, status: 'scheduled' })
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
    (a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()
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
      <div className="p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <TeamFilter value={team} onChange={setTeam} />

        {showCreateForm && (
          <form onSubmit={handleCreate} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Schedule Meeting</h3>
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Team</label>
                <select
                  className={inputCls}
                  value={createForm.team}
                  onChange={(e) => setCreateForm({ ...createForm, team: e.target.value as 'sales' | 'production' | 'leadership' })}
                  disabled={user?.role === 'manager'}
                >
                  <option value="sales">Sales</option>
                  <option value="production">Production</option>
                  <option value="leadership">Leadership</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Meeting Date</label>
                <input
                  type="date"
                  required
                  className={inputCls}
                  value={createForm.meeting_date}
                  onChange={(e) => setCreateForm({ ...createForm, meeting_date: e.target.value })}
                />
              </div>
              <button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 h-[38px]">
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowCreateForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors h-[38px]">Cancel</button>
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
              const isPast = new Date(meeting.meeting_date) < new Date()
              return (
                <div
                  key={meeting.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-slate-600 transition-colors cursor-pointer"
                  onClick={() => setSelectedMeeting(meeting)}
                >
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
                      {fmtDate(meeting.meeting_date)}
                    </p>
                  </div>
                  {meeting.rating && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-slate-400">Rating</span>
                      <span className={`text-sm font-bold ${
                        meeting.rating >= 8 ? 'text-green-400' :
                        meeting.rating >= 6 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{meeting.rating}/10</span>
                    </div>
                  )}
                  <StatusBadge status={meeting.status} />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id) }}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
    </>
  )
}

export default Meetings

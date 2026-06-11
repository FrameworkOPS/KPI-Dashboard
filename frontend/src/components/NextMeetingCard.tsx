import React, { useEffect, useMemo, useState } from 'react'
import MeetingRunner from './MeetingRunner'
import { Meeting } from '../types'

interface Props {
  meetings: Meeting[]
  onMeetingChanged: () => void
}

// Picks the soonest non-complete meeting (within ~14 days) and renders a card
// with a one-click Start / Resume button. Today's meeting gets a bigger
// highlight; same-week meetings show the day name; further out shows the date.
const NextMeetingCard: React.FC<Props> = ({ meetings, onMeetingChanged }) => {
  const [running, setRunning] = useState<Meeting | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Re-tick every minute so the "in 23m" countdown stays fresh without a page
  // refresh. We don't need second precision on the dashboard.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const next = useMemo(() => {
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    return meetings
      .filter(m => m.status !== 'complete')
      .filter(m => {
        const d = new Date(m.meeting_date + 'T00:00:00')
        return d.getTime() >= today.getTime()
      })
      .sort((a, b) => {
        const da = new Date(a.meeting_date).getTime()
        const db = new Date(b.meeting_date).getTime()
        if (da !== db) return da - db
        // Same day — sort by meeting_time when present
        return (a.meeting_time || '99:99').localeCompare(b.meeting_time || '99:99')
      })[0]
  }, [meetings, now])

  if (!next) return null

  const meetingDay = new Date(next.meeting_date + 'T00:00:00')
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const daysAway = Math.round((meetingDay.getTime() - today.getTime()) / 86_400_000)
  const isToday = daysAway === 0

  const dayLabel = isToday
    ? 'Today'
    : daysAway === 1 ? 'Tomorrow'
    : daysAway < 7 ? meetingDay.toLocaleDateString('en-US', { weekday: 'long' })
    : meetingDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <>
      <div className={`rounded-xl border p-4 md:p-5 ${
        isToday
          ? 'bg-gradient-to-br from-blue-600/20 to-blue-500/5 border-blue-500/40'
          : 'bg-slate-800 border-slate-700'
      }`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isToday ? 'bg-blue-500/30' : 'bg-slate-700'
            }`}>
              <svg className={`w-5 h-5 ${isToday ? 'text-blue-300' : 'text-slate-400'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 uppercase tracking-wide">{isToday ? 'Up Next' : 'Next Meeting'}</p>
              <p className="text-white font-semibold text-base capitalize truncate">
                {next.team} Level 10 — {dayLabel}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {next.meeting_time || '08:30'}
                {next.status === 'in_progress' && <span className="ml-2 text-blue-300">· in progress</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => setRunning(next)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              isToday
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {next.status === 'in_progress' ? 'Resume' : isToday ? 'Start Meeting' : 'Start Early'}
          </button>
        </div>
      </div>

      {running && (
        <MeetingRunner
          meeting={running}
          onClose={() => { setRunning(null); onMeetingChanged() }}
          onComplete={() => { setRunning(null); onMeetingChanged() }}
        />
      )}
    </>
  )
}

export default NextMeetingCard

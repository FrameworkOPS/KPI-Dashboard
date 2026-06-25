import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  startMeetingApi,
  advanceMeetingStageApi,
  completeMeetingApi,
  updateMeetingApi,
} from '../services/api'
import { Meeting, MeetingStage, MeetingAttendance } from '../types'
import { beep, fireMeetingCompleteConfetti } from '../utils/confetti'

interface Props {
  meeting: Meeting
  onClose: () => void
  onComplete: () => void
}

function fmtClock(secs: number): string {
  const sign = secs < 0 ? '-' : ''
  const a = Math.abs(secs)
  const m = Math.floor(a / 60)
  const s = a % 60
  return `${sign}${m}:${String(s).padStart(2, '0')}`
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  segue: 'Share good news — personal and professional. Keep it quick and positive.',
  scorecard_notes: 'Review KPI scorecard. Identify any off-track metrics to move to IDS.',
  rocks_notes: 'Each rock owner: on track or off track? Off-track rocks go to IDS.',
  headlines: 'Customer and employee headlines — good news first, then bad.',
  todos_notes: "Review last week's 7-day to-dos. Done or not done. Not done → IDS.",
  ids_issues: 'Identify, Discuss, Solve. Work the top issues. One at a time.',
  conclude_notes: 'Recap new to-dos. Cascade messages. Rate the meeting 1–10.',
}

const MeetingRunner: React.FC<Props> = ({ meeting, onClose, onComplete }) => {
  const [stages, setStages] = useState<MeetingStage[]>([])
  const [attendance, setAttendance] = useState<MeetingAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const tickRef = useRef<number | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  // Notes for each stage, initialised from the meeting record
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const m = meeting as any
    return {
      segue:           m.segue           || '',
      scorecard_notes: m.scorecard_notes || '',
      rocks_notes:     m.rocks_notes     || '',
      headlines:       m.headlines       || '',
      todos_notes:     m.todos_notes     || '',
      ids_issues:      m.ids_issues      || '',
      conclude_notes:  m.conclude_notes  || '',
    }
  })

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const res = await startMeetingApi(meeting.id)
        if (cancelled) return
        setStages(res.data.stages || [])
        setAttendance(res.data.attendance || [])
      } catch (e: any) {
        if (!cancelled) setError(e.response?.data?.error || e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [meeting.id])

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { if (tickRef.current) window.clearInterval(tickRef.current) }
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current) }, [])

  const currentStage = useMemo(
    () => stages.find(s => s.started_at && !s.completed_at) || stages.find(s => !s.completed_at) || null,
    [stages],
  )
  const allStagesDone = stages.length > 0 && stages.every(s => s.completed_at)

  const stageRemaining = useMemo(() => {
    if (!currentStage || !currentStage.started_at) {
      return currentStage ? currentStage.planned_minutes * 60 : 0
    }
    const elapsed = Math.floor((now - new Date(currentStage.started_at).getTime()) / 1000)
    return currentStage.planned_minutes * 60 - elapsed
  }, [currentStage, now])

  const beepedRef = useRef<Record<string, { warned: boolean; ended: boolean }>>({})
  useEffect(() => {
    if (!currentStage) return
    const state = beepedRef.current[currentStage.id] || { warned: false, ended: false }
    if (!state.warned && stageRemaining <= 60 && stageRemaining > 0) {
      beep(660, 180); state.warned = true
    }
    if (!state.ended && stageRemaining <= 0) {
      beep(523, 240); window.setTimeout(() => beep(523, 240), 280); state.ended = true
    }
    beepedRef.current[currentStage.id] = state
  }, [currentStage, stageRemaining])

  const saveNotes = useCallback(async (patch: Record<string, string>) => {
    try { await updateMeetingApi(meeting.id, patch) } catch { /* silent */ }
  }, [meeting.id])

  const handleNotesChange = (key: string, value: string) => {
    setNotes(prev => ({ ...prev, [key]: value }))
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => saveNotes({ [key]: value }), 700)
  }

  const handleAdvance = useCallback(async () => {
    if (!currentStage) return
    setAdvancing(true)
    // Flush pending note save immediately before advancing
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      await saveNotes({ [currentStage.stage_key]: notes[currentStage.stage_key] || '' })
    }
    try {
      const res = await advanceMeetingStageApi(meeting.id, currentStage.stage_key)
      setStages(res.data.stages || [])
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setAdvancing(false)
    }
  }, [meeting.id, currentStage, notes, saveNotes])

  const updateAttendee = (userId: string, patch: Partial<MeetingAttendance>) => {
    setAttendance(prev => prev.map(a => a.user_id === userId ? { ...a, ...patch } : a))
  }

  const handleComplete = async () => {
    setCompleting(true)
    try {
      await completeMeetingApi(meeting.id, attendance.map(a => ({
        user_id: a.user_id, status: a.status, rating: a.rating, comments: a.comments,
      })))
      fireMeetingCompleteConfetti()
      onComplete()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    )
  }

  const overrun = stageRemaining < 0
  const doneCount = stages.filter(s => s.completed_at).length

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-slate-900 sm:rounded-2xl border border-slate-700 w-full max-w-2xl flex flex-col max-h-[100vh] sm:max-h-[95vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base capitalize">
              {meeting.team} Level 10 Meeting
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {allStagesDone ? 'All stages complete' : `Stage ${doneCount + 1} of ${stages.length}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>
        )}

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Stage progress bar */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {stages.map((s) => {
              const done = !!s.completed_at
              const active = currentStage?.id === s.id
              return (
                <div key={s.id}
                  className={`flex-1 min-w-[72px] rounded px-2 py-1.5 text-center transition-colors ${
                    done ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                      : active ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300'
                      : 'bg-slate-800 border border-slate-700 text-slate-500'
                  }`}
                >
                  <p className="text-[9px] uppercase tracking-wide font-semibold truncate leading-tight">{s.label}</p>
                  <p className="text-[9px] mt-0.5 opacity-70">{s.planned_minutes}m</p>
                </div>
              )
            })}
          </div>

          {/* Current stage */}
          {currentStage && !allStagesDone && (
            <div className="space-y-3">
              {/* Timer card */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Now</p>
                    <h3 className="text-white font-semibold text-lg">{currentStage.label}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {STAGE_DESCRIPTIONS[currentStage.stage_key] || ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className={`font-mono text-4xl font-bold tabular-nums ${overrun ? 'text-red-400' : 'text-blue-400'}`}>
                      {fmtClock(stageRemaining)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {overrun ? `${currentStage.planned_minutes}m · over` : `of ${currentStage.planned_minutes}m`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes for this stage */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {currentStage.label} notes
                  <span className="ml-1.5 text-slate-600 font-normal">auto-saved</span>
                </label>
                <textarea
                  rows={currentStage.stage_key === 'ids_issues' ? 7 : 4}
                  value={notes[currentStage.stage_key] ?? ''}
                  onChange={(e) => handleNotesChange(currentStage.stage_key, e.target.value)}
                  placeholder={`Notes for ${currentStage.label}…`}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
                />
              </div>

              {/* Next button */}
              <button
                onClick={handleAdvance}
                disabled={advancing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {advancing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                ) : currentStage.sort_order === stages.length - 1 ? (
                  'Finish Conclude →'
                ) : (
                  `Next: ${stages[currentStage.sort_order + 1]?.label ?? 'Done'} →`
                )}
              </button>
            </div>
          )}

          {/* Wrap-up — attendance + ratings */}
          {allStagesDone && (
            <div className="space-y-3">
              <div>
                <h3 className="text-white font-semibold text-base">Rate &amp; Wrap Up</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Mark each attendee present or absent, capture their 1–10 rating, then complete the meeting.
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700/60">
                {attendance.length === 0 && (
                  <p className="text-center py-6 text-slate-500 text-sm">No team members found.</p>
                )}
                {attendance.map((a) => (
                  <div key={a.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm text-white font-medium">{a.first_name} {a.last_name}</p>
                      {a.email && <p className="text-xs text-slate-500 truncate">{a.email}</p>}
                    </div>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden text-xs">
                      <button
                        onClick={() => updateAttendee(a.user_id, { status: 'present' })}
                        className={`px-3 py-1.5 transition-colors ${a.status === 'present' ? 'bg-green-500/20 text-green-400' : 'text-slate-500 hover:text-white'}`}
                      >Present</button>
                      <button
                        onClick={() => updateAttendee(a.user_id, { status: 'absent', rating: null })}
                        className={`px-3 py-1.5 transition-colors ${a.status === 'absent' ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-white'}`}
                      >Absent</button>
                    </div>
                    {a.status === 'present' && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <button key={n} onClick={() => updateAttendee(a.user_id, { rating: n })}
                            className={`w-7 h-7 text-xs font-medium rounded transition-colors ${
                              a.rating === n
                                ? n >= 8 ? 'bg-green-500 text-white' : n >= 6 ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                            }`}>{n}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={handleComplete} disabled={completing}
                className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors disabled:opacity-60">
                {completing ? 'Saving…' : 'Complete Meeting'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default MeetingRunner

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  startMeetingApi,
  advanceMeetingStageApi,
  completeMeetingApi,
  updateMeetingApi,
} from '../services/api'
import { Meeting, MeetingStage, MeetingAttendance } from '../types'
import { fireMeetingCompleteConfetti } from '../utils/confetti'
import { useDialog } from './useDialog'

interface Props {
  meeting: Meeting
  onClose: () => void
  onComplete: () => void
}

// Short beep via Web Audio — no asset needed
function beep(freq = 880, ms = 160) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.value = 0.15
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + ms / 1000)
    osc.onended = () => ctx.close()
  } catch { /* audio not available */ }
}

function fmtClock(seconds: number): string {
  const sign = seconds < 0 ? '-' : ''
  const a = Math.abs(seconds)
  const m = Math.floor(a / 60)
  const s = a % 60
  return `${sign}${m}:${String(s).padStart(2, '0')}`
}

// The server's stage keys are short ('ids'); the meeting columns that hold
// each stage's notes are not ('ids_issues'). Everything below reads and
// writes notes by column so nothing typed into a stage is dropped.
const STAGE_TO_COLUMN: Record<string, string> = {
  segue: 'segue',
  scorecard: 'scorecard_notes',
  rocks: 'rocks_notes',
  headlines: 'headlines',
  todos: 'todos_notes',
  ids: 'ids_issues',
  conclude: 'conclude_notes',
}
const columnFor = (stageKey: string) => STAGE_TO_COLUMN[stageKey] || stageKey

const STAGE_DESCRIPTIONS: Record<string, string> = {
  segue: 'Share good news — personal and professional. Keep it quick and positive.',
  scorecard_notes: 'Review KPI scorecard. Identify any off-track metrics to move to IDS.',
  rocks_notes: 'Each rock owner: on track or off track? Off-track rocks go to IDS.',
  headlines: 'Customer and employee headlines — good news first, then bad.',
  todos_notes: "Review last week's 7-day to-dos. Done or not done. Not done → IDS.",
  ids_issues: 'Identify, Discuss, Solve. Work the top issues. One at a time.',
  conclude_notes: 'Recap new to-dos. Cascade messages. Rate the meeting 1–10.',
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

const notesFrom = (m: Partial<Meeting> | undefined): Record<string, string> => {
  const src = (m || {}) as any
  const out: Record<string, string> = {}
  for (const col of Object.values(STAGE_TO_COLUMN)) out[col] = src[col] || ''
  return out
}

const MeetingRunner: React.FC<Props> = ({ meeting, onClose, onComplete }) => {
  const [stages, setStages] = useState<MeetingStage[]>([])
  const [attendance, setAttendance] = useState<MeetingAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startFailed, setStartFailed] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [now, setNow] = useState(() => Date.now())
  const tickRef = useRef<number | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  // The latest notes, readable from cleanup code that runs after unmount.
  const notesRef = useRef<Record<string, string>>(notesFrom(meeting))
  const pendingRef = useRef<Record<string, string>>({})
  const saveSeqRef = useRef(0)

  const [notes, setNotes] = useState<Record<string, string>>(() => notesFrom(meeting))
  useEffect(() => { notesRef.current = notes }, [notes])

  const init = useCallback(async () => {
    setLoading(true); setError(null); setStartFailed(false)
    try {
      const res = await startMeetingApi(meeting.id)
      setStages(res.data.stages || [])
      setAttendance(res.data.attendance || [])
      // The list snapshot can be stale; the server's copy is what we edit.
      if (res.data.meeting) setNotes(notesFrom(res.data.meeting))
    } catch (e: any) {
      setError(e.message)
      setStartFailed(true)
    } finally {
      setLoading(false)
    }
  }, [meeting.id])

  useEffect(() => {
    let cancelled = false
    init().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [init])

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { if (tickRef.current) window.clearInterval(tickRef.current) }
  }, [])

  // Saves are serialized by sequence so an older response can't overwrite a
  // newer edit; failures show instead of hiding behind "auto-saved".
  const saveNotes = useCallback(async (patch: Record<string, string>) => {
    const seq = ++saveSeqRef.current
    setSaveState('saving')
    try {
      await updateMeetingApi(meeting.id, patch)
      if (seq === saveSeqRef.current) setSaveState('saved')
    } catch {
      if (seq === saveSeqRef.current) setSaveState('failed')
    }
  }, [meeting.id])

  const flushPending = useCallback(() => {
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    const patch = pendingRef.current
    pendingRef.current = {}
    if (Object.keys(patch).length === 0) return Promise.resolve()
    return saveNotes(patch)
  }, [saveNotes])

  // Whatever is still pending when the runner closes is sent, not discarded.
  useEffect(() => () => { void flushPending() }, [flushPending])

  const handleNotesChange = (column: string, value: string) => {
    setNotes(prev => ({ ...prev, [column]: value }))
    pendingRef.current[column] = value
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => { void flushPending() }, 700)
  }

  const closeRunner = () => { void flushPending(); onClose() }
  const dialogRef = useDialog<HTMLDivElement>(closeRunner)

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

  const handleAdvance = useCallback(async () => {
    if (!currentStage) return
    setAdvancing(true)
    await flushPending()
    try {
      const res = await advanceMeetingStageApi(meeting.id, currentStage.stage_key)
      setStages(res.data.stages || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdvancing(false)
    }
  }, [meeting.id, currentStage, flushPending])

  const updateAttendee = (userId: string, patch: Partial<MeetingAttendance>) => {
    setAttendance(prev => prev.map(a => a.user_id === userId ? { ...a, ...patch } : a))
  }

  const handleComplete = async () => {
    setCompleting(true)
    await flushPending()
    try {
      await completeMeetingApi(meeting.id, attendance.map(a => ({
        user_id: a.user_id, status: a.status, rating: a.rating, comments: a.comments,
      })))
      fireMeetingCompleteConfetti()
      onComplete()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCompleting(false)
    }
  }

  const overrun = stageRemaining < 0
  const doneCount = stages.filter(s => s.completed_at).length
  const currentColumn = currentStage ? columnFor(currentStage.stage_key) : ''

  const saveLabel: Record<SaveState, string> = {
    idle: 'auto-saves as you type',
    saving: 'saving…',
    saved: 'saved',
    failed: 'not saved — check your connection and keep typing to retry',
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-runner-title"
        className="bg-slate-900 sm:rounded-2xl border border-slate-700 w-full max-w-2xl flex flex-col max-h-[100vh] sm:max-h-[95vh]"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 id="meeting-runner-title" className="text-white font-semibold text-base capitalize">
              {meeting.team} Level 10 Meeting
            </h2>
            <p className="text-xs text-slate-400 mt-0.5" aria-live="polite">
              {loading ? 'Starting…' : allStagesDone ? 'All stages complete' : stages.length ? `Stage ${doneCount + 1} of ${stages.length}` : ''}
            </p>
          </div>
          <button onClick={closeRunner} aria-label="Close meeting runner"
            className="text-slate-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div role="alert" className="mx-5 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            {startFailed && (
              <button onClick={init} className="text-xs font-medium text-white bg-red-500/30 hover:bg-red-500/40 px-3 py-2 min-h-[44px] rounded">
                Try again
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16" aria-busy="true">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Stage progress bar */}
          {stages.length > 0 && (
            <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Meeting stages">
              {stages.map((s) => {
                const done = !!s.completed_at
                const active = currentStage?.id === s.id
                return (
                  <li key={s.id}
                    aria-current={active ? 'step' : undefined}
                    className={`flex-1 min-w-[72px] rounded px-2 py-1.5 text-center transition-colors ${
                      done ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                        : active ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300'
                        : 'bg-slate-800 border border-slate-700 text-slate-400'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wide font-semibold truncate leading-tight">
                      {done && <span aria-hidden="true">✓ </span>}{s.label}
                      <span className="sr-only">{done ? ', done' : active ? ', in progress' : ', upcoming'}</span>
                    </p>
                    <p className="text-[10px] mt-0.5 opacity-80">{s.planned_minutes}m</p>
                  </li>
                )
              })}
            </ol>
          )}

          {/* Current stage */}
          {currentStage && !allStagesDone && (
            <div className="space-y-3">
              {/* Timer card */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Now</p>
                    <h3 className="text-white font-semibold text-lg">{currentStage.label}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {STAGE_DESCRIPTIONS[currentColumn] || ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className={`font-mono text-4xl font-bold tabular-nums ${overrun ? 'text-red-400' : 'text-blue-400'}`}
                      aria-label={`${overrun ? 'Over by' : 'Remaining'} ${fmtClock(stageRemaining).replace('-', '')}`}>
                      {fmtClock(stageRemaining)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {overrun ? `${currentStage.planned_minutes}m · over` : `of ${currentStage.planned_minutes}m`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes for this stage */}
              <div>
                <label htmlFor="stage-notes" className="block text-xs font-medium text-slate-400 mb-1">
                  {currentStage.label} notes
                  <span className={`ml-1.5 font-normal ${saveState === 'failed' ? 'text-red-400' : 'text-slate-400'}`} aria-live="polite">
                    · {saveLabel[saveState]}
                  </span>
                </label>
                <textarea
                  id="stage-notes"
                  rows={currentColumn === 'ids_issues' ? 7 : 4}
                  value={notes[currentColumn] ?? ''}
                  onChange={(e) => handleNotesChange(currentColumn, e.target.value)}
                  placeholder={`Notes for ${currentStage.label}…`}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>

              {/* Next button */}
              <button
                onClick={handleAdvance}
                disabled={advancing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-3 min-h-[48px] rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {advancing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" /> Saving…</>
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
                  <p className="text-center py-6 text-slate-400 text-sm">No team members found.</p>
                )}
                {attendance.map((a) => {
                  const personName = `${a.first_name} ${a.last_name}`
                  return (
                    <div key={a.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[140px]">
                        <p className="text-sm text-white font-medium">{personName}</p>
                        {a.email && <p className="text-xs text-slate-400 truncate">{a.email}</p>}
                      </div>
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden text-xs" role="group" aria-label={`${personName} attendance`}>
                        <button
                          onClick={() => updateAttendee(a.user_id, { status: 'present' })}
                          aria-pressed={a.status === 'present'}
                          className={`px-3 min-h-[44px] transition-colors ${a.status === 'present' ? 'bg-green-500/20 text-green-400' : 'text-slate-400 hover:text-white'}`}
                        >Present</button>
                        <button
                          onClick={() => updateAttendee(a.user_id, { status: 'absent', rating: null })}
                          aria-pressed={a.status === 'absent'}
                          className={`px-3 min-h-[44px] transition-colors ${a.status === 'absent' ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-white'}`}
                        >Absent</button>
                      </div>
                      {a.status === 'present' && (
                        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={`${personName} rating, 1 to 10`}>
                          {[1,2,3,4,5,6,7,8,9,10].map(n => (
                            <button key={n} onClick={() => updateAttendee(a.user_id, { rating: n })}
                              aria-pressed={a.rating === n}
                              aria-label={`Rate ${n}`}
                              className={`min-w-[36px] h-10 text-xs font-medium rounded transition-colors ${
                                a.rating === n
                                  ? n >= 8 ? 'bg-green-600 text-white' : n >= 6 ? 'bg-yellow-600 text-white' : 'bg-red-600 text-white'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}>{n}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button onClick={handleComplete} disabled={completing}
                className="w-full bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-3 min-h-[48px] rounded-lg transition-colors disabled:opacity-60">
                {completing ? 'Saving…' : 'Complete Meeting'}
              </button>
            </div>
          )}

        </div>
        )}
      </div>
    </div>
  )
}

export default MeetingRunner

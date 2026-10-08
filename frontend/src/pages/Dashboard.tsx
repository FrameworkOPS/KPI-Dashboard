import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import NextMeetingCard from '../components/NextMeetingCard'
import {
  getRocksApi,
  getIssuesApi,
  getTodosApi,
  getMeetingsApi,
  getQBOSummaryApi,
} from '../services/api'
import { Rock, Issue, Todo, Meeting, QBOSummary } from '../types'
import { useAuthStore } from '../store/authStore'
import { parseLocalDate, startOfToday, isBeforeToday, currentQuarter, formatDate } from '../utils/dates'
import { useDataChanged } from '../utils/dataEvents'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtDate = (d: string) => formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })

const Dashboard: React.FC = () => {
  const { user } = useAuthStore()
  const [rocks, setRocks] = useState<Rock[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [qbo, setQbo] = useState<QBOSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  const today = startOfToday()
  // This week runs through Sunday, so the week ends on the coming Sunday
  // (or today, when today is Sunday) at the end of the day.
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + ((7 - today.getDay()) % 7))
  endOfWeek.setHours(23, 59, 59, 999)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const now = new Date()
      // Use allSettled so a single 5xx doesn't wipe out the whole dashboard.
      // Each tile renders independently and failures are named, not hidden.
      const [rocksRes, issuesRes, todosRes, meetingsRes] = await Promise.allSettled([
        getRocksApi(undefined, currentQuarter(now), now.getFullYear()),
        getIssuesApi(undefined, 'open'),
        getTodosApi(undefined, 'pending'),
        getMeetingsApi(),
      ])
      if (rocksRes.status    === 'fulfilled') setRocks(rocksRes.value.data)
      if (issuesRes.status   === 'fulfilled') setIssues(issuesRes.value.data)
      if (todosRes.status    === 'fulfilled') setTodos(todosRes.value.data)
      if (meetingsRes.status === 'fulfilled') setMeetings(meetingsRes.value.data)
      const results = [['rocks', rocksRes], ['issues', issuesRes], ['to-dos', todosRes], ['meetings', meetingsRes]] as const
      const failures = results.filter(([, r]) => r.status === 'rejected').map(([name]) => name)
      setFailed(failures)
      if (failures.length === results.length) {
        const reason = (rocksRes as PromiseRejectedResult).reason
        setError(reason?.message || 'Could not load the dashboard.')
      }

      if (user?.role === 'admin' || user?.role === 'leadership') {
        const qboRes = await Promise.allSettled([getQBOSummaryApi()])
        if (qboRes[0].status === 'fulfilled') setQbo(qboRes[0].value.data)
      }
    } catch (e: any) {
      setError(e.message || 'Could not load the dashboard.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])
  const reloadSilently = useCallback(() => { load({ silent: true }) }, [load])
  useDataChanged(['issues', 'todos', 'rocks', 'meetings'], reloadSilently)

  const openRocks = rocks.filter((r) => r.status !== 'done').length
  const openIssues = issues.filter((i) => i.status === 'open').length
  const dueTodos = todos.filter((t) => {
    if (t.status === 'complete') return false
    if (!t.due_date) return false
    return parseLocalDate(t.due_date) <= endOfWeek
  }).length
  const nextMeeting = meetings
    .filter((m) => m.status !== 'complete' && (m.status === 'in_progress' || parseLocalDate(m.meeting_date) >= today))
    .sort((a, b) => parseLocalDate(a.meeting_date).getTime() - parseLocalDate(b.meeting_date).getTime())[0]

  const recentIssues = [...issues].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5)

  // Pending to-dos due by the end of this week, overdue first.
  const weekTodos = todos
    .filter((t) => t.status === 'pending' && t.due_date && parseLocalDate(t.due_date) <= endOfWeek)
    .sort((a, b) => parseLocalDate(a.due_date).getTime() - parseLocalDate(b.due_date).getTime())
    .slice(0, 8)

  if (loading) {
    return (
      <>
        <Header title="Dashboard" />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Header title="Dashboard" />
        <div className="p-4 md:p-6">
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center justify-between gap-3 flex-wrap">
            <span>{error}</span>
            <button onClick={() => load()} className="bg-red-500/20 hover:bg-red-500/30 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg">Try again</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {failed.length > 0 && (
          <div role="alert" className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>Couldn't load {failed.join(', ')}. Those counts may be out of date.</span>
            <button onClick={() => load()} className="text-white text-sm font-medium bg-amber-500/20 hover:bg-amber-500/30 px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        {/* Next meeting CTA — biggest action on this page */}
        <NextMeetingCard meetings={meetings} onMeetingChanged={reloadSilently} />

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Open Rocks"
            value={openRocks}
            subtitle="this quarter"
            color="blue"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth={1.75} />
                <circle cx="12" cy="12" r="4" strokeWidth={1.75} />
              </svg>
            }
          />
          <StatCard
            title="Issues to Solve"
            value={openIssues}
            subtitle="currently open"
            color="red"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
          <StatCard
            title="To-Dos Due This Week"
            value={dueTodos}
            subtitle="pending items"
            color="yellow"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Next Meeting"
            value={nextMeeting ? fmtDate(nextMeeting.meeting_date) : 'None'}
            subtitle={nextMeeting ? nextMeeting.team : undefined}
            color="green"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        </div>

        {/* Integration tile — QuickBooks, admin/leadership only */}
        {(user?.role === 'admin' || user?.role === 'leadership') && qbo && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              <div className="w-7 h-7 bg-green-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white">QuickBooks</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] md:text-xs text-slate-400">Revenue</p>
                <p className="text-base md:text-lg font-bold text-green-400 truncate">{fmt.format(qbo.total_revenue)}</p>
              </div>
              <div>
                <p className="text-[11px] md:text-xs text-slate-400">Net Income</p>
                <p className={`text-base md:text-lg font-bold truncate ${qbo.net_income >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt.format(qbo.net_income)}
                </p>
              </div>
              <div>
                <p className="text-[11px] md:text-xs text-slate-400">AR</p>
                <p className="text-base md:text-lg font-bold text-white truncate">{fmt.format(qbo.accounts_receivable)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Two panel row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Issues */}
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Issues</h2>
              <Link to="/issues" className="text-sm text-blue-400 hover:text-blue-300 transition-colors min-h-[44px] inline-flex items-center px-2 -mr-2">View all</Link>
            </div>
            <div className="divide-y divide-slate-700/50">
              {recentIssues.length === 0 ? (
                <p className="text-slate-400 text-sm p-5">No open issues.</p>
              ) : recentIssues.map((issue) => (
                <div key={issue.id} className="px-5 py-3 flex items-center gap-3">
                  <StatusBadge status={issue.priority} />
                  <span className="text-sm text-white flex-1 truncate" title={issue.title}>{issue.title}</span>
                  <StatusBadge status={issue.status} />
                </div>
              ))}
            </div>
          </div>

          {/* This Week's Todos */}
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">This Week's To-Dos</h2>
              <Link to="/todos" className="text-sm text-blue-400 hover:text-blue-300 transition-colors min-h-[44px] inline-flex items-center px-2 -mr-2">View all</Link>
            </div>
            <div className="divide-y divide-slate-700/50">
              {weekTodos.length === 0 ? (
                <p className="text-slate-400 text-sm p-5">Nothing due this week.</p>
              ) : weekTodos.map((todo) => {
                const isOverdue = isBeforeToday(todo.due_date)
                return (
                  <div key={todo.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-4 h-4 rounded border border-slate-600 flex-shrink-0" aria-hidden="true" />
                    <span className={`text-sm flex-1 truncate ${isOverdue ? 'text-red-400' : 'text-white'}`} title={todo.title}>
                      {todo.title}
                    </span>
                    {todo.due_date && (
                      <span className={`text-xs whitespace-nowrap ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                        {isOverdue ? 'Overdue · ' : ''}{fmtDate(todo.due_date)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Dashboard

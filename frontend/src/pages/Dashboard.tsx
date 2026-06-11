import React, { useCallback, useEffect, useState } from 'react'
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
  getJobNimbusSummaryApi,
} from '../services/api'
import { Rock, Issue, Todo, Meeting, QBOSummary, JobNimbusSummary } from '../types'
import { useAuthStore } from '../store/authStore'
import { isoDate, parseLocalDate } from '../utils/dates'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtDate = (d: string) =>
  new Date(isoDate(d) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const Dashboard: React.FC = () => {
  const { user } = useAuthStore()
  const [rocks, setRocks] = useState<Rock[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [qbo, setQbo] = useState<QBOSummary | null>(null)
  const [jn, setJn] = useState<JobNimbusSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = new Date()
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      // Use allSettled so a single 5xx (e.g. transient JN/QBO failure) doesn't
      // wipe out the whole dashboard. Each tile renders independently.
      const [rocksRes, issuesRes, todosRes, meetingsRes] = await Promise.allSettled([
        getRocksApi(undefined, Math.ceil((now.getMonth() + 1) / 3), now.getFullYear()),
        getIssuesApi(undefined, 'open'),
        getTodosApi(),
        getMeetingsApi(),
      ])
      if (rocksRes.status    === 'fulfilled') setRocks(rocksRes.value.data)
      if (issuesRes.status   === 'fulfilled') setIssues(issuesRes.value.data)
      if (todosRes.status    === 'fulfilled') setTodos(todosRes.value.data)
      if (meetingsRes.status === 'fulfilled') setMeetings(meetingsRes.value.data)

      if (user?.role === 'admin' || user?.role === 'leadership') {
        const [qboRes, jnRes] = await Promise.allSettled([getQBOSummaryApi(), getJobNimbusSummaryApi()])
        if (qboRes.status === 'fulfilled') setQbo(qboRes.value.data)
        if (jnRes.status === 'fulfilled') setJn(jnRes.value.data)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const openRocks = rocks.filter((r) => r.status !== 'done').length
  const openIssues = issues.filter((i) => i.status === 'open').length
  const dueTodos = todos.filter((t) => {
    if (t.status === 'complete') return false
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    return d <= endOfWeek
  }).length
  const nextMeeting = meetings
    .filter((m) => m.status !== 'complete' && parseLocalDate(m.meeting_date) >= today)
    .sort((a, b) => parseLocalDate(a.meeting_date).getTime() - parseLocalDate(b.meeting_date).getTime())[0]

  const recentIssues = [...issues].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5)

  const weekTodos = todos
    .filter((t) => t.status === 'pending')
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
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">

        {/* Next meeting CTA — biggest action on this page */}
        <NextMeetingCard meetings={meetings} onMeetingChanged={load} />

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

        {/* JobNimbus tile — admin/leadership only */}
        {(user?.role === 'admin' || user?.role === 'leadership') && jn && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              <div className="w-7 h-7 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white">JobNimbus</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] md:text-xs text-slate-400">Open Jobs</p>
                <p className="text-base md:text-lg font-bold text-blue-400">{jn.open_jobs}</p>
              </div>
              <div>
                <p className="text-[11px] md:text-xs text-slate-400">Won This Month</p>
                <p className="text-base md:text-lg font-bold text-green-400">{jn.won_this_month}</p>
              </div>
              <div>
                <p className="text-[11px] md:text-xs text-slate-400">Total Jobs</p>
                <p className="text-base md:text-lg font-bold text-white">{jn.total_jobs}</p>
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
              <a href="/issues" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all</a>
            </div>
            <div className="divide-y divide-slate-700/50">
              {recentIssues.length === 0 ? (
                <p className="text-slate-500 text-sm p-5">No open issues.</p>
              ) : recentIssues.map((issue) => (
                <div key={issue.id} className="px-5 py-3 flex items-center gap-3">
                  <StatusBadge status={issue.priority} />
                  <span className="text-sm text-white flex-1 truncate">{issue.title}</span>
                  <StatusBadge status={issue.status} />
                </div>
              ))}
            </div>
          </div>

          {/* This Week's Todos */}
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">This Week's To-Dos</h2>
              <a href="/todos" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all</a>
            </div>
            <div className="divide-y divide-slate-700/50">
              {weekTodos.length === 0 ? (
                <p className="text-slate-500 text-sm p-5">No pending to-dos.</p>
              ) : weekTodos.map((todo) => {
                const isOverdue = todo.due_date && new Date(todo.due_date) < today
                return (
                  <div key={todo.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-4 h-4 rounded border border-slate-600 flex-shrink-0" />
                    <span className={`text-sm flex-1 truncate ${isOverdue ? 'text-red-400' : 'text-white'}`}>
                      {todo.title}
                    </span>
                    {todo.due_date && (
                      <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                        {fmtDate(todo.due_date)}
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

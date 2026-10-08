import React, { useEffect, useState, useCallback, useRef } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import StatusBadge from '../components/StatusBadge'
import {
  getIssuesApi,
  createIssueApi,
  updateIssueApi,
  deleteIssueApi,
  voteIssueApi,
  unvoteIssueApi,
  getUsersRosterApi,
} from '../services/api'
import { Issue, TeamType, RosterUser } from '../types'
import { useAuthStore } from '../store/authStore'
import { TEAMS, accessibleTeams, defaultTeamFor, isSingleTeamRole, teamLabel } from '../utils/teams'
import { useDataChanged } from '../utils/dataEvents'
import { useDialog } from '../components/useDialog'

// created_at is a full timestamp, so the browser's own date is right here.
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const ownerNameOf = (issue: Issue, users: RosterUser[]): string => {
  if (issue.owner_first_name || issue.owner_last_name) return `${issue.owner_first_name || ''} ${issue.owner_last_name || ''}`.trim()
  const u = users.find((x) => x.id === issue.owner_id)
  return u ? `${u.first_name} ${u.last_name}` : '—'
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'solved'
type SortField = 'votes' | 'priority' | 'created_at'

interface IssueModalProps {
  issue?: Issue | null
  users: RosterUser[]
  /** The active team filter, so a new issue lands where the person is looking. */
  defaultTeam: string
  onClose: () => void
  onSave: () => void
}

const IssueModal: React.FC<IssueModalProps> = ({ issue, users, defaultTeam, onClose, onSave }) => {
  const { user } = useAuthStore()
  const teamOptions = accessibleTeams(user)
  const [form, setForm] = useState({
    title: issue?.title || '',
    description: issue?.description || '',
    priority: issue?.priority || 'medium' as Issue['priority'],
    status: issue?.status || 'open' as Issue['status'],
    team: issue?.team || defaultTeamFor(user, defaultTeam),
    owner_id: issue?.owner_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialog<HTMLDivElement>(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // An empty owner is sent as null; the team can't change on edit.
      const payload = { ...form, owner_id: form.owner_id || null }
      if (issue) {
        const { team: _team, ...rest } = payload
        await updateIssueApi(issue.id, rest)
      } else {
        await createIssueApi(payload)
      }
      onSave()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 px-4 py-6 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="issue-modal-title" className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 id="issue-modal-title" className="text-base font-semibold text-white">{issue ? 'Edit Issue' : 'New Issue'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          <div>
            <label htmlFor="issue-title" className="block text-xs font-medium text-slate-400 mb-1">Title *</label>
            <input id="issue-title" required className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="issue-description" className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <textarea id="issue-description" rows={4} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="issue-priority" className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
              <select id="issue-priority" className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Issue['priority'] })}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label htmlFor="issue-status" className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select id="issue-status" className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Issue['status'] })}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="solved">Solved</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="issue-team" className="block text-xs font-medium text-slate-400 mb-1">Team{issue ? ' (set when created)' : ''}</label>
              <select id="issue-team" className={inputCls} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} disabled={!!issue || teamOptions.length === 1}>
                {TEAMS.filter((t) => (teamOptions as readonly string[]).includes(t.value) || t.value === form.team).map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="issue-owner" className="block text-xs font-medium text-slate-400 mb-1">Owner</label>
              <select id="issue-owner" className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value="">— Me —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 min-h-[44px] rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : issue ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const Issues: React.FC = () => {
  const { user } = useAuthStore()
  const singleTeam = isSingleTeamRole(user)
  const [team, setTeam] = useState<TeamType | 'all'>(
    singleTeam ? user!.team as TeamType : 'all'
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [issues, setIssues] = useState<Issue[]>([])
  const [users, setUsers] = useState<RosterUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editIssue, setEditIssue] = useState<Issue | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('votes')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [votingId, setVotingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  // Later refreshes swap data in place, and a slow earlier response never
  // overwrites the filter that is now selected.
  const requestRef = useRef(0)
  const loadIssues = useCallback(async () => {
    const requestId = ++requestRef.current
    setError(null)
    try {
      const res = await getIssuesApi(
        team === 'all' ? undefined : team,
        statusFilter === 'all' ? undefined : statusFilter
      )
      if (requestId !== requestRef.current) return
      setIssues(res.data)
    } catch (e: any) {
      if (requestId !== requestRef.current) return
      setError(e.message)
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [team, statusFilter])

  useEffect(() => { setLoading(true); loadIssues() }, [loadIssues])
  useDataChanged(['issues'], loadIssues)
  useEffect(() => { getUsersRosterApi().then((r) => setUsers(r.data)).catch(() => {}) }, [])

  const handleDelete = async (issue: Issue) => {
    if (!confirm(`Delete the issue "${issue.title}"? This cannot be undone.`)) return
    try {
      await deleteIssueApi(issue.id)
      await loadIssues()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const markSolved = async (issue: Issue) => {
    try {
      await updateIssueApi(issue.id, { status: 'solved' })
      await loadIssues()
    } catch (e: any) {
      setError(e.message)
    }
  }

  // Votes are toggled optimistically so the tally reorders immediately, then
  // reconciled with the count the server returns (or rolled back on failure).
  const toggleVote = async (issue: Issue) => {
    const casting = !issue.voted
    const applyTally = (voted: boolean, vote_count: number) =>
      setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, voted, vote_count } : i)))

    setVotingId(issue.id)
    setError(null)
    applyTally(casting, (issue.vote_count || 0) + (casting ? 1 : -1))

    try {
      const res = casting ? await voteIssueApi(issue.id) : await unvoteIssueApi(issue.id)
      applyTally(res.data.voted, res.data.vote_count)
    } catch (e: any) {
      applyTally(issue.voted, issue.vote_count || 0)
      setError(
        `Could not ${casting ? 'add your vote to' : 'remove your vote from'} "${issue.title}". ` +
        'The tally is unchanged — try again in a moment.'
      )
    } finally {
      setVotingId(null)
    }
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 }
  const q = search.trim().toLowerCase()
  const filtered = issues.filter((i) => {
    if (mineOnly && i.owner_id !== user?.id) return false
    if (q && !i.title.toLowerCase().includes(q) && !(i.description || '').toLowerCase().includes(q)) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'votes') {
      // Equal tallies fall back to priority, then newest first, so the order is
      // stable while votes come in.
      const diff = (a.vote_count || 0) - (b.vote_count || 0)
      if (diff !== 0) return sortDir === 'asc' ? diff : -diff
      const byPriority = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (byPriority !== 0) return byPriority
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    if (sortField === 'priority') {
      const diff = priorityOrder[a.priority] - priorityOrder[b.priority]
      return sortDir === 'asc' ? diff : -diff
    }
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return sortDir === 'asc' ? diff : -diff
  })

  // Rank badges only make sense while the list is actually ordered by tally.
  const rankedByVotes = sortField === 'votes' && sortDir === 'desc'

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'votes' ? 'desc' : 'asc') }
  }

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'solved', label: 'Solved' },
  ]

  return (
    <>
      <Header
        title="Issues"
        actions={
          <button
            onClick={() => { setEditIssue(null); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Issue
          </button>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <TeamFilter value={team} onChange={setTeam} />
          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1" role="group" aria-label="Filter by status">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                aria-pressed={statusFilter === tab.key}
                className={`text-xs font-medium px-3 py-2 min-h-[40px] rounded-md transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Search issues"
            placeholder="Search issues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
          />
          <button
            onClick={() => setMineOnly((v) => !v)}
            aria-pressed={mineOnly}
            className={`text-xs font-medium px-3 py-2 min-h-[44px] rounded-lg border transition-colors ${
              mineOnly
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            Mine only
          </button>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No issues found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide"
                    aria-sort={sortField === 'votes' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" onClick={() => toggleSort('votes')} className="flex items-center gap-1 uppercase tracking-wide hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                      Votes {sortField === 'votes' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide"
                    aria-sort={sortField === 'priority' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" onClick={() => toggleSort('priority')} className="flex items-center gap-1 uppercase tracking-wide hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                      Priority {sortField === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Title</th>
                  {!singleTeam && <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Team</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Owner</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide"
                    aria-sort={sortField === 'created_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" onClick={() => toggleSort('created_at')} className="flex items-center gap-1 uppercase tracking-wide hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                      Created {sortField === 'created_at' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {sorted.map((issue, index) => {
                  const ownerName = ownerNameOf(issue, users)
                  const expandable = !!issue.description
                  const expanded = expandedId === issue.id
                  return (
                    <React.Fragment key={issue.id}>
                      <tr
                        className={`hover:bg-slate-700/20 transition-colors ${expandable ? 'cursor-pointer' : ''}`}
                        onClick={() => expandable && setExpandedId(expanded ? null : issue.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleVote(issue)}
                              disabled={votingId === issue.id}
                              aria-pressed={issue.voted}
                              aria-label={issue.voted
                                ? `Remove your vote from ${issue.title}. ${issue.vote_count || 0} votes`
                                : `Vote for ${issue.title}. ${issue.vote_count || 0} votes`}
                              title={issue.voted ? 'Remove your vote' : 'Vote for this issue'}
                              className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border transition-colors disabled:opacity-60 ${
                                issue.voted
                                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-slate-700/40 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 15l7-7 7 7" />
                              </svg>
                              <span className="text-sm font-semibold tabular-nums">{issue.vote_count || 0}</span>
                            </button>
                            {rankedByVotes && index < 3 && (issue.vote_count || 0) > 0 && (
                              <span className="text-xs font-semibold text-blue-400" title={`Ranked #${index + 1} by votes`}>
                                #{index + 1}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={issue.priority} />
                        </td>
                        <td className="px-4 py-3 text-white font-medium">
                          {expandable ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : issue.id) }}
                              aria-expanded={expanded}
                              className="text-left inline-flex items-center gap-1.5 min-h-[44px] -my-2 rounded hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {issue.title}
                            </button>
                          ) : issue.title}
                        </td>
                        {!singleTeam && (
                          <td className="px-4 py-3 text-slate-400">{teamLabel(issue.team)}</td>
                        )}
                        <td className="px-4 py-3 text-slate-400">{ownerName}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={issue.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-400">{fmtDate(issue.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {issue.status !== 'solved' && (
                              <button
                                onClick={() => markSolved(issue)}
                                title="Mark solved"
                                aria-label={`Mark ${issue.title} solved`}
                                className="text-slate-400 hover:text-green-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => { setEditIssue(issue); setShowModal(true) }}
                              title="Edit"
                              aria-label={`Edit ${issue.title}`}
                              className="text-slate-400 hover:text-blue-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(issue)}
                              title="Delete"
                              aria-label={`Delete ${issue.title}`}
                              className="text-slate-400 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && issue.description && (
                        <tr className="bg-slate-700/10">
                          <td colSpan={!singleTeam ? 8 : 7} className="px-8 py-3">
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">{issue.description}</p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <IssueModal
          issue={editIssue}
          users={users}
          defaultTeam={team}
          onClose={() => setShowModal(false)}
          onSave={loadIssues}
        />
      )}
    </>
  )
}

export default Issues

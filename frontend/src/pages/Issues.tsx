import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import StatusBadge from '../components/StatusBadge'
import {
  getIssuesApi,
  createIssueApi,
  updateIssueApi,
  deleteIssueApi,
  getUsersApi,
} from '../services/api'
import { Issue, TeamType, User } from '../types'
import { useAuthStore } from '../store/authStore'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

type StatusFilter = 'all' | 'open' | 'in_progress' | 'solved'

interface IssueModalProps {
  issue?: Issue | null
  users: User[]
  onClose: () => void
  onSave: () => void
}

const IssueModal: React.FC<IssueModalProps> = ({ issue, users, onClose, onSave }) => {
  const { user } = useAuthStore()
  const [form, setForm] = useState({
    title: issue?.title || '',
    description: issue?.description || '',
    priority: issue?.priority || 'medium' as Issue['priority'],
    status: issue?.status || 'open' as Issue['status'],
    team: issue?.team || (user?.role === 'manager' ? user.team : 'sales'),
    owner_id: issue?.owner_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (issue) {
        await updateIssueApi(issue.id, form)
      } else {
        await createIssueApi(form)
      }
      onSave()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{issue ? 'Edit Issue' : 'New Issue'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Title *</label>
            <input required className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <textarea rows={4} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
              <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Issue['priority'] })}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Issue['status'] })}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="solved">Solved</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Team</label>
              <select className={inputCls} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} disabled={user?.role === 'manager'}>
                <option value="sales">Sales</option>
                <option value="production">Production</option>
                <option value="leadership">Leadership</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Owner</label>
              <select className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value="">— None —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
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
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? user.team as TeamType : 'all'
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [issues, setIssues] = useState<Issue[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editIssue, setEditIssue] = useState<Issue | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'priority' | 'created_at'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getIssuesApi(
        team === 'all' ? undefined : team,
        statusFilter === 'all' ? undefined : statusFilter
      )
      setIssues(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [team, statusFilter])

  useEffect(() => { loadIssues() }, [loadIssues])
  useEffect(() => { getUsersApi().then((r) => setUsers(r.data)).catch(() => {}) }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this issue?')) return
    try {
      await deleteIssueApi(id)
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

  const priorityOrder = { high: 0, medium: 1, low: 2 }
  const sorted = [...issues].sort((a, b) => {
    if (sortField === 'priority') {
      const diff = priorityOrder[a.priority] - priorityOrder[b.priority]
      return sortDir === 'asc' ? diff : -diff
    }
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return sortDir === 'asc' ? diff : -diff
  })

  const toggleSort = (field: 'priority' | 'created_at') => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
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
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Issue
          </button>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <div className="flex flex-wrap items-center gap-4">
          <TeamFilter value={team} onChange={setTeam} />
          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No issues found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th
                    onClick={() => toggleSort('priority')}
                    className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-white transition-colors"
                  >
                    Priority {sortField === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Title</th>
                  {user?.role !== 'manager' && <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Team</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Owner</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
                  <th
                    onClick={() => toggleSort('created_at')}
                    className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-white transition-colors"
                  >
                    Created {sortField === 'created_at' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {sorted.map((issue) => {
                  const ownerName = issue.owner
                    ? `${issue.owner.first_name} ${issue.owner.last_name}`
                    : users.find((u) => u.id === issue.owner_id)
                      ? `${users.find((u) => u.id === issue.owner_id)!.first_name} ${users.find((u) => u.id === issue.owner_id)!.last_name}`
                      : '—'
                  return (
                    <React.Fragment key={issue.id}>
                      <tr
                        className="hover:bg-slate-700/20 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                      >
                        <td className="px-4 py-3">
                          <StatusBadge status={issue.priority} />
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{issue.title}</td>
                        {user?.role !== 'manager' && (
                          <td className="px-4 py-3 text-slate-400 capitalize">{issue.team}</td>
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
                                className="text-slate-400 hover:text-green-400 transition-colors p-1 rounded"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => { setEditIssue(issue); setShowModal(true) }}
                              className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(issue.id)}
                              className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === issue.id && issue.description && (
                        <tr className="bg-slate-700/10">
                          <td colSpan={user?.role !== 'manager' ? 7 : 6} className="px-8 py-3">
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
          onClose={() => setShowModal(false)}
          onSave={loadIssues}
        />
      )}
    </>
  )
}

export default Issues

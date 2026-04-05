import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import StatusBadge from '../components/StatusBadge'
import { getRocksApi, createRockApi, updateRockApi, deleteRockApi, getUsersApi } from '../services/api'
import { Rock, TeamType, User } from '../types'
import { useAuthStore } from '../store/authStore'

const statusColumns: { key: Rock['status']; label: string }[] = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'on_track', label: 'On Track' },
  { key: 'off_track', label: 'Off Track' },
  { key: 'done', label: 'Done' },
]

const statusColors: Record<Rock['status'], string> = {
  not_started: 'border-slate-600',
  on_track: 'border-green-500/40',
  off_track: 'border-yellow-500/40',
  done: 'border-blue-500/40',
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

interface RockModalProps {
  rock?: Rock | null
  users: User[]
  teams: string[]
  onClose: () => void
  onSave: () => void
}

const RockModal: React.FC<RockModalProps> = ({ rock, users, teams, onClose, onSave }) => {
  const { user } = useAuthStore()
  const now = new Date()
  const [form, setForm] = useState({
    title: rock?.title || '',
    description: rock?.description || '',
    team: rock?.team || (user?.role === 'manager' ? user.team : 'sales'),
    owner_id: rock?.owner_id || '',
    quarter: rock?.quarter || Math.ceil((now.getMonth() + 1) / 3),
    year: rock?.year || now.getFullYear(),
    status: rock?.status || 'not_started' as Rock['status'],
    completion_percentage: rock?.completion_percentage || 0,
    due_date: rock?.due_date || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (rock) {
        await updateRockApi(rock.id, form)
      } else {
        await createRockApi(form)
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
          <h2 className="text-base font-semibold text-white">{rock ? 'Edit Rock' : 'New Rock'}</h2>
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
            <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Team</label>
              <select className={inputCls} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} disabled={user?.role === 'manager'}>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Quarter</label>
              <select className={inputCls} value={form.quarter} onChange={(e) => setForm({ ...form, quarter: +e.target.value })}>
                {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Year</label>
              <input type="number" className={inputCls} value={form.year} onChange={(e) => setForm({ ...form, year: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Rock['status'] })}>
                <option value="not_started">Not Started</option>
                <option value="on_track">On Track</option>
                <option value="off_track">Off Track</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Completion %</label>
              <input type="number" min={0} max={100} className={inputCls} value={form.completion_percentage} onChange={(e) => setForm({ ...form, completion_percentage: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : rock ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const Rocks: React.FC = () => {
  const { user } = useAuthStore()
  const now = new Date()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? user.team as TeamType : 'all'
  )
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [year, setYear] = useState(now.getFullYear())
  const [rocks, setRocks] = useState<Rock[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editRock, setEditRock] = useState<Rock | null>(null)

  const loadRocks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getRocksApi(team === 'all' ? undefined : team, quarter, year)
      setRocks(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [team, quarter, year])

  useEffect(() => { loadRocks() }, [loadRocks])

  useEffect(() => {
    getUsersApi().then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rock?')) return
    try {
      await deleteRockApi(id)
      await loadRocks()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const canEdit = user?.role !== 'manager' || true // managers can edit their team's rocks

  return (
    <>
      <Header
        title="Rocks"
        actions={
          <button
            onClick={() => { setEditRock(null); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Rock
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <TeamFilter value={team} onChange={setTeam} />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Quarter:</label>
            <select value={quarter} onChange={(e) => setQuarter(+e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Year:</label>
            <select value={year} onChange={(e) => setYear(+e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {statusColumns.map(({ key, label }) => {
              const col = rocks.filter((r) => r.status === key)
              return (
                <div key={key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</h3>
                    <span className="text-xs font-medium text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.length === 0 ? (
                      <div className="text-center py-8 text-slate-600 text-xs bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
                        No rocks
                      </div>
                    ) : col.map((rock) => {
                      const ownerName = rock.owner
                        ? `${rock.owner.first_name} ${rock.owner.last_name}`
                        : users.find((u) => u.id === rock.owner_id)
                          ? `${users.find((u) => u.id === rock.owner_id)!.first_name} ${users.find((u) => u.id === rock.owner_id)!.last_name}`
                          : 'Unassigned'
                      return (
                        <div key={rock.id} className={`bg-slate-800 rounded-xl border-l-4 ${statusColors[rock.status]} border border-slate-700 p-4 space-y-3`}>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-medium text-white leading-snug">{rock.title}</h4>
                            <StatusBadge status={rock.status} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{ownerName}</span>
                            {rock.due_date && <span>{fmtDate(rock.due_date)}</span>}
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                              <span>Progress</span>
                              <span>{rock.completion_percentage}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  rock.status === 'done' ? 'bg-blue-500' :
                                  rock.status === 'on_track' ? 'bg-green-500' :
                                  rock.status === 'off_track' ? 'bg-yellow-500' : 'bg-slate-500'
                                }`}
                                style={{ width: `${rock.completion_percentage}%` }}
                              />
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex gap-1 pt-1">
                              <button
                                onClick={() => { setEditRock(rock); setShowModal(true) }}
                                className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-1.5 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(rock.id)}
                                className="text-xs bg-slate-700 hover:bg-red-600/20 text-slate-400 hover:text-red-400 rounded-lg px-2 py-1.5 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <RockModal
          rock={editRock}
          users={users}
          teams={['sales', 'production', 'leadership']}
          onClose={() => setShowModal(false)}
          onSave={loadRocks}
        />
      )}
    </>
  )
}

export default Rocks

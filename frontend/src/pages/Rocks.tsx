import React, { useEffect, useState, useCallback, useRef } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import StatusBadge from '../components/StatusBadge'
import { getRocksApi, createRockApi, updateRockApi, deleteRockApi, getUsersRosterApi } from '../services/api'
import { Rock, TeamType, RosterUser } from '../types'
import { useAuthStore } from '../store/authStore'
import { fireRockDoneConfetti } from '../utils/confetti'
import { TEAMS, accessibleTeams, defaultTeamFor, isSingleTeamRole } from '../utils/teams'
import { formatDate, isoDate, currentQuarter } from '../utils/dates'
import { useDataChanged } from '../utils/dataEvents'
import { useDialog } from '../components/useDialog'

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

const fmtDate = (d: string) => formatDate(d)

const ownerNameOf = (rock: Rock, users: RosterUser[]): string => {
  if (rock.owner_first_name || rock.owner_last_name) return `${rock.owner_first_name || ''} ${rock.owner_last_name || ''}`.trim()
  const u = users.find((x) => x.id === rock.owner_id)
  return u ? `${u.first_name} ${u.last_name}` : 'Unassigned'
}

interface RockModalProps {
  rock?: Rock | null
  users: RosterUser[]
  /** The active filters, so a new rock lands where the person is looking. */
  defaults: { team: string; quarter: number; year: number }
  onClose: () => void
  onSave: () => void
}

const RockModal: React.FC<RockModalProps> = ({ rock, users, defaults, onClose, onSave }) => {
  const { user } = useAuthStore()
  const teamOptions = accessibleTeams(user)
  const [form, setForm] = useState({
    title: rock?.title || '',
    description: rock?.description || '',
    team: rock?.team || defaultTeamFor(user, defaults.team),
    owner_id: rock?.owner_id || '',
    quarter: rock?.quarter || defaults.quarter,
    year: rock?.year || defaults.year,
    status: rock?.status || 'not_started' as Rock['status'],
    completion_percentage: rock?.completion_percentage || 0,
    due_date: isoDate(rock?.due_date),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialog<HTMLDivElement>(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const wasDone = rock?.status === 'done'
      // An empty owner or date is sent as null; the team can't change on edit.
      const payload = { ...form, owner_id: form.owner_id || null, due_date: form.due_date || null }
      if (rock) {
        const { team: _team, ...rest } = payload
        await updateRockApi(rock.id, rest)
      } else {
        await createRockApi(payload)
      }
      // Confetti when a rock moves into the done column.
      if (form.status === 'done' && !wasDone) fireRockDoneConfetti()
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="rock-modal-title" className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 id="rock-modal-title" className="text-base font-semibold text-white">{rock ? 'Edit Rock' : 'New Rock'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          <div>
            <label htmlFor="rock-title" className="block text-xs font-medium text-slate-400 mb-1">Title *</label>
            <input id="rock-title" required className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="rock-description" className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <textarea id="rock-description" rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rock-team" className="block text-xs font-medium text-slate-400 mb-1">Team{rock ? ' (set when created)' : ''}</label>
              <select id="rock-team" className={inputCls} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} disabled={!!rock || teamOptions.length === 1}>
                {TEAMS.filter((t) => (teamOptions as readonly string[]).includes(t.value) || t.value === form.team).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rock-owner" className="block text-xs font-medium text-slate-400 mb-1">Owner</label>
              <select id="rock-owner" className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value="">— Me —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="rock-quarter" className="block text-xs font-medium text-slate-400 mb-1">Quarter</label>
              <select id="rock-quarter" className={inputCls} value={form.quarter} onChange={(e) => setForm({ ...form, quarter: +e.target.value })}>
                {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rock-year" className="block text-xs font-medium text-slate-400 mb-1">Year</label>
              <input id="rock-year" type="number" className={inputCls} value={form.year} onChange={(e) => setForm({ ...form, year: +e.target.value })} />
            </div>
            <div>
              <label htmlFor="rock-status" className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select id="rock-status" className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Rock['status'] })}>
                <option value="not_started">Not Started</option>
                <option value="on_track">On Track</option>
                <option value="off_track">Off Track</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rock-completion" className="block text-xs font-medium text-slate-400 mb-1">Completion %</label>
              <input id="rock-completion" type="number" min={0} max={100} className={inputCls} value={form.completion_percentage} onChange={(e) => setForm({ ...form, completion_percentage: +e.target.value })} />
            </div>
            <div>
              <label htmlFor="rock-due" className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
              <input id="rock-due" type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 min-h-[44px] rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors disabled:opacity-60">
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
    isSingleTeamRole(user) ? user!.team as TeamType : 'all'
  )
  const [quarter, setQuarter] = useState(currentQuarter(now))
  const [year, setYear] = useState(now.getFullYear())
  const [rocks, setRocks] = useState<Rock[]>([])
  const [users, setUsers] = useState<RosterUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editRock, setEditRock] = useState<Rock | null>(null)
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  // Later refreshes swap data in place, and a slow earlier response never
  // overwrites the filter that is now selected.
  const requestRef = useRef(0)
  const loadRocks = useCallback(async () => {
    const requestId = ++requestRef.current
    setError(null)
    try {
      const res = await getRocksApi(team === 'all' ? undefined : team, quarter, year)
      if (requestId !== requestRef.current) return
      setRocks(res.data)
    } catch (e: any) {
      if (requestId !== requestRef.current) return
      setError(e.message)
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [team, quarter, year])

  useEffect(() => { setLoading(true); loadRocks() }, [loadRocks])
  useDataChanged(['rocks'], loadRocks)

  useEffect(() => {
    getUsersRosterApi().then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  const handleDelete = async (rock: Rock) => {
    if (!confirm(`Delete the rock "${rock.title}"? This cannot be undone.`)) return
    try {
      await deleteRockApi(rock.id)
      await loadRocks()
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <>
      <Header
        title="Rocks"
        actions={
          <button
            onClick={() => { setEditRock(null); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Rock
          </button>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <TeamFilter value={team} onChange={setTeam} />
          <input
            type="search"
            aria-label="Search rocks"
            placeholder="Search rocks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-44"
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
          <div className="flex items-center gap-2">
            <label htmlFor="rocks-quarter" className="text-sm text-slate-400">Quarter:</label>
            <select id="rocks-quarter" value={quarter} onChange={(e) => setQuarter(+e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500">
              {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="rocks-year" className="text-sm text-slate-400">Year:</label>
            <select id="rocks-year" value={year} onChange={(e) => setYear(+e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500">
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
              const sq = search.trim().toLowerCase()
              const col = rocks.filter((r) => {
                if (r.status !== key) return false
                if (mineOnly && r.owner_id !== user?.id) return false
                if (sq && !r.title.toLowerCase().includes(sq) && !(r.description || '').toLowerCase().includes(sq)) return false
                return true
              })
              return (
                <div key={key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</h2>
                    <span className="text-xs font-medium text-slate-300 bg-slate-700 rounded-full px-2 py-0.5" aria-label={`${col.length} rocks`}>{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
                        No rocks
                      </div>
                    ) : col.map((rock) => {
                      const ownerName = ownerNameOf(rock, users)
                      return (
                        <div key={rock.id} className={`bg-slate-800 rounded-xl border-l-4 ${statusColors[rock.status]} border border-slate-700 p-4 space-y-3`}>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-medium text-white leading-snug">{rock.title}</h3>
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
                          {(
                            <div className="flex gap-1 pt-1">
                              <button
                                onClick={() => { setEditRock(rock); setShowModal(true) }}
                                aria-label={`Edit rock ${rock.title}`}
                                className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-2 min-h-[40px] transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(rock)}
                                aria-label={`Delete rock ${rock.title}`}
                                className="text-xs bg-slate-700 hover:bg-red-600/20 text-slate-400 hover:text-red-400 rounded-lg px-3 py-2 min-h-[40px] min-w-[40px] transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          defaults={{ team, quarter, year }}
          onClose={() => setShowModal(false)}
          onSave={loadRocks}
        />
      )}
    </>
  )
}

export default Rocks

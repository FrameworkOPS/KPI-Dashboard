import React, { useEffect, useState, useCallback, useRef } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import {
  getScorecardApi,
  createScorecardEntryApi,
  updateScorecardEntryApi,
  deleteScorecardEntryApi,
  createWeekFromTemplateApi,
} from '../services/api'
import { ScorecardEntry, TeamType } from '../types'
import { useAuthStore } from '../store/authStore'

// ── Date helpers ──────────────────────────────────────────────────────────────

const getMondayOf = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const formatWeek = (monday: Date) =>
  `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

const toISO = (date: Date) => date.toISOString().split('T')[0]

// ── Formatting ────────────────────────────────────────────────────────────────

function formatValue(value: number | string | null | undefined, format: string): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(n)) return String(value)
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n)
    case 'percent':
      return `${(n * 100).toFixed(1)}%`
    case 'number':
      return n % 1 === 0 ? n.toString() : n.toFixed(1)
    default:
      return n.toString()
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

type StatusState = 'on_track' | 'off_track' | 'at_risk'

function getStatus(entry: ScorecardEntry): StatusState {
  if (entry.is_on_track === null || entry.is_on_track === undefined) return 'off_track'
  if (entry.is_on_track) return 'on_track'
  // If net % is negative, treat as at-risk
  if (
    entry.metric_name.toLowerCase().includes('net %') &&
    entry.actual !== null &&
    entry.actual < 0
  ) {
    return 'at_risk'
  }
  return 'off_track'
}

function StatusBadge({ entry }: { entry: ScorecardEntry }) {
  if (entry.is_on_track === null || entry.is_on_track === undefined) {
    return <span className="text-slate-500 text-xs">—</span>
  }
  const status = getStatus(entry)
  if (status === 'on_track') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">
        On Track
      </span>
    )
  }
  if (status === 'at_risk') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
        At Risk
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
      Off Track
    </span>
  )
}

// ── Data source badge ─────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const s = (source || '').toLowerCase()
  let label = source || '—'
  let cls = 'bg-slate-600/40 text-slate-400 border-slate-600/40'

  if (s === 'hubspot') {
    label = 'HubSpot'
    cls = 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  } else if (s === 'qbo') {
    label = 'QBO'
    cls = 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  } else if (s === 'manual') {
    label = 'Manual'
    cls = 'bg-slate-600/30 text-slate-500 border-slate-600/30'
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${cls}`}>
      {label}
    </span>
  )
}

// ── Inline editable cell ──────────────────────────────────────────────────────

interface InlineEditProps {
  value: number | null
  format: string
  entryId: string
  onSave: (id: string, actual: number | null) => Promise<void>
}

function InlineActualCell({ value, format, entryId, onSave }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value !== null ? String(value) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = async () => {
    setEditing(false)
    const parsed = draft === '' ? null : parseFloat(draft)
    const newVal = draft === '' ? null : (isNaN(parsed as number) ? value : parsed)
    if (newVal !== value) {
      await onSave(entryId, newVal)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') {
      setDraft(value !== null ? String(value) : '')
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="bg-slate-700 border border-blue-500 text-white text-sm rounded px-2 py-1 w-28 text-right focus:outline-none"
      />
    )
  }

  return (
    <button
      onClick={() => {
        setDraft(value !== null ? String(value) : '')
        setEditing(true)
      }}
      className="text-white font-medium hover:text-blue-300 transition-colors cursor-pointer group flex items-center gap-1 ml-auto"
      title="Click to edit"
    >
      {formatValue(value, format)}
      <svg
        className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </button>
  )
}

// ── New Week Modal ────────────────────────────────────────────────────────────

interface NewWeekModalProps {
  defaultTeam: string
  onClose: () => void
  onCreated: () => void
}

function NewWeekModal({ defaultTeam, onClose, onCreated }: NewWeekModalProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>(toISO(getMondayOf(new Date())))
  const [selectedTeam, setSelectedTeam] = useState<string>(defaultTeam === 'all' ? 'leadership' : defaultTeam)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      await createWeekFromTemplateApi(selectedTeam, selectedWeek)
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-white font-semibold text-base mb-4">Create New Week from Template</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="leadership">Leadership</option>
              <option value="sales">Sales</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Week of (Monday)</label>
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create Week'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Empty form ────────────────────────────────────────────────────────────────

const emptyForm = (): Partial<ScorecardEntry> => ({
  metric_name: '',
  goal: null,
  actual: null,
  data_source: '',
  notes: '',
})

// ── Main component ────────────────────────────────────────────────────────────

const Scorecard: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? (user.team as TeamType) : 'all'
  )
  const [weekDate, setWeekDate] = useState<Date>(getMondayOf(new Date()))
  const [entries, setEntries] = useState<ScorecardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ScorecardEntry>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<Partial<ScorecardEntry>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNewWeekModal, setShowNewWeekModal] = useState(false)

  const isLeadershipOrAdmin = user?.role === 'admin' || user?.role === 'leadership'

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getScorecardApi(
        team === 'all' ? undefined : team,
        toISO(weekDate)
      )
      // Sort by sort_order if available, otherwise keep server order
      const sorted = [...res.data].sort((a: ScorecardEntry, b: ScorecardEntry) => {
        const ao = a.sort_order ?? 9999
        const bo = b.sort_order ?? 9999
        return ao - bo
      })
      setEntries(sorted)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [team, weekDate])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const prevWeek = () => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() - 7)
    setWeekDate(d)
  }
  const nextWeek = () => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() + 7)
    setWeekDate(d)
  }

  const startEdit = (entry: ScorecardEntry) => {
    setEditingId(entry.id)
    setEditForm({ ...entry })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      await updateScorecardEntryApi(editingId, editForm)
      await loadEntries()
      setEditingId(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Inline actual-only save (from InlineActualCell)
  const saveActual = async (id: string, actual: number | null) => {
    try {
      await updateScorecardEntryApi(id, { actual })
      await loadEntries()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    try {
      await deleteScorecardEntryApi(id)
      await loadEntries()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createScorecardEntryApi({
        ...addForm,
        team: team === 'all' ? user?.team : team,
        week_of: toISO(weekDate),
      })
      setShowAddForm(false)
      setAddForm(emptyForm())
      await loadEntries()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const canEdit =
    user?.role === 'admin' || user?.role === 'leadership' || user?.role === 'manager'

  const inputCls =
    'bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <>
      <Header
        title="Scorecard"
        actions={
          <div className="flex items-center gap-2">
            {isLeadershipOrAdmin && (
              <button
                onClick={() => setShowNewWeekModal(true)}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                New Week
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Entry
              </button>
            )}
          </div>
        }
      />

      {showNewWeekModal && (
        <NewWeekModal
          defaultTeam={team}
          onClose={() => setShowNewWeekModal(false)}
          onCreated={loadEntries}
        />
      )}

      <div className="p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <TeamFilter value={team} onChange={(t) => setTeam(t)} />
          <div className="flex items-center gap-2">
            <button
              onClick={prevWeek}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-white font-medium px-2">{formatWeek(weekDate)}</span>
            <button
              onClick={nextWeek}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <form
            onSubmit={submitAdd}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5"
          >
            <h3 className="text-sm font-semibold text-white mb-4">New Scorecard Entry</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Metric Name *</label>
                <input
                  required
                  className={inputCls}
                  value={addForm.metric_name || ''}
                  onChange={(e) => setAddForm({ ...addForm, metric_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Goal</label>
                <input
                  type="number"
                  className={inputCls}
                  value={addForm.goal ?? ''}
                  onChange={(e) =>
                    setAddForm({ ...addForm, goal: e.target.value ? +e.target.value : null })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Actual</label>
                <input
                  type="number"
                  className={inputCls}
                  value={addForm.actual ?? ''}
                  onChange={(e) =>
                    setAddForm({ ...addForm, actual: e.target.value ? +e.target.value : null })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Source</label>
                <input
                  className={inputCls}
                  value={addForm.data_source || ''}
                  onChange={(e) => setAddForm({ ...addForm, data_source: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <input
                  className={inputCls}
                  value={addForm.notes || ''}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No entries for this week.
              {isLeadershipOrAdmin && (
                <span>
                  {' '}
                  <button
                    onClick={() => setShowNewWeekModal(true)}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Create from template
                  </button>
                </span>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Metric
                  </th>
                  {user?.role !== 'manager' && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                      Team
                    </th>
                  )}
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Goal
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Actual
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Source
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Notes
                  </th>
                  {canEdit && (
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {entries.map((entry) =>
                  editingId === entry.id ? (
                    // ── Full edit row ──────────────────────────────────────────
                    <tr key={entry.id} className="bg-slate-700/20">
                      <td className="px-4 py-2">
                        <input
                          className={inputCls}
                          value={editForm.metric_name || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, metric_name: e.target.value })
                          }
                        />
                      </td>
                      {user?.role !== 'manager' && (
                        <td className="px-4 py-2 text-slate-400 capitalize">{entry.team}</td>
                      )}
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className={inputCls + ' text-right'}
                          value={editForm.goal ?? ''}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              goal: e.target.value ? +e.target.value : null,
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className={inputCls + ' text-right'}
                          value={editForm.actual ?? ''}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              actual: e.target.value ? +e.target.value : null,
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <select
                          className={inputCls}
                          value={String(editForm.is_on_track)}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              is_on_track:
                                e.target.value === 'true'
                                  ? true
                                  : e.target.value === 'false'
                                  ? false
                                  : null,
                            })
                          }
                        >
                          <option value="null">—</option>
                          <option value="true">On Track</option>
                          <option value="false">Off Track</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className={inputCls}
                          value={editForm.data_source || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, data_source: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className={inputCls}
                          value={editForm.notes || ''}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // ── Read row ───────────────────────────────────────────────
                    <tr key={entry.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{entry.metric_name}</td>
                      {user?.role !== 'manager' && (
                        <td className="px-4 py-3 text-slate-400 capitalize">{entry.team}</td>
                      )}
                      <td className="px-4 py-3 text-right text-slate-300">
                        {entry.goal_text
                          ? entry.goal_text
                          : formatValue(entry.goal, entry.display_format || 'number')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit ? (
                          <InlineActualCell
                            value={entry.actual}
                            format={entry.display_format || 'number'}
                            entryId={entry.id}
                            onSave={saveActual}
                          />
                        ) : (
                          <span className="text-white font-medium">
                            {formatValue(entry.actual, entry.display_format || 'number')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge entry={entry} />
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge source={entry.data_source} />
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                        {entry.notes || '—'}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(entry)}
                              className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded"
                              title="Edit row"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.75}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded"
                              title="Delete row"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.75}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

export default Scorecard

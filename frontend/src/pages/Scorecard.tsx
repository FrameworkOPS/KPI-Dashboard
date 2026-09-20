import React, { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import {
  getScorecardHistoryApi,
  updateScorecardEntryApi,
  deleteScorecardEntryApi,
  createScorecardEntryApi,
  createWeekFromTemplateApi,
  getScorecardTemplatesAdminApi,
  createScorecardTemplateApi,
  updateScorecardTemplateApi,
  deleteScorecardTemplateApi,
  reorderScorecardTemplatesApi,
} from '../services/api'
import { TeamType } from '../types'
import { useAuthStore } from '../store/authStore'
import { TEAMS, teamLabel } from '../utils/teams'

// ── Local types ───────────────────────────────────────────────────────────────

interface WeekEntry {
  id: string
  actual: number | null
  is_on_track: boolean | null
  data_source: string
  notes: string | null
}

interface MetricHistory {
  metric_name: string
  team: string
  display_format: string
  goal: number | null
  goal_text: string | null
  lower_is_better: boolean
  sort_order: number
  data: Record<string, WeekEntry>
}

interface ScorecardHistory {
  weeks: string[]
  metrics: MetricHistory[]
}

interface MetricTemplate {
  id: string
  team: string
  metric_name: string
  goal: number | null
  goal_text: string | null
  display_format: string
  lower_is_better: boolean
  sort_order: number
  is_active: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const toISO = (d: Date) => d.toISOString().split('T')[0]

const getMondayOf = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

const fullDate = (iso: string) => {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatValue(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  if (isNaN(n)) return '—'
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', maximumFractionDigits: 0,
      }).format(n)
    case 'percent':
      return `${(n * 100).toFixed(1)}%`
    case 'number':
      return n % 1 === 0 ? n.toString() : n.toFixed(2)
    default:
      return n.toString()
  }
}

// Determine chart type: area for cumulative/percent/rate, bar for everything else
function getChartType(m: MetricHistory): 'bar' | 'area' {
  const n = m.metric_name.toLowerCase()
  if (m.display_format === 'percent') return 'area'
  if (n.includes('ytd') || n.includes('total') || n.includes('balance')) return 'area'
  return 'bar'
}

// ── Metric Detail Modal ────────────────────────────────────────────────────────

interface MetricDetailModalProps {
  metric: MetricHistory
  weeks: string[]
  currentWeek: string
  canEdit: boolean
  onClose: () => void
  onEntryUpdated: () => void
  onEntryDeleted: (id: string) => void
}

function MetricDetailModal({
  metric, weeks, currentWeek, canEdit,
  onClose, onEntryUpdated, onEntryDeleted,
}: MetricDetailModalProps) {
  const [editId, setEditId] = useState<string | null>(null)
  const [editWeek, setEditWeek] = useState<string | null>(null)
  const [editActual, setEditActual] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fmt = metric.display_format
  const isCreating = editId === '__new__'

  // Build chart data — null actuals show as gaps
  const chartData = weeks.map(w => {
    const e = metric.data[w]
    return {
      week: shortDate(w),
      actual: e?.actual ?? null,
      goal: metric.goal,
      on_track: e?.is_on_track ?? null,
      isCurrent: w === currentWeek,
    }
  })

  const chartType = getChartType(metric)
  const goalNum = metric.goal

  const cancelEdit = () => {
    setEditId(null)
    setEditWeek(null)
    setEditActual('')
    setEditNotes('')
  }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true)
    try {
      const parsed = editActual === '' ? null : parseFloat(editActual)
      const actualValue = isNaN(parsed as number) ? null : parsed
      if (isCreating && editWeek) {
        await createScorecardEntryApi({
          team: metric.team,
          week_of: editWeek,
          metric_name: metric.metric_name,
          goal: metric.goal,
          actual: actualValue,
          data_source: 'manual',
          notes: editNotes || null,
        })
      } else {
        await updateScorecardEntryApi(editId, {
          actual: actualValue,
          notes: editNotes || null,
        })
      }
      cancelEdit()
      onEntryUpdated()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const startEdit = (e: WeekEntry, w: string) => {
    setEditId(e.id)
    setEditWeek(w)
    setEditActual(e.actual !== null ? String(e.actual) : '')
    setEditNotes(e.notes || '')
  }

  const startCreate = (w: string) => {
    setEditId('__new__')
    setEditWeek(w)
    setEditActual('')
    setEditNotes('')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    try {
      await deleteScorecardEntryApi(id)
      onEntryDeleted(id)
    } catch { /* ignore */ }
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-slate-400 mb-1">{label}</p>
        {payload.map((p: any) => (
          p.dataKey === 'actual' && p.value !== null && (
            <p key={p.dataKey} className="font-semibold text-white">
              {formatValue(p.value, fmt)}
            </p>
          )
        ))}
        {goalNum !== null && (
          <p className="text-blue-400">Goal: {formatValue(goalNum, fmt)}</p>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-0 sm:px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{metric.metric_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Goal: {metric.goal_text || formatValue(metric.goal, fmt)} · 13-week trend
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* ── Chart ── */}
          <div className="bg-slate-900/60 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={220}>
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => formatValue(v, fmt)}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={60}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b' }} />
                  {goalNum !== null && (
                    <ReferenceLine y={goalNum} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} />
                  )}
                  <Bar dataKey="actual" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={
                          entry.actual === null ? '#1e293b'
                          : entry.on_track === null ? '#475569'
                          : entry.on_track ? '#22c55e'
                          : '#ef4444'
                        }
                        opacity={entry.isCurrent ? 1 : 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${metric.metric_name}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => formatValue(v, fmt)}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={60}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {goalNum !== null && (
                    <ReferenceLine y={goalNum} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} />
                  )}
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill={`url(#grad-${metric.metric_name})`}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props
                      if (payload.actual === null) return <g key={props.key} />
                      const color = payload.on_track === null ? '#64748b'
                        : payload.on_track ? '#22c55e' : '#ef4444'
                      return <circle key={props.key} cx={cx} cy={cy} r={4} fill={color} stroke="#0f172a" strokeWidth={1.5} />
                    }}
                    connectNulls={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* ── Week-by-week data with edit controls ── */}
          {canEdit && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Weekly Entries</h3>
              <div className="space-y-1.5">
                {[...weeks].reverse().map(w => {
                  const e = metric.data[w]
                  const isEditingThisRow = (e && editId === e.id) || (isCreating && editWeek === w)

                  if (isEditingThisRow) {
                    return (
                      <div key={w} className="bg-slate-700/50 rounded-lg px-3 py-3 space-y-2">
                        <p className="text-xs text-slate-400">{fullDate(w)}{isCreating ? ' · new entry' : ''}</p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            pattern="-?[0-9.]*"
                            autoFocus
                            value={editActual}
                            onChange={e => setEditActual(e.target.value)}
                            placeholder="Actual"
                            className="bg-slate-700 border border-blue-500 text-white text-base rounded px-3 py-2 min-h-[40px] w-full sm:w-36 focus:outline-none"
                          />
                          <input
                            value={editNotes}
                            onChange={e => setEditNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            className="bg-slate-700 border border-slate-600 text-white text-base sm:text-sm rounded px-3 py-2 min-h-[40px] w-full sm:flex-1 focus:outline-none focus:border-blue-500"
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={saveEdit} disabled={saving}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] rounded transition-colors disabled:opacity-60">
                              {saving ? '…' : 'Save'}
                            </button>
                            <button onClick={cancelEdit}
                              className="text-slate-400 hover:text-white transition-colors text-sm px-3 py-2 min-h-[40px]">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (!e) {
                    return (
                      <div key={w}
                        onClick={() => startCreate(w)}
                        className="flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-slate-700/30 active:bg-slate-700/40 transition-colors cursor-pointer">
                        <span className="text-xs text-slate-500">{fullDate(w)}</span>
                        <span className="text-xs font-medium text-blue-400">+ Add value</span>
                      </div>
                    )
                  }

                  const dotColor = e.is_on_track === null ? 'bg-slate-500'
                    : e.is_on_track ? 'bg-green-400' : 'bg-red-400'
                  return (
                    <div key={w}
                      onClick={() => startEdit(e, w)}
                      className="flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-slate-700/30 active:bg-slate-700/40 transition-colors group cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                        <span className="text-xs text-slate-400">{fullDate(w)}</span>
                        {e.notes && <span className="text-xs text-slate-500 italic truncate max-w-[120px]">{e.notes}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white">{formatValue(e.actual, fmt)}</span>
                        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={(ev) => { ev.stopPropagation(); startEdit(e, w) }}
                            className="text-slate-500 hover:text-blue-400 transition-colors p-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id) }}
                            className="text-slate-500 hover:text-red-400 transition-colors p-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── New Week Modal ─────────────────────────────────────────────────────────────

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
    setLoading(true); setError(null)
    try {
      await createWeekFromTemplateApi(selectedTeam, selectedWeek)
      onCreated(); onClose()
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
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-red-400 text-sm mb-4">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Team</label>
            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
              {TEAMS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Week of (Monday)</label>
            <input type="date" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
            {loading ? 'Creating…' : 'Create Week'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Entry Modal ────────────────────────────────────────────────────────────

interface AddEntryModalProps {
  defaultTeam: string
  onClose: () => void
  onCreated: () => void
  userId: string | undefined
}

function AddEntryModal({ defaultTeam, onClose, onCreated, userId }: AddEntryModalProps) {
  const currentMonday = toISO(getMondayOf(new Date()))
  const [form, setForm] = useState({
    team: defaultTeam === 'all' ? 'leadership' : defaultTeam,
    week_of: currentMonday,
    metric_name: '',
    goal: '',
    actual: '',
    data_source: 'manual',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputCls = 'bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-blue-500'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await createScorecardEntryApi({
        team: form.team, week_of: form.week_of, metric_name: form.metric_name,
        goal: form.goal ? parseFloat(form.goal) : null,
        actual: form.actual ? parseFloat(form.actual) : null,
        data_source: form.data_source || 'manual',
        notes: form.notes || null,
      })
      onCreated(); onClose()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6 w-full max-w-lg">
        <h2 className="text-white font-semibold text-base mb-4">Add Scorecard Entry</h2>
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-red-400 text-sm mb-4">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Team</label>
              <select value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} className={inputCls}>
                {TEAMS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Week of (Monday)</label>
              <input type="date" value={form.week_of} onChange={e => setForm({ ...form, week_of: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Metric Name *</label>
            <input required value={form.metric_name} onChange={e => setForm({ ...form, metric_name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Goal</label>
              <input type="text" inputMode="decimal" pattern="-?[0-9.]*" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Actual</label>
              <input type="text" inputMode="decimal" pattern="-?[0-9.]*" value={form.actual} onChange={e => setForm({ ...form, actual: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── Metrics Admin Modal ────────────────────────────────────────────────────────
// Leadership/admin edit which metrics a team's scorecard carries. Changes here
// affect future weeks: recorded weekly values are keyed by metric name and are
// never deleted by removing a template row.

interface MetricsAdminModalProps {
  defaultTeam: string
  onClose: () => void
  onChanged: () => void
}

const EMPTY_DRAFT = {
  metric_name: '',
  goal: '',
  goal_text: '',
  display_format: 'number',
  lower_is_better: false,
}

function MetricsAdminModal({ defaultTeam, onClose, onChanged }: MetricsAdminModalProps) {
  const [team, setTeam] = useState<string>(defaultTeam === 'all' ? 'leadership' : defaultTeam)
  const [rows, setRows] = useState<MetricTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)
  const [touched, setTouched] = useState(false)

  const inputCls = 'bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 w-full min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500'

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await getScorecardTemplatesAdminApi(team)
      setRows(res.data)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Could not load metrics')
    } finally {
      setLoading(false)
    }
  }, [team])

  useEffect(() => { load() }, [load])

  // Everything the parent needs to know is "did anything change" — it reloads
  // the scorecard on close rather than on every keystroke.
  const finish = () => { if (touched) onChanged(); onClose() }

  const startEdit = (row: MetricTemplate) => {
    setEditingId(row.id)
    setAdding(false)
    setDraft({
      metric_name: row.metric_name,
      goal: row.goal === null ? '' : String(row.goal),
      goal_text: row.goal_text || '',
      display_format: row.display_format,
      lower_is_better: row.lower_is_better,
    })
  }

  const draftPayload = () => ({
    metric_name: draft.metric_name.trim(),
    goal: draft.goal.trim() === '' ? null : parseFloat(draft.goal),
    goal_text: draft.goal_text.trim() || null,
    display_format: draft.display_format,
    lower_is_better: draft.lower_is_better,
  })

  const saveEdit = async (id: string) => {
    if (!draft.metric_name.trim()) { setError('Metric name is required'); return }
    setBusyId(id); setError(null)
    try {
      await updateScorecardTemplateApi(id, draftPayload())
      setEditingId(null); setTouched(true)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Could not save this metric — nothing was changed')
    } finally {
      setBusyId(null)
    }
  }

  const addMetric = async () => {
    if (!draft.metric_name.trim()) { setError('Metric name is required'); return }
    setBusyId('new'); setError(null)
    try {
      await createScorecardTemplateApi({ team, ...draftPayload() })
      setAdding(false); setDraft(EMPTY_DRAFT); setTouched(true)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Could not add this metric — nothing was saved')
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = async (row: MetricTemplate) => {
    setBusyId(row.id); setError(null)
    try {
      await updateScorecardTemplateApi(row.id, { is_active: !row.is_active })
      setTouched(true)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || `Could not ${row.is_active ? 'pause' : 'resume'} this metric`)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (row: MetricTemplate) => {
    if (!confirm(
      `Remove "${row.metric_name}" from the ${teamLabel(team)} scorecard template?\n\n` +
      'Weekly values already recorded for this metric are kept — it just stops appearing in new weeks.'
    )) return
    setBusyId(row.id); setError(null)
    try {
      await deleteScorecardTemplateApi(row.id)
      setTouched(true)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Could not remove this metric')
    } finally {
      setBusyId(null)
    }
  }

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const reordered = [...rows]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const previous = rows
    setRows(reordered) // optimistic: the list reorders under the cursor
    setBusyId(moved.id); setError(null)
    try {
      await reorderScorecardTemplatesApi(team, reordered.map((r) => r.id))
      setTouched(true)
    } catch (e: any) {
      setRows(previous)
      setError(e.response?.data?.error || e.message || 'Could not reorder — the list is unchanged')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-white font-semibold text-base">Scorecard Metrics</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Defines the rows each new week starts with. Recorded weeks are never changed here.
            </p>
          </div>
          <button onClick={finish} aria-label="Close metrics editor"
            className="text-slate-400 hover:text-white transition-colors p-2 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-red-400 text-sm" role="alert">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="metrics-team" className="text-sm text-slate-400">Team:</label>
              <select id="metrics-team" value={team}
                onChange={(e) => { setTeam(e.target.value); setEditingId(null); setAdding(false) }}
                className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TEAMS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => { setAdding(true); setEditingId(null); setDraft(EMPTY_DRAFT) }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] rounded-lg transition-colors">
              Add metric
            </button>
          </div>

          {adding && (
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-white">New {teamLabel(team)} metric</h3>
              <MetricFields draft={draft} setDraft={setDraft} inputCls={inputCls} />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT) }}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 min-h-[40px] rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={addMetric} disabled={busyId === 'new'}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] rounded-lg transition-colors disabled:opacity-60">
                  {busyId === 'new' ? 'Adding…' : 'Add metric'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {teamLabel(team)} has no metrics yet. Add the first one above.
            </div>
          ) : (
            <ul className="divide-y divide-slate-700/60 border border-slate-700 rounded-lg overflow-hidden">
              {rows.map((row, index) => (
                <li key={row.id} className={`p-4 ${row.is_active ? '' : 'bg-slate-900/40'}`}>
                  {editingId === row.id ? (
                    <div className="space-y-3">
                      <MetricFields draft={draft} setDraft={setDraft} inputCls={inputCls} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)}
                          className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 min-h-[40px] rounded-lg transition-colors">
                          Cancel
                        </button>
                        <button onClick={() => saveEdit(row.id)} disabled={busyId === row.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] rounded-lg transition-colors disabled:opacity-60">
                          {busyId === row.id ? 'Saving…' : 'Save metric'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${row.is_active ? 'text-white' : 'text-slate-500'}`}>
                            {row.metric_name}
                          </span>
                          {!row.is_active && (
                            <span className="text-[11px] uppercase tracking-wide text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">
                              Paused
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {row.goal_text || (row.goal !== null ? formatValue(row.goal, row.display_format) : 'No goal set')}
                          {' · '}{row.display_format}
                          {row.lower_is_better ? ' · lower is better' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => move(index, -1)} disabled={index === 0 || busyId === row.id}
                          aria-label={`Move ${row.metric_name} up`} title="Move up"
                          className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors p-2 rounded min-h-[40px] min-w-[40px] flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button onClick={() => move(index, 1)} disabled={index === rows.length - 1 || busyId === row.id}
                          aria-label={`Move ${row.metric_name} down`} title="Move down"
                          className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors p-2 rounded min-h-[40px] min-w-[40px] flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button onClick={() => startEdit(row)}
                          className="text-slate-400 hover:text-blue-400 transition-colors text-sm px-3 py-2 min-h-[40px] rounded">
                          Edit
                        </button>
                        <button onClick={() => toggleActive(row)} disabled={busyId === row.id}
                          className="text-slate-400 hover:text-amber-400 transition-colors text-sm px-3 py-2 min-h-[40px] rounded disabled:opacity-60">
                          {row.is_active ? 'Pause' : 'Resume'}
                        </button>
                        <button onClick={() => remove(row)} disabled={busyId === row.id}
                          className="text-slate-400 hover:text-red-400 transition-colors text-sm px-3 py-2 min-h-[40px] rounded disabled:opacity-60">
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-500">
            Paused metrics stay out of new weeks but keep their history. Use <span className="text-slate-400">New Week</span> to
            apply the current template to a week.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-700 flex justify-end">
          <button onClick={finish}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 min-h-[40px] rounded-lg transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// Shared field set for the add and edit forms.
function MetricFields({ draft, setDraft, inputCls }: {
  draft: typeof EMPTY_DRAFT
  setDraft: (d: typeof EMPTY_DRAFT) => void
  inputCls: string
}) {
  return (
    <>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Metric name *</label>
        <input value={draft.metric_name} onChange={(e) => setDraft({ ...draft, metric_name: e.target.value })}
          className={inputCls} placeholder="e.g. Bid Hit Rate" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Goal</label>
          <input type="text" inputMode="decimal" value={draft.goal}
            onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
            className={inputCls} placeholder="0.4 for 40%" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Goal label</label>
          <input value={draft.goal_text} onChange={(e) => setDraft({ ...draft, goal_text: e.target.value })}
            className={inputCls} placeholder="40%" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Format</label>
          <select value={draft.display_format} onChange={(e) => setDraft({ ...draft, display_format: e.target.value })}
            className={inputCls}>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={draft.lower_is_better}
          onChange={(e) => setDraft({ ...draft, lower_is_better: e.target.checked })}
          className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" />
        Lower is better (e.g. turnaround days, callbacks)
      </label>
    </>
  )
}

// ── Main Scorecard Component ───────────────────────────────────────────────────

const Scorecard: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? (user.team as TeamType) : 'all'
  )
  const [history, setHistory] = useState<ScorecardHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<MetricHistory | null>(null)
  const [showNewWeekModal, setShowNewWeekModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showMetricsModal, setShowMetricsModal] = useState(false)
  const [aggregateMode, setAggregateMode] = useState<'total' | 'average'>('total')

  const isLeadershipOrAdmin = user?.role === 'admin' || user?.role === 'leadership'
  const canEdit = user?.role === 'admin' || user?.role === 'leadership' || user?.role === 'manager'

  const currentWeek = toISO(getMondayOf(new Date()))

  const loadHistory = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await getScorecardHistoryApi(team === 'all' ? undefined : team, 13)
      setHistory(res.data)
    } catch (e: any) {
      setError(e.message || 'Failed to load scorecard data')
    } finally {
      setLoading(false)
    }
  }, [team])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Keep the open modal's metric in sync after refresh
  useEffect(() => {
    if (selectedMetric && history) {
      const refreshed = history.metrics.find(m => m.metric_name === selectedMetric.metric_name && m.team === selectedMetric.team)
      if (refreshed) setSelectedMetric(refreshed)
    }
  }, [history])

  const computeAggregate = (metric: MetricHistory): number | null => {
    if (!history) return null
    const actuals = history.weeks
      .map(w => metric.data[w]?.actual)
      .filter((v): v is number => v !== null && v !== undefined)
    if (actuals.length === 0) return null
    const sum = actuals.reduce((a, b) => a + b, 0)
    return aggregateMode === 'total' ? sum : sum / actuals.length
  }

  // Cell color classes
  const cellColor = (entry: WeekEntry | undefined, isCurrent: boolean) => {
    if (!entry || entry.actual === null) return `text-slate-600 ${isCurrent ? 'bg-slate-700/30' : ''}`
    if (entry.is_on_track === null) return `text-slate-400 ${isCurrent ? 'bg-slate-700/40 font-medium' : ''}`
    if (entry.is_on_track) return `text-green-400 font-medium ${isCurrent ? 'bg-green-500/10' : ''}`
    return `text-red-400 font-medium ${isCurrent ? 'bg-red-500/10' : ''}`
  }

  return (
    <>
      <Header
        title="Scorecard"
        actions={
          <div className="flex items-center gap-2 w-full md:w-auto">
            {isLeadershipOrAdmin && (
              <button onClick={() => setShowNewWeekModal(true)}
                className="flex-1 md:flex-none bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2 min-h-[40px] rounded-lg transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                New Week
              </button>
            )}
            {isLeadershipOrAdmin && (
              <button onClick={() => setShowMetricsModal(true)}
                className="flex-1 md:flex-none bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2 min-h-[40px] rounded-lg transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Metrics
              </button>
            )}
            {canEdit && (
              <button onClick={() => setShowAddModal(true)}
                className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] rounded-lg transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Entry
              </button>
            )}
          </div>
        }
      />

      {showNewWeekModal && (
        <NewWeekModal defaultTeam={team} onClose={() => setShowNewWeekModal(false)} onCreated={loadHistory} />
      )}
      {showMetricsModal && (
        <MetricsAdminModal
          defaultTeam={team}
          onClose={() => setShowMetricsModal(false)}
          onChanged={loadHistory}
        />
      )}
      {showAddModal && (
        <AddEntryModal
          defaultTeam={team} userId={user?.id}
          onClose={() => setShowAddModal(false)} onCreated={loadHistory}
        />
      )}
      {selectedMetric && history && (
        <MetricDetailModal
          metric={selectedMetric}
          weeks={history.weeks}
          currentWeek={currentWeek}
          canEdit={canEdit}
          onClose={() => setSelectedMetric(null)}
          onEntryUpdated={loadHistory}
          onEntryDeleted={() => { loadHistory(); setSelectedMetric(null) }}
        />
      )}

      <div className="p-4 md:p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
        )}

        {/* Team filter + legend */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TeamFilter value={team} onChange={t => setTeam(t)} />
          <div className="flex items-center gap-3 sm:gap-4 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" />On Track</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Off Track</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-600" />No Data</span>
            <span className="text-slate-600 hidden sm:inline">Tap any row for trend & details</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Former JobNimbus rows are now manually maintained. Select a metric row to add or edit a weekly value.
        </p>
        <p className="md:hidden text-[11px] text-slate-500 -mt-2">Swipe table horizontally · tap any row for details</p>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : !history || history.metrics.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm bg-slate-800 rounded-xl border border-slate-700">
            No scorecard data for this period.
            {isLeadershipOrAdmin && (
              <span> <button onClick={() => setShowNewWeekModal(true)} className="text-blue-400 hover:text-blue-300 underline">Create from template</button></span>
            )}
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  {/* Sticky metric name column */}
                  <th className="sticky left-0 z-10 bg-slate-800 text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                    Metric
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap min-w-[80px]">
                    Goal
                  </th>
                  <th className="text-center px-2 py-3 text-xs font-medium uppercase tracking-wide whitespace-nowrap min-w-[70px] border-l border-slate-700/50">
                    <button
                      onClick={(e) => { e.stopPropagation(); setAggregateMode(prev => prev === 'total' ? 'average' : 'total') }}
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                      title={`Click to switch to ${aggregateMode === 'total' ? 'Average' : 'Total'}`}
                    >
                      {aggregateMode === 'total' ? 'Total' : 'Avg'}
                      <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>
                  </th>
                  {/* Week columns */}
                  {history.weeks.map((w, i) => {
                    const isCurrent = w === currentWeek
                    return (
                      <th key={w}
                        className={`text-center px-2 py-3 text-xs font-medium uppercase tracking-wide whitespace-nowrap min-w-[60px]
                          ${isCurrent ? 'text-blue-400 border-l border-r border-blue-500/30 bg-blue-500/5' : 'text-slate-500'}
                          ${i === history.weeks.length - 2 ? 'border-l border-slate-700/50' : ''}`}>
                        {isCurrent ? (
                          <span className="flex flex-col items-center gap-0.5">
                            <span className="text-blue-400">{shortDate(w)}</span>
                            <span className="text-[9px] text-blue-500/70 normal-case font-normal">this wk</span>
                          </span>
                        ) : shortDate(w)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {history.metrics.map(metric => (
                  <tr key={`${metric.team}||${metric.metric_name}`}
                    onClick={() => setSelectedMetric(metric)}
                    className="hover:bg-slate-700/25 transition-colors cursor-pointer group">
                    {/* Metric name — sticky */}
                    <td className="sticky left-0 z-10 bg-slate-800 group-hover:bg-slate-700/25 px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-white font-medium text-xs">{metric.metric_name}</span>
                        {(team === 'all' || team === undefined) && user?.role !== 'manager' && (
                          <span className="text-slate-600 text-[10px] capitalize">{metric.team}</span>
                        )}
                      </div>
                    </td>
                    {/* Goal */}
                    <td className="text-right px-3 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {metric.goal_text || formatValue(metric.goal, metric.display_format)}
                    </td>
                    {/* Aggregate (Total / Avg) */}
                    <td className="text-center px-2 py-3 text-xs whitespace-nowrap font-semibold text-blue-300 border-l border-slate-700/50">
                      {formatValue(computeAggregate(metric), metric.display_format)}
                    </td>
                    {/* Data cells */}
                    {history.weeks.map(w => {
                      const entry = metric.data[w]
                      const isCurrent = w === currentWeek
                      return (
                        <td key={w}
                          className={`text-center px-2 py-3 text-xs whitespace-nowrap
                            ${isCurrent ? 'border-l border-r border-blue-500/20 bg-blue-500/5' : ''}
                            ${cellColor(entry, isCurrent)}`}>
                          {entry?.actual !== null && entry?.actual !== undefined
                            ? formatValue(entry.actual, metric.display_format)
                            : <span className="text-slate-700">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default Scorecard

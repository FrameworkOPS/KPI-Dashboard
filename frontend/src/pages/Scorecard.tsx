import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import {
  getScorecardApi,
  createScorecardEntryApi,
  updateScorecardEntryApi,
  deleteScorecardEntryApi,
} from '../services/api'
import { ScorecardEntry, TeamType } from '../types'
import { useAuthStore } from '../store/authStore'

// Get Monday of the week for a given date
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

const emptyForm = (): Partial<ScorecardEntry> => ({
  metric_name: '',
  goal: null,
  actual: null,
  data_source: '',
  notes: '',
})

const Scorecard: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? user.team as TeamType : 'all'
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

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getScorecardApi(
        team === 'all' ? undefined : team,
        toISO(weekDate)
      )
      setEntries(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [team, weekDate])

  useEffect(() => { loadEntries() }, [loadEntries])

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

  const canEdit = user?.role === 'admin' || user?.role === 'leadership' ||
    (user?.role === 'manager')

  const inputCls = 'bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <>
      <Header
        title="Scorecard"
        actions={
          canEdit && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Entry
            </button>
          )
        }
      />

      <div className="p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
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
          <form onSubmit={submitAdd} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">New Scorecard Entry</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Metric Name *</label>
                <input required className={inputCls} value={addForm.metric_name || ''} onChange={(e) => setAddForm({ ...addForm, metric_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Goal</label>
                <input type="number" className={inputCls} value={addForm.goal ?? ''} onChange={(e) => setAddForm({ ...addForm, goal: e.target.value ? +e.target.value : null })} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Actual</label>
                <input type="number" className={inputCls} value={addForm.actual ?? ''} onChange={(e) => setAddForm({ ...addForm, actual: e.target.value ? +e.target.value : null })} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Source</label>
                <input className={inputCls} value={addForm.data_source || ''} onChange={(e) => setAddForm({ ...addForm, data_source: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <input className={inputCls} value={addForm.notes || ''} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowAddForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
              <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
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
            <div className="text-center py-12 text-slate-500 text-sm">No entries for this week.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Metric</th>
                  {(user?.role !== 'manager') && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Team</th>
                  )}
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Goal</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Actual</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">On Track</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Notes</th>
                  {canEdit && <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {entries.map((entry) =>
                  editingId === entry.id ? (
                    <tr key={entry.id} className="bg-slate-700/20">
                      <td className="px-4 py-2">
                        <input className={inputCls} value={editForm.metric_name || ''} onChange={(e) => setEditForm({ ...editForm, metric_name: e.target.value })} />
                      </td>
                      {user?.role !== 'manager' && <td className="px-4 py-2 text-slate-400 capitalize">{entry.team}</td>}
                      <td className="px-4 py-2">
                        <input type="number" className={inputCls + ' text-right'} value={editForm.goal ?? ''} onChange={(e) => setEditForm({ ...editForm, goal: e.target.value ? +e.target.value : null })} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" className={inputCls + ' text-right'} value={editForm.actual ?? ''} onChange={(e) => setEditForm({ ...editForm, actual: e.target.value ? +e.target.value : null })} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <select className={inputCls} value={String(editForm.is_on_track)} onChange={(e) => setEditForm({ ...editForm, is_on_track: e.target.value === 'true' ? true : e.target.value === 'false' ? false : null })}>
                          <option value="null">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input className={inputCls} value={editForm.data_source || ''} onChange={(e) => setEditForm({ ...editForm, data_source: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <input className={inputCls} value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={saveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded transition-colors">Save</button>
                          <button onClick={cancelEdit} className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded transition-colors">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{entry.metric_name}</td>
                      {user?.role !== 'manager' && <td className="px-4 py-3 text-slate-400 capitalize">{entry.team}</td>}
                      <td className="px-4 py-3 text-right text-slate-300">{entry.goal ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">{entry.actual ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {entry.is_on_track === null ? (
                          <span className="text-slate-500">—</span>
                        ) : entry.is_on_track ? (
                          <svg className="w-5 h-5 text-green-400 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-red-400 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{entry.data_source || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{entry.notes || '—'}</td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(entry)} className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => deleteEntry(entry.id)} className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import {
  getCustomProjectsApi, createCustomProjectApi, updateCustomProjectApi, deleteCustomProjectApi, getCrewsApi,
} from '../services/api'
import { formatDate, todayISO } from '../utils/dates'

interface Crew {
  id: string
  crew_name: string
  crew_type: 'shingle' | 'metal'
}

interface CustomProject {
  id: string
  crew_id: string
  crew_name: string
  crew_type: string
  project_name: string
  start_date: string
  end_date: string
  notes?: string
}

const emptyForm = { crew_id: '', project_name: '', start_date: '', end_date: '', notes: '' }

const inputCls = 'w-full px-3 py-2 min-h-[44px] bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
const btn = 'px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

type BlockState = 'active' | 'upcoming' | 'past'
function blockState(p: CustomProject, today: string): BlockState {
  const start = String(p.start_date).slice(0, 10)
  const end = String(p.end_date).slice(0, 10)
  if (end < today) return 'past'
  if (start > today) return 'upcoming'
  return 'active'
}

export default function CustomProjects() {
  const [projects, setProjects] = useState<CustomProject[]>([])
  const [crews, setCrews] = useState<Crew[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [projectsRes, crewsRes] = await Promise.all([getCustomProjectsApi(), getCrewsApi(true)])
      setProjects(projectsRes.data?.data || [])
      setCrews(crewsRes.data?.data || [])
    } catch (e: any) {
      setLoadError(e.message || 'Could not load capacity blocks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm }); setError(null); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingId(null); setError(null) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!editingId && !form.crew_id) { setError('Pick the crew this block applies to.'); return }
    if (!form.project_name.trim()) { setError('Give the block a name.'); return }
    if (!form.start_date || !form.end_date) { setError('Both start and end dates are required.'); return }
    if (form.end_date < form.start_date) { setError('The end date must be on or after the start date.'); return }
    setSaving(true)
    try {
      const base = { project_name: form.project_name.trim(), start_date: form.start_date, end_date: form.end_date, notes: form.notes.trim() || null }
      if (editingId) await updateCustomProjectApi(editingId, base)
      else await createCustomProjectApi({ crew_id: form.crew_id, ...base })
      closeForm()
      setForm({ ...emptyForm })
      await loadAll()
    } catch (e: any) {
      setError(e.message || 'Could not save the block')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: CustomProject) => {
    if (!confirm(`Remove the "${p.project_name}" block for ${p.crew_name}? The crew returns to the forecast for those dates.`)) return
    setError(null)
    try {
      await deleteCustomProjectApi(p.id)
      await loadAll()
    } catch (e: any) {
      setError(e.message || 'Could not remove the block')
    }
  }

  const handleEdit = (p: CustomProject) => {
    setForm({
      crew_id: p.crew_id,
      project_name: p.project_name,
      start_date: String(p.start_date).slice(0, 10),
      end_date: String(p.end_date).slice(0, 10),
      notes: p.notes || '',
    })
    setError(null)
    setEditingId(p.id); setShowForm(true)
  }

  const today = todayISO()
  const editingProject = editingId ? projects.find((p) => p.id === editingId) : null

  return (
    <>
      <Header
        title="Capacity Blocks"
        actions={
          <button type="button" onClick={showForm ? closeForm : openNew} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            {showForm ? 'Cancel' : '+ Add Block'}
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-5">
        <p className="text-sm text-slate-400">
          Capacity blocks take a crew out of production for a date range. Use them for custom projects, vacations, or anything else that takes a crew offline.
        </p>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 underline min-h-[44px] px-2">Dismiss</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSave} aria-labelledby="block-form-title" className="bg-slate-800 rounded-xl p-5 md:p-6 border border-slate-700">
            <h2 id="block-form-title" className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Block' : 'New Capacity Block'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {editingId ? (
                <div>
                  <p className="block text-sm font-medium text-slate-300 mb-1">Crew</p>
                  <p className="text-white min-h-[44px] flex items-center">{editingProject?.crew_name ?? '—'}</p>
                </div>
              ) : (
                <div>
                  <label htmlFor="block-crew" className="block text-sm font-medium text-slate-300 mb-1">Crew *</label>
                  <select id="block-crew" required value={form.crew_id} onChange={(e) => setForm({ ...form, crew_id: e.target.value })} className={inputCls}>
                    <option value="">Select a crew…</option>
                    {crews.map((c) => (
                      <option key={c.id} value={c.id}>{c.crew_name} ({c.crew_type})</option>
                    ))}
                  </select>
                  {crews.length === 0 && <p className="text-xs text-slate-400 mt-1">No active crews. Add a crew first.</p>}
                </div>
              )}
              <div>
                <label htmlFor="block-name" className="block text-sm font-medium text-slate-300 mb-1">Project / Event Name *</label>
                <input id="block-name" type="text" required value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                  placeholder="e.g. Commercial project, Vacation" className={inputCls} autoFocus={!!editingId} />
              </div>
              <div>
                <label htmlFor="block-start" className="block text-sm font-medium text-slate-300 mb-1">Start Date *</label>
                <input id="block-start" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="block-end" className="block text-sm font-medium text-slate-300 mb-1">End Date *</label>
                <input id="block-end" type="date" required value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="block-notes" className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                <input id="block-notes" type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 mt-4 flex-wrap">
              <button type="submit" disabled={saving} className={`${btn} bg-green-700 text-white hover:bg-green-600`}>
                {saving ? 'Saving…' : editingId ? 'Update Block' : 'Create Block'}
              </button>
              <button type="button" onClick={closeForm} className={`${btn} bg-slate-600 text-white hover:bg-slate-500`}>Cancel</button>
            </div>
          </form>
        )}

        {loadError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{loadError}</span>
            <button type="button" onClick={loadAll} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-slate-400" role="status" aria-live="polite">Loading capacity blocks…</div>
        ) : !loadError && projects.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-400">
            No capacity blocks. Add one to take a crew out of the forecast for a period.
          </div>
        ) : projects.length > 0 ? (
          <div className="relative bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto" tabIndex={0} aria-label="Capacity blocks table, scrolls horizontally">
            <table className="w-full text-sm">
              <caption className="sr-only">Capacity blocks by crew with dates and status.</caption>
              <thead className="bg-slate-700 border-b border-slate-600">
                <tr>
                  {['Crew', 'Type', 'Project / Event', 'Start', 'End', 'Status', 'Notes', 'Actions'].map((h) => (
                    <th scope="col" key={h} className="px-4 py-3 text-left font-medium text-slate-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {projects.map((p) => {
                  const state = blockState(p, today)
                  return (
                    <tr key={p.id} className="hover:bg-slate-700/40">
                      <th scope="row" className="px-4 py-3 font-medium text-white text-left">{p.crew_name}</th>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${p.crew_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                          {p.crew_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{p.project_name}</td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(p.start_date)}</td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(p.end_date)}</td>
                      <td className="px-4 py-3">
                        {state === 'active'
                          ? <span className="px-2 py-0.5 rounded text-xs bg-orange-900/40 text-orange-300">Active block</span>
                          : state === 'upcoming'
                          ? <span className="px-2 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300">Upcoming</span>
                          : <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300">Past</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-48 truncate" title={p.notes || undefined}>{p.notes || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button type="button" onClick={() => handleEdit(p)} aria-label={`Edit ${p.project_name}`} className="text-blue-400 hover:text-blue-300 text-sm min-h-[44px] px-2 rounded-lg">Edit</button>
                        <button type="button" onClick={() => handleDelete(p)} aria-label={`Remove ${p.project_name}`} className="text-red-400 hover:text-red-300 text-sm min-h-[44px] px-2 rounded-lg">Remove</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  )
}

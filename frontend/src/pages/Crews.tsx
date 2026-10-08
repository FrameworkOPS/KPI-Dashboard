import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import {
  getCrewsApi, createCrewApi, updateCrewApi, deleteCrewApi, getCrewStaffApi, setCrewStaffApi,
} from '../services/api'
import { formatDate, todayISO } from '../utils/dates'

interface Crew {
  id: string
  crew_name: string
  crew_type: 'shingle' | 'metal'
  team_members: number
  training_period_days: number
  start_date: string
  terminate_date?: string
  revenue_per_sq: number
  weekly_sq_capacity: number | null
  is_active: boolean
}

type StaffCounts = { lead_count: number; super_count: number }

const DEFAULTS = {
  shingle: { revenue_per_sq: 600, weekly_sq_capacity: 200 },
  metal: { revenue_per_sq: 1000, weekly_sq_capacity: 100 },
}

const emptyForm = () => ({
  crew_name: '', crew_type: 'shingle' as 'shingle' | 'metal',
  start_date: todayISO(),
  terminate_date: '', revenue_per_sq: 600, weekly_sq_capacity: 200,
})

const inputCls = 'w-full px-3 py-2 min-h-[44px] bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
const btn = 'px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export default function Crews() {
  const [crews, setCrews] = useState<Crew[]>([])
  const [staffData, setStaffData] = useState<Record<string, StaffCounts>>({})
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffForm, setStaffForm] = useState({ leadCount: 0, superCount: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingStaff, setSavingStaff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const loadCrews = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await getCrewsApi(true)
      const crewList: Crew[] = res.data?.data || []
      setCrews(crewList)
      // Staff counts per crew; one failing crew shouldn't blank the table.
      const entries = await Promise.all(crewList.map(async (c): Promise<[string, StaffCounts]> => {
        try {
          const r = await getCrewStaffApi(c.id)
          return [c.id, r.data?.data || { lead_count: 0, super_count: 0 }]
        } catch {
          return [c.id, { lead_count: 0, super_count: 0 }]
        }
      }))
      setStaffData(Object.fromEntries(entries))
    } catch (e: any) {
      setLoadError(e.message || 'Could not load crews')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCrews() }, [loadCrews])

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setError(null); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingId(null); setError(null) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.crew_name.trim()) { setError('Give the crew a name.'); return }
    if (form.terminate_date && form.terminate_date < form.start_date) { setError('The terminate date must be on or after the start date.'); return }
    setSaving(true)
    try {
      const payload = { ...form, crew_name: form.crew_name.trim(), terminate_date: form.terminate_date || null }
      if (editingId) await updateCrewApi(editingId, payload)
      else await createCrewApi(payload)
      closeForm()
      setForm(emptyForm())
      await loadCrews()
    } catch (e: any) {
      setError(e.message || 'Could not save the crew')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (crew: Crew) => {
    if (!confirm(`Deactivate ${crew.crew_name}? It will drop out of the forecast and this list. Its history is kept.`)) return
    setError(null)
    try {
      await deleteCrewApi(crew.id)
      await loadCrews()
    } catch (e: any) {
      setError(e.message || 'Could not deactivate the crew')
    }
  }

  const handleEdit = (crew: Crew) => {
    setForm({
      crew_name: crew.crew_name, crew_type: crew.crew_type,
      start_date: String(crew.start_date).slice(0, 10),
      terminate_date: crew.terminate_date ? String(crew.terminate_date).slice(0, 10) : '',
      revenue_per_sq: Number(crew.revenue_per_sq),
      weekly_sq_capacity: crew.weekly_sq_capacity != null ? Number(crew.weekly_sq_capacity) : DEFAULTS[crew.crew_type].weekly_sq_capacity,
    })
    setError(null)
    setEditingId(crew.id); setShowForm(true)
  }

  const handleSaveStaff = async (crewId: string) => {
    setSavingStaff(true)
    setError(null)
    try {
      await setCrewStaffApi({ crewId, leadCount: staffForm.leadCount, superCount: staffForm.superCount, addedDate: todayISO() })
      setStaffData((prev) => ({ ...prev, [crewId]: { lead_count: staffForm.leadCount, super_count: staffForm.superCount } }))
      setEditingStaffId(null)
    } catch (e: any) {
      setError(e.message || 'Could not save staffing')
    } finally {
      setSavingStaff(false)
    }
  }

  const handleTypeChange = (type: 'shingle' | 'metal') => {
    setForm({ ...form, crew_type: type, ...DEFAULTS[type] })
  }

  const numField = (key: 'revenue_per_sq' | 'weekly_sq_capacity') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0) })

  return (
    <>
      <Header
        title="Crews"
        actions={
          <button type="button" onClick={showForm ? closeForm : openNew} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            {showForm ? 'Cancel' : '+ Add Crew'}
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 underline min-h-[44px] px-2">Dismiss</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSave} aria-labelledby="crew-form-title" className="bg-slate-800 rounded-xl p-5 md:p-6 border border-slate-700">
            <h2 id="crew-form-title" className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Crew' : 'New Crew'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="crew-name" className="block text-sm font-medium text-slate-300 mb-1">Crew Name *</label>
                <input id="crew-name" type="text" required value={form.crew_name} onChange={(e) => setForm({ ...form, crew_name: e.target.value })}
                  placeholder="e.g. Shingle Team A" className={inputCls} autoFocus />
              </div>
              <div>
                <label htmlFor="crew-type" className="block text-sm font-medium text-slate-300 mb-1">Crew Type *</label>
                <select id="crew-type" value={form.crew_type} onChange={(e) => handleTypeChange(e.target.value as 'shingle' | 'metal')} className={inputCls}>
                  <option value="shingle">Shingle</option>
                  <option value="metal">Metal</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Changing the type resets revenue and capacity to that type's defaults.</p>
              </div>
              <div>
                <label htmlFor="crew-start" className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                <input id="crew-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="crew-end" className="block text-sm font-medium text-slate-300 mb-1">Terminate Date</label>
                <input id="crew-end" type="date" value={form.terminate_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, terminate_date: e.target.value })} className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">Leave blank for an ongoing crew.</p>
              </div>
              <div>
                <label htmlFor="crew-rev" className="block text-sm font-medium text-slate-300 mb-1">Revenue per square ($) *</label>
                <input id="crew-rev" type="number" min={0} step="1" required value={form.revenue_per_sq} onChange={numField('revenue_per_sq')} className={inputCls} />
              </div>
              <div>
                <label htmlFor="crew-cap" className="block text-sm font-medium text-slate-300 mb-1">Weekly capacity (squares) *</label>
                <input id="crew-cap" type="number" min={0} step="1" required value={form.weekly_sq_capacity} onChange={numField('weekly_sq_capacity')} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 mt-4 flex-wrap">
              <button type="submit" disabled={saving} className={`${btn} bg-green-700 text-white hover:bg-green-600`}>
                {saving ? 'Saving…' : editingId ? 'Update Crew' : 'Create Crew'}
              </button>
              <button type="button" onClick={closeForm} className={`${btn} bg-slate-600 text-white hover:bg-slate-500`}>Cancel</button>
            </div>
          </form>
        )}

        {loadError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{loadError}</span>
            <button type="button" onClick={loadCrews} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-slate-400" role="status" aria-live="polite">Loading crews…</div>
        ) : !loadError && crews.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-400">
            No active crews yet. Add one to start forecasting production.
          </div>
        ) : crews.length > 0 ? (
          <div className="relative bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto" tabIndex={0} aria-label="Crews table, scrolls horizontally">
            <table className="w-full text-sm">
              <caption className="sr-only">Active crews with capacity, dates and staffing.</caption>
              <thead className="bg-slate-700 border-b border-slate-600">
                <tr>
                  {['Name', 'Type', 'Size', 'Training', 'Start', 'Terminate', '$ / SQ', 'SQs / wk', 'Staff', 'Actions'].map((h) => (
                    <th scope="col" key={h} className="px-4 py-3 text-left font-medium text-slate-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {crews.map((crew) => {
                  const staff = staffData[crew.id]
                  const staffLabel = crew.crew_type === 'shingle' ? 'Supers' : 'Leads'
                  const staffCount = crew.crew_type === 'shingle' ? (staff?.super_count ?? 0) : (staff?.lead_count ?? 0)
                  return (
                    <tr key={crew.id} className="hover:bg-slate-700/40">
                      <th scope="row" className="px-4 py-3 font-medium text-white text-left">{crew.crew_name}</th>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${crew.crew_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                          {crew.crew_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{crew.team_members}</td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{crew.training_period_days} days</td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(crew.start_date)}</td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{crew.terminate_date ? formatDate(crew.terminate_date) : <span className="text-slate-400">Ongoing</span>}</td>
                      <td className="px-4 py-3 text-slate-300">${crew.revenue_per_sq != null ? Number(crew.revenue_per_sq).toFixed(0) : '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{crew.weekly_sq_capacity != null ? Number(crew.weekly_sq_capacity).toFixed(0) : '—'}</td>
                      <td className="px-4 py-3 min-w-44">
                        {editingStaffId === crew.id ? (
                          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); handleSaveStaff(crew.id) }}>
                            <div className="flex gap-2 items-center">
                              <label htmlFor={`staff-${crew.id}`} className="text-xs text-slate-300">{staffLabel}</label>
                              <input id={`staff-${crew.id}`} type="number" min={0} step="1" autoFocus
                                value={crew.crew_type === 'shingle' ? staffForm.superCount : staffForm.leadCount}
                                onChange={(e) => {
                                  const n = Math.max(0, parseInt(e.target.value, 10) || 0)
                                  setStaffForm((p) => crew.crew_type === 'shingle' ? { ...p, superCount: n } : { ...p, leadCount: n })
                                }}
                                className="w-20 px-2 py-1 min-h-[44px] bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                              />
                            </div>
                            <div className="flex gap-1">
                              <button type="submit" disabled={savingStaff} className="px-3 min-h-[44px] bg-green-700 hover:bg-green-600 text-white text-xs rounded-lg disabled:opacity-50">
                                {savingStaff ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={() => setEditingStaffId(null)} className="px-3 min-h-[44px] bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg">Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300 text-xs">{staffLabel}: {staffCount}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setStaffForm({ leadCount: staff?.lead_count ?? 0, superCount: staff?.super_count ?? 0 })
                                setEditingStaffId(crew.id)
                              }}
                              aria-label={`Edit ${staffLabel.toLowerCase()} for ${crew.crew_name}`}
                              className="text-xs text-blue-400 hover:text-blue-300 underline min-h-[44px] px-1"
                            >Edit</button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button type="button" onClick={() => handleEdit(crew)} aria-label={`Edit ${crew.crew_name}`} className="text-blue-400 hover:text-blue-300 text-sm min-h-[44px] px-2 rounded-lg">Edit</button>
                        <button type="button" onClick={() => handleDeactivate(crew)} aria-label={`Deactivate ${crew.crew_name}`} className="text-red-400 hover:text-red-300 text-sm min-h-[44px] px-2 rounded-lg">Deactivate</button>
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

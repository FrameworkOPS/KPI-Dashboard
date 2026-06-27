import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

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

const emptyForm = {
  crew_name: '', crew_type: 'shingle' as 'shingle' | 'metal',
  start_date: new Date().toISOString().split('T')[0],
  terminate_date: '', revenue_per_sq: 600, weekly_sq_capacity: 200,
}

export default function Crews() {
  const { token } = useAuthStore()
  const [crews, setCrews] = useState<Crew[]>([])
  const [staffData, setStaffData] = useState<Record<string, { lead_count: number; super_count: number }>>({})
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffForm, setStaffForm] = useState({ leadCount: 0, superCount: 0 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingStaff, setSavingStaff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })

  useEffect(() => { loadCrews() }, [])

  const loadCrews = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crews?active=true', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const crewList: Crew[] = data.data || []
        setCrews(crewList)
        // Load staff for each crew
        const entries = await Promise.all(crewList.map(async (c) => {
          const r = await fetch(`/api/crew-staff/crew/${c.id}`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok) { const d = await r.json(); return [c.id, d.data || { lead_count: 0, super_count: 0 }] as [string, any] }
          return [c.id, { lead_count: 0, super_count: 0 }] as [string, any]
        }))
        setStaffData(Object.fromEntries(entries))
      }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const handleSave = async () => {
    setError(null); setSaving(true)
    try {
      const url = editingId ? `/api/crews/${editingId}` : '/api/crews'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, terminate_date: form.terminate_date || null }),
      })
      if (res.ok) {
        setShowForm(false); setEditingId(null); setForm({ ...emptyForm })
        loadCrews()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `Failed to save (${res.status})`)
      }
    } catch (err) { setError('An error occurred') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this crew?')) return
    await fetch(`/api/crews/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    loadCrews()
  }

  const handleEdit = (crew: Crew) => {
    setForm({
      crew_name: crew.crew_name, crew_type: crew.crew_type,
      start_date: String(crew.start_date).slice(0, 10),
      terminate_date: crew.terminate_date ? String(crew.terminate_date).slice(0, 10) : '',
      revenue_per_sq: crew.revenue_per_sq,
      weekly_sq_capacity: crew.weekly_sq_capacity ?? (crew.crew_type === 'shingle' ? 200 : 100),
    })
    setEditingId(crew.id); setShowForm(true)
  }

  const handleSaveStaff = async (crewId: string) => {
    setSavingStaff(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/crew-staff', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ crewId, leadCount: staffForm.leadCount, superCount: staffForm.superCount, addedDate: today }),
      })
      if (res.ok) {
        setStaffData((prev) => ({ ...prev, [crewId]: { lead_count: staffForm.leadCount, super_count: staffForm.superCount } }))
        setEditingStaffId(null)
      }
    } catch (err) { console.error(err) } finally { setSavingStaff(false) }
  }

  const handleTypeChange = (type: 'shingle' | 'metal') => {
    setForm({ ...form, crew_type: type, revenue_per_sq: type === 'shingle' ? 600 : 1000, weekly_sq_capacity: type === 'shingle' ? 200 : 100 })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Crews</h1>
        <button onClick={() => { setShowForm(!showForm); if (!showForm) { setEditingId(null); setForm({ ...emptyForm }) } }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Crew'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 flex justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline ml-4">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Crew' : 'New Crew'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Crew Name *', key: 'crew_name', type: 'text', placeholder: 'e.g. Shingle Team A' },
              { label: 'Start Date', key: 'start_date', type: 'date' },
              { label: 'Terminate Date', key: 'terminate_date', type: 'date' },
              { label: 'Revenue / SQ ($) *', key: 'revenue_per_sq', type: 'number' },
              { label: 'Weekly SQ Capacity *', key: 'weekly_sq_capacity', type: 'number' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
                <input type={type} value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Crew Type *</label>
              <select value={form.crew_type} onChange={(e) => handleTypeChange(e.target.value as 'shingle' | 'metal')}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="shingle">Shingle</option>
                <option value="metal">Metal</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading...</div>
      ) : crews.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">No crews yet. Add one to get started.</div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                {['Name', 'Type', 'Size', 'Training', 'Start', 'Terminate', '$/sq', 'SQs/wk', 'Staff', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {crews.map((crew) => (
                <tr key={crew.id} className="hover:bg-slate-700/40">
                  <td className="px-4 py-3 font-medium text-white">{crew.crew_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${crew.crew_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                      {crew.crew_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{crew.team_members}</td>
                  <td className="px-4 py-3 text-slate-300">{crew.training_period_days}d</td>
                  <td className="px-4 py-3 text-slate-300">{String(crew.start_date).slice(0, 10)}</td>
                  <td className="px-4 py-3 text-slate-300">{crew.terminate_date ? String(crew.terminate_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-slate-300">${crew.revenue_per_sq != null ? Number(crew.revenue_per_sq).toFixed(0) : '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{crew.weekly_sq_capacity != null ? Number(crew.weekly_sq_capacity).toFixed(0) : '—'}</td>
                  <td className="px-4 py-3 min-w-40">
                    {editingStaffId === crew.id ? (
                      <div className="space-y-1">
                        <div className="flex gap-2 items-center">
                          <label className="text-xs text-slate-400">{crew.crew_type === 'shingle' ? 'Supers' : 'Leads'}</label>
                          <input type="number" min="0"
                            value={crew.crew_type === 'shingle' ? staffForm.superCount : staffForm.leadCount}
                            onChange={(e) => crew.crew_type === 'shingle'
                              ? setStaffForm((p) => ({ ...p, superCount: parseInt(e.target.value) || 0 }))
                              : setStaffForm((p) => ({ ...p, leadCount: parseInt(e.target.value) || 0 }))}
                            className="w-16 px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-white text-xs"
                          />
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleSaveStaff(crew.id)} disabled={savingStaff}
                            className="px-2 py-0.5 bg-green-700 text-white text-xs rounded disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingStaffId(null)} className="px-2 py-0.5 bg-slate-600 text-slate-300 text-xs rounded">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs">
                          {crew.crew_type === 'shingle'
                            ? `Supers: ${staffData[crew.id]?.super_count ?? 0}`
                            : `Leads: ${staffData[crew.id]?.lead_count ?? 0}`}
                        </span>
                        <button onClick={() => {
                          const s = staffData[crew.id]
                          setStaffForm({ leadCount: s?.lead_count ?? 0, superCount: s?.super_count ?? 0 })
                          setEditingStaffId(crew.id)
                        }} className="text-xs text-blue-400 hover:text-blue-300 underline">Edit</button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 space-x-3">
                    <button onClick={() => handleEdit(crew)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                    <button onClick={() => handleDelete(crew.id)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

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

const emptyForm = {
  crew_id: '',
  project_name: '',
  start_date: '',
  end_date: '',
  notes: '',
}

export default function CustomProjects() {
  const { token } = useAuthStore()
  const [projects, setProjects] = useState<CustomProject[]>([])
  const [crews, setCrews] = useState<Crew[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [projectsRes, crewsRes] = await Promise.all([
        fetch('/api/custom-projects', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/crews?active=true', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (projectsRes.ok) { const d = await projectsRes.json(); setProjects(d.data || []) }
      if (crewsRes.ok) { const d = await crewsRes.json(); setCrews(d.data || []) }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const handleSave = async () => {
    setError(null); setSaving(true)
    try {
      const url = editingId ? `/api/custom-projects/${editingId}` : '/api/custom-projects'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId
        ? { project_name: form.project_name, start_date: form.start_date, end_date: form.end_date, notes: form.notes || null }
        : { crew_id: form.crew_id, project_name: form.project_name, start_date: form.start_date, end_date: form.end_date, notes: form.notes || null }
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowForm(false); setEditingId(null); setForm({ ...emptyForm })
        loadAll()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `Failed (${res.status})`)
      }
    } catch (err) { setError('An error occurred') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this capacity block?')) return
    await fetch(`/api/custom-projects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    loadAll()
  }

  const handleEdit = (p: CustomProject) => {
    setForm({
      crew_id: p.crew_id,
      project_name: p.project_name,
      start_date: String(p.start_date).slice(0, 10),
      end_date: String(p.end_date).slice(0, 10),
      notes: p.notes || '',
    })
    setEditingId(p.id); setShowForm(true)
  }

  const isActive = (p: CustomProject) => {
    const today = new Date().toISOString().slice(0, 10)
    return p.end_date >= today
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Capacity Blocks</h1>
        <button
          onClick={() => { setShowForm(!showForm); if (!showForm) { setEditingId(null); setForm({ ...emptyForm }) } }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Add Block'}
        </button>
      </div>

      <p className="text-sm text-slate-400">
        Capacity blocks remove a crew from production for a date range — use them for custom projects, vacation, or other events that take a crew offline.
      </p>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 flex justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline ml-4">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Block' : 'New Capacity Block'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!editingId && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Crew *</label>
                <select
                  value={form.crew_id}
                  onChange={(e) => setForm({ ...form, crew_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a crew...</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.crew_name} ({c.crew_type})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Project / Event Name *</label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                placeholder="e.g. Commercial Project, Vacation"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Start Date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">End Date *</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
      ) : projects.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">No capacity blocks. Add one to exclude a crew from forecasting for a period.</div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                {['Crew', 'Type', 'Project / Event', 'Start', 'End', 'Status', 'Notes', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-700/40">
                  <td className="px-4 py-3 font-medium text-white">{p.crew_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.crew_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                      {p.crew_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{p.project_name}</td>
                  <td className="px-4 py-3 text-slate-400">{String(p.start_date).slice(0, 10)}</td>
                  <td className="px-4 py-3 text-slate-400">{String(p.end_date).slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    {isActive(p)
                      ? <span className="px-2 py-0.5 rounded text-xs bg-orange-900/40 text-orange-300">Active Block</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400">Past</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 max-w-32 truncate">{p.notes || '—'}</td>
                  <td className="px-4 py-3 space-x-3">
                    <button onClick={() => handleEdit(p)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
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

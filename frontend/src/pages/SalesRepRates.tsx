import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'

interface RepRate {
  sales_rep_name: string
  close_rate: number
  notes: string | null
  updated_at?: string
}

interface ForecasterSettings {
  closing_rate: number
  avg_sqs_per_contract: number
  material_field_key: string
}

export default function SalesRepRates() {
  const { token, user } = useAuthStore()
  const canEdit = user?.role === 'admin' || user?.role === 'leadership'
  const [rates, setRates] = useState<RepRate[]>([])
  const [settings, setSettings] = useState<ForecasterSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ sales_rep_name: '', close_rate_pct: 35, notes: '' })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [ratesRes, settingsRes] = await Promise.all([
        fetch('/api/forecaster-ai/sales-rep-rates', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/forecaster-ai/settings',         { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (ratesRes.ok)    { const d = await ratesRes.json();    setRates(d.data || []) }
      if (settingsRes.ok) { const d = await settingsRes.json(); setSettings(d.data) }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const startEdit = (r?: RepRate) => {
    if (r) {
      setEditingName(r.sales_rep_name)
      setForm({ sales_rep_name: r.sales_rep_name, close_rate_pct: r.close_rate * 100, notes: r.notes || '' })
    } else {
      setEditingName(null)
      setForm({ sales_rep_name: '', close_rate_pct: settings ? settings.closing_rate * 100 : 35, notes: '' })
    }
    setShowForm(true)
  }
  const closeForm = () => {
    setShowForm(false); setEditingName(null)
    setForm({ sales_rep_name: '', close_rate_pct: 35, notes: '' })
  }

  const handleSave = async () => {
    if (!form.sales_rep_name.trim()) { setError('Sales rep name required'); return }
    const pct = Number(form.close_rate_pct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { setError('Closing rate must be 0–100%'); return }
    setError(null); setSaving(true)
    try {
      const res = await fetch('/api/forecaster-ai/sales-rep-rates', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sales_rep_name: form.sales_rep_name.trim(),
          close_rate: pct / 100,
          notes: form.notes || null,
        }),
      })
      if (res.ok) { closeForm(); loadAll() }
      else { const d = await res.json().catch(() => ({})); setError(d.error || `Failed (${res.status})`) }
    } catch { setError('Save failed') } finally { setSaving(false) }
  }

  const handleDelete = async (repName: string) => {
    if (!confirm(`Remove override for ${repName}? They'll revert to the global rate.`)) return
    await fetch(`/api/forecaster-ai/sales-rep-rates/${encodeURIComponent(repName)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    loadAll()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales Rep Close Rates</h1>
          <p className="text-xs text-slate-400 mt-1">
            Override the global closing rate per sales rep. Used to weight JobNimbus contracts when projecting pipeline.
            Reps not listed use the global rate{settings && <> ({(settings.closing_rate * 100).toFixed(0)}%)</>}.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => startEdit()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Add Override
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 flex justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Edit form */}
      {showForm && canEdit && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">
            {editingName ? `Edit override: ${editingName}` : 'New override'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Sales Rep Name</label>
              <input
                type="text"
                value={form.sales_rep_name}
                onChange={(e) => setForm({ ...form, sales_rep_name: e.target.value })}
                disabled={!!editingName}
                placeholder="Match exactly as it appears in JobNimbus"
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Close Rate (%)</label>
              <input
                type="number" min={0} max={100} step={1}
                value={form.close_rate_pct}
                onChange={(e) => setForm({ ...form, close_rate_pct: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Notes</label>
              <input
                type="text" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={closeForm}
              className="px-4 py-2 bg-slate-700 text-white text-sm rounded hover:bg-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading…</div>
      ) : rates.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">
          No sales-rep overrides. All reps use the global rate of {settings ? (settings.closing_rate * 100).toFixed(0) : '35'}%.
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-x-auto border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/50 border-b border-slate-700">
              <tr>
                {['Sales Rep', 'Close Rate', 'vs Global', 'Notes', 'Updated', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-slate-300 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rates.map((r) => {
                const global = settings?.closing_rate || 0.35
                const diff = r.close_rate - global
                const pct = (r.close_rate * 100).toFixed(0)
                return (
                  <tr key={r.sales_rep_name} className="hover:bg-slate-700/40">
                    <td className="px-4 py-3 font-medium text-white">{r.sales_rep_name}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${r.close_rate >= global ? 'text-green-400' : 'text-yellow-400'}`}>
                        {pct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {diff > 0 ? `+${(diff * 100).toFixed(0)} pts` : diff < 0 ? `${(diff * 100).toFixed(0)} pts` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{r.notes || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 space-x-3">
                      {canEdit && (<>
                        <button onClick={() => startEdit(r)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                        <button onClick={() => handleDelete(r.sales_rep_name)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                      </>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

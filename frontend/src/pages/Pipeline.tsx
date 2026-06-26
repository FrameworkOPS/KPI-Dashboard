import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

interface PipelineItem {
  id: string
  job_type: 'shingle' | 'metal'
  square_footage: number
  revenue_per_sq: number
  total_revenue: number
  status: string
  added_date: string
  target_start_date?: string
  notes?: string
}

interface PipelineSummary {
  byType: Array<{ job_type: string; total_sqs: number; job_count: number; total_revenue: number }>
  combined: { total_sqs: number; total_revenue: number; job_count: number }
}

interface JnBucket {
  job_count: number
  contracts_sent: number
  work_orders: number
  work_orders_missing_sqs: number
  weighted_contract_sqs: number
  work_order_sqs: number
  total_sqs: number
  forecast_revenue: number
  estimate_value: number
}

interface JnSummary {
  shingle: JnBucket
  metal: JnBucket
  gutter: JnBucket
  unknown: JnBucket
  totals: JnBucket
  by_rep: Array<{
    sales_rep_name: string
    job_count: number
    contracts_sent: number
    work_orders: number
    total_sqs: number
    forecast_revenue: number
    estimate_value: number
  }>
  jobs: Array<{
    jnid: string
    name: string | null
    sales_rep_name: string | null
    material: 'shingle' | 'metal' | 'gutter' | 'unknown'
    bucket: 'contract' | 'work_order'
    weighted_sqs: number
    sqs_source: 'avg_contract' | 'work_order_field' | 'missing_work_order_field'
    forecast_revenue: number
    estimate_value: number
    url: string
  }>
  settings: { material_field_key: string; closing_rate: number; avg_sqs_per_contract: number }
  generated_at: string
}

interface Crew {
  id: string
  crew_name: string
  crew_type: 'shingle' | 'metal'
  weekly_sq_capacity: number
  training_period_days: number
  start_date: string
  is_active: boolean
}

const emptyForm = {
  jobType: 'shingle' as 'shingle' | 'metal',
  squareFootage: 0,
  revenuePerSq: 600,
  estimatedDaysToCompletion: 14,
  addedDate: new Date().toISOString().split('T')[0],
  targetStartDate: '',
  notes: '',
  status: 'pending',
}

export default function Pipeline() {
  const { token } = useAuthStore()
  const [summary, setSummary] = useState<PipelineSummary | null>(null)
  const [jn, setJn] = useState<JnSummary | null>(null)
  const [items, setItems] = useState<PipelineItem[]>([])
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
      const [summaryRes, itemsRes, crewsRes, jnRes] = await Promise.all([
        fetch('/api/pipeline/summary', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/pipeline', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/crews?active=true', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/forecaster-ai/jn-pipeline', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (summaryRes.ok) { const d = await summaryRes.json(); setSummary(d.data) }
      if (itemsRes.ok) { const d = await itemsRes.json(); setItems(d.data || []) }
      if (crewsRes.ok) { const d = await crewsRes.json(); setCrews(d.data || []) }
      if (jnRes.ok) { const d = await jnRes.json(); setJn(d.data) }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const handleTypeChange = (type: 'shingle' | 'metal') => {
    setForm({ ...form, jobType: type, revenuePerSq: type === 'shingle' ? 600 : 1000 })
  }

  const handleSave = async () => {
    setError(null); setSaving(true)
    try {
      const url = editingId ? `/api/pipeline/${editingId}` : '/api/pipeline'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          targetStartDate: form.targetStartDate || null,
          notes: form.notes || null,
        }),
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
    if (!confirm('Remove this pipeline item?')) return
    await fetch(`/api/pipeline/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    loadAll()
  }

  const handleEdit = (item: PipelineItem) => {
    setForm({
      jobType: item.job_type,
      squareFootage: item.square_footage,
      revenuePerSq: item.revenue_per_sq,
      estimatedDaysToCompletion: 14,
      addedDate: String(item.added_date).slice(0, 10),
      targetStartDate: item.target_start_date ? String(item.target_start_date).slice(0, 10) : '',
      notes: item.notes || '',
      status: item.status,
    })
    setEditingId(item.id); setShowForm(true)
  }

  const shingleCapacity = crews
    .filter((c) => c.crew_type === 'shingle')
    .reduce((s, c) => s + (c.weekly_sq_capacity || 0), 0)
  const metalCapacity = crews
    .filter((c) => c.crew_type === 'metal')
    .reduce((s, c) => s + (c.weekly_sq_capacity || 0), 0)

  const getByType = (type: string) => summary?.byType.find((b) => b.job_type === type)
  const manualShingle = getByType('shingle')
  const manualMetal = getByType('metal')
  const jnShingleSqs = (jn?.shingle.total_sqs || 0) + (jn?.unknown.total_sqs || 0) / 2
  const jnMetalSqs = (jn?.metal.total_sqs || 0) + (jn?.unknown.total_sqs || 0) / 2
  const shingleTotalSqs = (manualShingle?.total_sqs || 0) + jnShingleSqs
  const metalTotalSqs = (manualMetal?.total_sqs || 0) + jnMetalSqs
  const shingleForecastRevenue = shingleTotalSqs * 600
  const metalForecastRevenue = metalTotalSqs * 1000
  const totalForecastRevenue = shingleForecastRevenue + metalForecastRevenue
  const totalForecastSqs = shingleTotalSqs + metalTotalSqs
  const jnJobCount = jn?.totals.job_count || 0
  const hasJnPipeline = jn && jnJobCount > 0
  const money = (value: number) => `$${Math.round(value).toLocaleString()}`
  const compactMoney = (value: number) => `$${(value / 1000).toFixed(0)}k`
  const sqs = (value: number) => `${Math.round(value).toLocaleString()} SQs`

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Pipeline</h1>
        <button
          onClick={() => { setShowForm(!showForm); if (!showForm) { setEditingId(null); setForm({ ...emptyForm }) } }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Add Job'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 flex justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Forecast cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: 'Shingle Forecast',
            value: shingleTotalSqs,
            sub: `${manualShingle?.job_count || 0} manual · ${Math.round(jnShingleSqs)} JN SQs · $600/SQ`,
            color: 'text-cyan-400',
            rev: shingleForecastRevenue,
          },
          {
            label: 'Metal Forecast',
            value: metalTotalSqs,
            sub: `${manualMetal?.job_count || 0} manual · ${Math.round(jnMetalSqs)} JN SQs · $1,000/SQ`,
            color: 'text-pink-400',
            rev: metalForecastRevenue,
          },
          {
            label: 'Total Forecast',
            value: totalForecastSqs,
            sub: `${summary?.combined.job_count || 0} manual jobs · ${jnJobCount} JobNimbus jobs`,
            color: 'text-white',
            rev: totalForecastRevenue,
          },
        ].map(({ label, value, sub, color, rev }) => (
          <div key={label} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{sqs(value)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub} · {compactMoney(rev)} forecast</p>
          </div>
        ))}
      </div>

      {/* JobNimbus live pipeline */}
      {hasJnPipeline && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-slate-300">Live from JobNimbus</h3>
            </div>
            <span className="text-xs text-slate-500">
              {jn.totals.job_count} jobs · Close rate {(jn.settings.closing_rate * 100).toFixed(0)}% · Contracts use avg {jn.settings.avg_sqs_per_contract} SQs
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {(['shingle', 'metal', 'gutter', 'unknown'] as const).map((mat) => {
              const b = jn[mat]
              const color = mat === 'shingle' ? 'text-cyan-400' : mat === 'metal' ? 'text-pink-400' : mat === 'gutter' ? 'text-emerald-400' : 'text-slate-400'
              return (
                <div key={mat} className="bg-slate-700/40 rounded-lg p-3 border border-slate-700">
                  <p className={`text-xs uppercase tracking-wide mb-1 ${color}`}>
                    {mat === 'unknown' ? 'Unknown' : mat}
                  </p>
                  <p className="text-xl font-bold text-white">{mat === 'gutter' ? b.job_count : sqs(b.total_sqs)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {b.job_count} jobs · {b.contracts_sent} contracts · {b.work_orders} WOs
                  </p>
                  <p className="text-xs text-slate-400">
                    {mat === 'gutter' || mat === 'unknown' ? `${money(b.estimate_value)} JN estimate` : `${money(b.forecast_revenue)} forecast`}
                  </p>
                  {b.work_orders_missing_sqs > 0 && (
                    <p className="text-[11px] text-yellow-300 mt-1">{b.work_orders_missing_sqs} WOs missing # of sqs</p>
                  )}
                </div>
              )
            })}
            <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-800/60">
              <p className="text-xs uppercase tracking-wide mb-1 text-blue-300">Push to JN #</p>
              <p className="text-xl font-bold text-white">{jn.totals.job_count}</p>
              <p className="text-xs text-slate-400 mt-1">{jn.totals.contracts_sent} contracts · {jn.totals.work_orders} work orders</p>
              <p className="text-xs text-slate-400">{money(jn.totals.estimate_value)} JobNimbus estimate</p>
            </div>
          </div>
          {jn.by_rep.length > 0 && (
            <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Jobs by Rep</h4>
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900/40 text-slate-400">
                      <tr>
                        {['Rep', 'Jobs', 'Contracts', 'WOs', 'SQs', 'Forecast'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {jn.by_rep.slice(0, 8).map((rep) => (
                        <tr key={rep.sales_rep_name}>
                          <td className="px-3 py-2 text-white">{rep.sales_rep_name}</td>
                          <td className="px-3 py-2 text-slate-300">{rep.job_count}</td>
                          <td className="px-3 py-2 text-slate-300">{rep.contracts_sent}</td>
                          <td className="px-3 py-2 text-slate-300">{rep.work_orders}</td>
                          <td className="px-3 py-2 text-slate-300">{Math.round(rep.total_sqs)}</td>
                          <td className="px-3 py-2 text-slate-300">{money(rep.forecast_revenue || rep.estimate_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Top JobNimbus Jobs</h4>
                <div className="space-y-2">
                  {jn.jobs.slice(0, 5).map((job) => (
                    <a
                      key={job.jnid}
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-slate-700 bg-slate-900/30 px-3 py-2 hover:border-blue-500/70"
                    >
                      <div className="flex justify-between gap-3">
                        <p className="text-xs font-medium text-white truncate">{job.name || job.jnid}</p>
                        <span className="text-[11px] text-blue-300 shrink-0">#{job.jnid}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {job.sales_rep_name || 'Unassigned'} · {job.material} · {job.bucket === 'work_order' ? 'work order' : 'contract'} · {job.sqs_source === 'missing_work_order_field' ? 'missing # of sqs' : money(job.forecast_revenue || job.estimate_value)}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Live shingle and metal pipeline is added to manual pipeline in the production forecast.
            {jn.unknown.contracts_sent + jn.unknown.work_orders > 0 && (
              <span className="text-yellow-400/80"> Unknown-material jobs are split 50/50 between shingle and metal.</span>
            )}
            {jn.gutter.job_count > 0 && (
              <span className="text-emerald-400/80"> Gutter jobs are shown separately and do not add to shingle/metal production SQs.</span>
            )}
            {jn.totals.work_orders_missing_sqs > 0 && (
              <span className="text-yellow-400/80"> {jn.totals.work_orders_missing_sqs} work orders are missing the # of sqs field and are counted as 0 SQs until JobNimbus has that value.</span>
            )}
          </p>
        </div>
      )}

      {/* Manual pipeline cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Manual Shingle', value: manualShingle?.total_sqs || 0, sub: `${manualShingle?.job_count || 0} jobs`, color: 'text-cyan-400', rev: manualShingle?.total_revenue || 0 },
          { label: 'Manual Metal', value: manualMetal?.total_sqs || 0, sub: `${manualMetal?.job_count || 0} jobs`, color: 'text-pink-400', rev: manualMetal?.total_revenue || 0 },
          { label: 'Manual Total', value: summary?.combined.total_sqs || 0, sub: `${summary?.combined.job_count || 0} jobs`, color: 'text-white', rev: summary?.combined.total_revenue || 0 },
        ].map(({ label, value, sub, color, rev }) => (
          <div key={label} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{sqs(value)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub} · {compactMoney(rev)} revenue</p>
          </div>
        ))}
      </div>

      {/* Crew capacity */}
      {crews.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Weekly Production Capacity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-slate-400">Shingle Crews</p>
              <p className="text-lg font-bold text-cyan-400">{crews.filter((c) => c.crew_type === 'shingle').length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Shingle SQs/wk</p>
              <p className="text-lg font-bold text-cyan-400">{shingleCapacity.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Metal Crews</p>
              <p className="text-lg font-bold text-pink-400">{crews.filter((c) => c.crew_type === 'metal').length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Metal SQs/wk</p>
              <p className="text-lg font-bold text-pink-400">{metalCapacity.toFixed(0)}</p>
            </div>
          </div>
          {shingleCapacity > 0 && shingleTotalSqs > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              Shingle lead time: ~{(shingleTotalSqs / shingleCapacity).toFixed(1)} weeks at current capacity
            </p>
          )}
          {metalCapacity > 0 && metalTotalSqs > 0 && (
            <p className="text-xs text-slate-500">
              Metal lead time: ~{(metalTotalSqs / metalCapacity).toFixed(1)} weeks at current capacity
            </p>
          )}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Pipeline Item' : 'Add Pipeline Item'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Job Type *</label>
              <select
                value={form.jobType}
                onChange={(e) => handleTypeChange(e.target.value as 'shingle' | 'metal')}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="shingle">Shingle</option>
                <option value="metal">Metal</option>
              </select>
            </div>
            {[
              { label: 'Square Footage *', key: 'squareFootage', type: 'number' },
              { label: 'Revenue / SQ ($) *', key: 'revenuePerSq', type: 'number' },
              { label: 'Est. Days to Complete *', key: 'estimatedDaysToCompletion', type: 'number' },
              { label: 'Added Date *', key: 'addedDate', type: 'date' },
              { label: 'Target Start Date', key: 'targetStartDate', type: 'date' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
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
          <div className="mt-3 text-xs text-slate-400">
            Estimated revenue: ${((form.squareFootage || 0) * (form.revenuePerSq || 0)).toLocaleString()}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Pipeline items table */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">No pipeline items yet.</div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                {['Type', 'SQs', '$/SQ', 'Revenue', 'Status', 'Added', 'Target Start', 'Notes', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-700/40">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.job_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                      {item.job_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.square_footage.toFixed(0)}</td>
                  <td className="px-4 py-3 text-slate-300">${item.revenue_per_sq.toFixed(0)}</td>
                  <td className="px-4 py-3 text-slate-300">${item.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{item.status}</td>
                  <td className="px-4 py-3 text-slate-400">{String(item.added_date).slice(0, 10)}</td>
                  <td className="px-4 py-3 text-slate-400">{item.target_start_date ? String(item.target_start_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-slate-400 max-w-32 truncate">{item.notes || '—'}</td>
                  <td className="px-4 py-3 space-x-3">
                    <button onClick={() => handleEdit(item)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
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

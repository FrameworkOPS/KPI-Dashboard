import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import {
  getPipelineApi, getPipelineSummaryApi, createPipelineItemApi, updatePipelineItemApi, deletePipelineItemApi, getCrewsApi,
} from '../services/api'
import { formatDate, todayISO } from '../utils/dates'

interface PipelineItem {
  id: string
  job_type: 'shingle' | 'metal'
  square_footage: number
  revenue_per_sq: number
  total_revenue: number
  estimated_days_to_completion: number
  status: string
  added_date: string
  target_start_date?: string
  notes?: string
}

interface PipelineSummary {
  byType: Array<{ job_type: string; total_sqs: number; job_count: number; total_revenue: number }>
  combined: { total_sqs: number; total_revenue: number; job_count: number }
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

const RATE_DEFAULTS = { shingle: 600, metal: 1000 }
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed',
}

const emptyForm = () => ({
  jobType: 'shingle' as 'shingle' | 'metal',
  squareFootage: 0,
  revenuePerSq: RATE_DEFAULTS.shingle,
  estimatedDaysToCompletion: 14,
  addedDate: todayISO(),
  targetStartDate: '',
  notes: '',
  status: 'pending',
})

const inputCls = 'w-full px-3 py-2 min-h-[44px] bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
const btn = 'px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const compactMoney = (value: number) => (value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : money(value))
const sqs = (value: number) => `${Math.round(value).toLocaleString()} SQs`

export default function Pipeline() {
  const [summary, setSummary] = useState<PipelineSummary | null>(null)
  const [items, setItems] = useState<PipelineItem[]>([])
  const [crews, setCrews] = useState<Crew[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [summaryRes, itemsRes, crewsRes] = await Promise.all([
        getPipelineSummaryApi(), getPipelineApi(), getCrewsApi(true),
      ])
      setSummary(summaryRes.data?.data || null)
      setItems(itemsRes.data?.data || [])
      setCrews(crewsRes.data?.data || [])
    } catch (e: any) {
      setLoadError(e.message || 'Could not load the pipeline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setError(null); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingId(null); setError(null) }

  const handleTypeChange = (type: 'shingle' | 'metal') => {
    setForm({ ...form, jobType: type, revenuePerSq: RATE_DEFAULTS[type] })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!(form.squareFootage > 0)) { setError('Enter the job size in squares (more than 0).'); return }
    if (!(form.revenuePerSq > 0)) { setError('Enter the revenue per square.'); return }
    if (!(form.estimatedDaysToCompletion > 0)) { setError('Enter the estimated days to complete.'); return }
    if (!form.addedDate) { setError('Enter the date the job was added.'); return }
    setSaving(true)
    try {
      const payload = { ...form, targetStartDate: form.targetStartDate || null, notes: form.notes.trim() || null }
      if (editingId) await updatePipelineItemApi(editingId, payload)
      else await createPipelineItemApi(payload)
      closeForm()
      setForm(emptyForm())
      await loadAll()
    } catch (e: any) {
      setError(e.message || 'Could not save the job')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: PipelineItem) => {
    if (!confirm(`Remove this ${item.job_type} job (${sqs(item.square_footage)}) from the pipeline? It will stop counting toward the forecast.`)) return
    setError(null)
    try {
      await deletePipelineItemApi(item.id)
      await loadAll()
    } catch (e: any) {
      setError(e.message || 'Could not remove the job')
    }
  }

  const handleEdit = (item: PipelineItem) => {
    setForm({
      jobType: item.job_type,
      squareFootage: Number(item.square_footage) || 0,
      revenuePerSq: Number(item.revenue_per_sq) || RATE_DEFAULTS[item.job_type],
      estimatedDaysToCompletion: Number(item.estimated_days_to_completion) || 14,
      addedDate: String(item.added_date).slice(0, 10),
      targetStartDate: item.target_start_date ? String(item.target_start_date).slice(0, 10) : '',
      notes: item.notes || '',
      status: item.status,
    })
    setError(null)
    setEditingId(item.id); setShowForm(true)
  }

  const numField = (key: 'squareFootage' | 'revenuePerSq' | 'estimatedDaysToCompletion') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0) })

  const shingleCrews = crews.filter((c) => c.crew_type === 'shingle')
  const metalCrews = crews.filter((c) => c.crew_type === 'metal')
  const shingleCapacity = shingleCrews.reduce((s, c) => s + (Number(c.weekly_sq_capacity) || 0), 0)
  const metalCapacity = metalCrews.reduce((s, c) => s + (Number(c.weekly_sq_capacity) || 0), 0)

  const byType = (type: string) => summary?.byType.find((b) => b.job_type === type)
  const shinglePipeline = byType('shingle')
  const metalPipeline = byType('metal')
  // Revenue comes from the jobs' own rates, so a job entered at a custom $/SQ counts correctly.
  const cards = [
    { label: 'Shingle Pipeline', value: shinglePipeline?.total_sqs || 0, jobs: shinglePipeline?.job_count || 0, rev: shinglePipeline?.total_revenue || 0, color: 'text-cyan-300' },
    { label: 'Metal Pipeline', value: metalPipeline?.total_sqs || 0, jobs: metalPipeline?.job_count || 0, rev: metalPipeline?.total_revenue || 0, color: 'text-pink-300' },
    { label: 'Total Pipeline', value: summary?.combined.total_sqs || 0, jobs: summary?.combined.job_count || 0, rev: summary?.combined.total_revenue || 0, color: 'text-white' },
  ]

  return (
    <>
      <Header
        title="Pipeline"
        actions={
          <button type="button" onClick={showForm ? closeForm : openNew} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            {showForm ? 'Cancel' : '+ Add Job'}
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-5">
        <p className="text-sm text-slate-400">Open jobs entered here feed the production forecast and lead times. Completed jobs drop out of the totals.</p>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 underline min-h-[44px] px-2">Dismiss</button>
          </div>
        )}

        {loadError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{loadError}</span>
            <button type="button" onClick={loadAll} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map(({ label, value, jobs, rev, color }) => (
            <div key={label} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{sqs(value)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{jobs} open {jobs === 1 ? 'job' : 'jobs'} · {compactMoney(rev)} revenue</p>
            </div>
          ))}
        </div>

        {/* Crew capacity */}
        {crews.length > 0 && (
          <section aria-labelledby="capacity-title" className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <h2 id="capacity-title" className="text-sm font-semibold text-slate-300 mb-3">Weekly Production Capacity</h2>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><dt className="text-xs text-slate-400">Shingle crews</dt><dd className="text-lg font-bold text-cyan-300">{shingleCrews.length}</dd></div>
              <div><dt className="text-xs text-slate-400">Shingle SQs / wk</dt><dd className="text-lg font-bold text-cyan-300">{shingleCapacity.toFixed(0)}</dd></div>
              <div><dt className="text-xs text-slate-400">Metal crews</dt><dd className="text-lg font-bold text-pink-300">{metalCrews.length}</dd></div>
              <div><dt className="text-xs text-slate-400">Metal SQs / wk</dt><dd className="text-lg font-bold text-pink-300">{metalCapacity.toFixed(0)}</dd></div>
            </dl>
            {shingleCapacity > 0 && (shinglePipeline?.total_sqs || 0) > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                Shingle lead time: about {((shinglePipeline?.total_sqs || 0) / shingleCapacity).toFixed(1)} weeks at current capacity
              </p>
            )}
            {metalCapacity > 0 && (metalPipeline?.total_sqs || 0) > 0 && (
              <p className="text-xs text-slate-400">
                Metal lead time: about {((metalPipeline?.total_sqs || 0) / metalCapacity).toFixed(1)} weeks at current capacity
              </p>
            )}
          </section>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <form onSubmit={handleSave} aria-labelledby="pipeline-form-title" className="bg-slate-800 rounded-xl p-5 md:p-6 border border-slate-700">
            <h2 id="pipeline-form-title" className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Job' : 'Add Job'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pipe-type" className="block text-sm font-medium text-slate-300 mb-1">Job Type *</label>
                <select id="pipe-type" value={form.jobType} onChange={(e) => handleTypeChange(e.target.value as 'shingle' | 'metal')} className={inputCls}>
                  <option value="shingle">Shingle</option>
                  <option value="metal">Metal</option>
                </select>
              </div>
              <div>
                <label htmlFor="pipe-sqs" className="block text-sm font-medium text-slate-300 mb-1">Size in squares (SQs) *</label>
                <input id="pipe-sqs" type="number" min={0} step="any" required value={form.squareFootage} onChange={numField('squareFootage')} className={inputCls} autoFocus />
                <p className="text-xs text-slate-400 mt-1">One square is 100 sq ft of roof.</p>
              </div>
              <div>
                <label htmlFor="pipe-rate" className="block text-sm font-medium text-slate-300 mb-1">Revenue per square ($) *</label>
                <input id="pipe-rate" type="number" min={0} step="1" required value={form.revenuePerSq} onChange={numField('revenuePerSq')} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pipe-days" className="block text-sm font-medium text-slate-300 mb-1">Estimated days to complete *</label>
                <input id="pipe-days" type="number" min={1} step="1" required value={form.estimatedDaysToCompletion} onChange={numField('estimatedDaysToCompletion')} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pipe-added" className="block text-sm font-medium text-slate-300 mb-1">Added Date *</label>
                <input id="pipe-added" type="date" required value={form.addedDate} onChange={(e) => setForm({ ...form, addedDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pipe-target" className="block text-sm font-medium text-slate-300 mb-1">Target Start Date</label>
                <input id="pipe-target" type="date" value={form.targetStartDate} onChange={(e) => setForm({ ...form, targetStartDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pipe-status" className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                <select id="pipe-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="pipe-notes" className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                <input id="pipe-notes" type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" className={inputCls} />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-300" aria-live="polite">
              Estimated revenue: <span className="font-semibold text-white">{money((form.squareFootage || 0) * (form.revenuePerSq || 0))}</span>
            </p>
            <div className="flex gap-3 mt-4 flex-wrap">
              <button type="submit" disabled={saving} className={`${btn} bg-green-700 text-white hover:bg-green-600`}>
                {saving ? 'Saving…' : editingId ? 'Update Job' : 'Add Job'}
              </button>
              <button type="button" onClick={closeForm} className={`${btn} bg-slate-600 text-white hover:bg-slate-500`}>Cancel</button>
            </div>
          </form>
        )}

        {/* Pipeline items table */}
        {loading ? (
          <div className="text-center py-8 text-slate-400" role="status" aria-live="polite">Loading pipeline…</div>
        ) : !loadError && items.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-400">No jobs in the pipeline yet. Add one to start the forecast.</div>
        ) : items.length > 0 ? (
          <div className="relative bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto" tabIndex={0} aria-label="Pipeline jobs table, scrolls horizontally">
            <table className="w-full text-sm">
              <caption className="sr-only">Pipeline jobs with size, revenue, status and dates.</caption>
              <thead className="bg-slate-700 border-b border-slate-600">
                <tr>
                  {['Type', 'SQs', '$ / SQ', 'Revenue', 'Days', 'Status', 'Added', 'Target Start', 'Notes', 'Actions'].map((h) => (
                    <th scope="col" key={h} className="px-4 py-3 text-left font-medium text-slate-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-700/40">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${item.job_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                        {item.job_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{Number(item.square_footage ?? 0).toFixed(0)}</td>
                    <td className="px-4 py-3 text-slate-300">${Number(item.revenue_per_sq ?? 0).toFixed(0)}</td>
                    <td className="px-4 py-3 text-slate-300">{money(Number(item.total_revenue ?? 0))}</td>
                    <td className="px-4 py-3 text-slate-300">{item.estimated_days_to_completion || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{STATUS_LABELS[item.status] || item.status}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(item.added_date)}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{item.target_start_date ? formatDate(item.target_start_date) : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-slate-300 max-w-48 truncate" title={item.notes || undefined}>{item.notes || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button type="button" onClick={() => handleEdit(item)} aria-label={`Edit ${item.job_type} job of ${Number(item.square_footage).toFixed(0)} squares`} className="text-blue-400 hover:text-blue-300 text-sm min-h-[44px] px-2 rounded-lg">Edit</button>
                      <button type="button" onClick={() => handleDelete(item)} aria-label={`Remove ${item.job_type} job of ${Number(item.square_footage).toFixed(0)} squares`} className="text-red-400 hover:text-red-300 text-sm min-h-[44px] px-2 rounded-lg">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  )
}

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import Header from '../components/Header'
import { getJobNimbusAnalyticsApi, getJobNimbusJobsApi } from '../services/api'

interface Totals { all: number; open: number; won: number; lost: number; leads: number; contracts_sent: number; billed: number }
interface PrevTotals { open: number; won: number; lost: number; leads: number; contracts_sent: number; billed: number }
interface Values { pipeline: number; sold: number; billed: number }

interface RepRow {
  name: string; open: number; won: number; lost: number; contracts_sent: number;
  close_rate: number | null; sold_value: number; pipeline_value: number; avg_deal: number | null;
}

interface Analytics {
  totals: Totals
  values: Values
  prev_totals: PrevTotals
  prev_values: Values
  closing_rate: number | null
  prev_closing_rate: number | null
  win_rate: number | null
  funnel: {
    leads: number; contracts_sent: number; signed: number; billed: number;
    lead_to_contract: number | null; contract_to_signed: number | null; signed_to_billed: number | null;
  }
  aging: {
    buckets: { label: string; min: number; max: number | null; count: number; value: number }[]
    stalled_count: number; stalled_value: number; avg_age_days: number | null
  }
  by_status: { status: string; count: number; status_type: number | null }[]
  by_sales_rep: RepRow[]
  by_source: { source: string; count: number }[]
  by_record_type: { type: string; count: number }[]
  trend: { week: string; leads_created: number; signed: number; billed: number }[]
  weekly_billed: { week: string; count: number; amount: number }[]
  recent: { jnid: string; name: string | null; status: string | null; status_type: number | null; value: number | null; date_updated: string | null }[]
  filter: { from: string; to: string }
}

interface JobRow {
  jnid: string; name: string | null; status: string | null; status_type: number | null
  sales_rep: string | null; source: string | null; record_type: string | null
  estimate_value: number | null; invoice_value: number | null
  date_created: string | null; signed_date: string | null; billed_date: string | null
  url: string
}

const RANGE_OPTIONS = [
  { label: '30d', long: '30 days', days: 30 },
  { label: '90d', long: '90 days', days: 90 },
  { label: '6mo', long: '6 months', days: 180 },
  { label: '1yr', long: '1 year', days: 365 },
  { label: 'All', long: 'All time', days: 365 * 5 },
]

const TABS = ['Overview', 'Reps', 'Pipeline'] as const
type Tab = typeof TABS[number]

const fmtPct = (n: number | null) => n === null ? '—' : `${Math.round(n * 100)}%`
const fmtUsd = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtUsdShort = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtWeek = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const statusColor = (st: number | null): string =>
  st === 4 ? 'bg-green-500' : st === 5 ? 'bg-red-500' : 'bg-blue-500'
const statusTextColor = (st: number | null): string =>
  st === 4 ? 'text-green-400' : st === 5 ? 'text-red-400' : 'text-blue-400'

// Smaller-is-better for nothing here yet; default behavior: up=good.
const Delta: React.FC<{ current: number; prev: number; invert?: boolean; mode?: 'pct' | 'abs' }> = ({ current, prev, invert, mode = 'pct' }) => {
  if (prev === 0 && current === 0) return <span className="text-[10px] text-slate-500">flat</span>
  if (prev === 0) {
    return <span className="text-[10px] font-medium text-green-400">new</span>
  }
  const diff = current - prev
  const pct = diff / prev
  const positive = invert ? diff < 0 : diff > 0
  const color = diff === 0 ? 'text-slate-500' : positive ? 'text-green-400' : 'text-red-400'
  const arrow = diff === 0 ? '·' : diff > 0 ? '▲' : '▼'
  const display = mode === 'pct'
    ? `${Math.abs(Math.round(pct * 100))}%`
    : `${Math.abs(diff).toLocaleString()}`
  return <span className={`text-[10px] font-medium ${color}`}>{arrow} {display}</span>
}

const DeltaRate: React.FC<{ current: number | null; prev: number | null }> = ({ current, prev }) => {
  if (current === null || prev === null) return <span className="text-[10px] text-slate-500">—</span>
  const diff = current - prev
  if (Math.abs(diff) < 0.005) return <span className="text-[10px] text-slate-500">flat</span>
  const color = diff > 0 ? 'text-green-400' : 'text-red-400'
  const arrow = diff > 0 ? '▲' : '▼'
  return <span className={`text-[10px] font-medium ${color}`}>{arrow} {Math.abs(diff * 100).toFixed(1)}pp</span>
}

// ─── Reusable bits ────────────────────────────────────────────────────────────

const Tile: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; onClick?: () => void
}> = ({ label, value, sub, color = 'text-white', onClick }) => (
  <div
    className={`bg-slate-800 rounded-xl border border-slate-700 p-3 sm:p-4 ${onClick ? 'cursor-pointer hover:border-blue-500/60 active:bg-slate-700/60 transition-colors' : ''}`}
    onClick={onClick}
  >
    <p className="text-[11px] sm:text-xs text-slate-400 leading-tight">{label}</p>
    <p className={`text-xl sm:text-2xl font-bold mt-1 ${color} tabular-nums`}>{value}</p>
    {sub && <div className="text-[11px] text-slate-500 mt-1 leading-tight">{sub}</div>}
  </div>
)

const BarRow: React.FC<{ label: string; count: number; max: number; color?: string; onClick?: () => void; rightExtra?: string }> = ({ label, count, max, color = 'bg-blue-500', onClick, rightExtra }) => {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className={`flex items-center gap-3 ${onClick ? 'cursor-pointer group active:opacity-70' : ''}`} onClick={onClick}>
      <span className={`text-xs w-28 sm:w-32 truncate flex-shrink-0 ${onClick ? 'text-slate-300 group-hover:text-white' : 'text-slate-300'}`} title={label}>{label}</span>
      <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-12 text-right tabular-nums">{count}</span>
      {rightExtra && <span className="text-[10px] text-slate-500 w-12 text-right tabular-nums hidden sm:inline">{rightExtra}</span>}
    </div>
  )
}

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, subtitle, children, right }) => (
  <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-5">
    <div className="flex items-start justify-between mb-3 md:mb-4 gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
)

// ─── Charts ───────────────────────────────────────────────────────────────────

const TrendChart: React.FC<{ data: { week: string; leads_created: number; signed: number }[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => Math.max(d.leads_created, d.signed)))
  const w = 600, h = 140, pad = 24
  const stepX = (w - 2 * pad) / Math.max(1, data.length - 1)
  const line = (key: 'leads_created' | 'signed') => data.map((d, i) => {
    const x = pad + i * stepX
    const y = h - pad - ((d[key] / max) * (h - 2 * pad))
    return `${x},${y}`
  }).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40" preserveAspectRatio="none">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" strokeWidth="1" />
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={line('leads_created')} />
        <polyline fill="none" stroke="#22c55e" strokeWidth="2" points={line('signed')} />
        {data.map((d, i) => {
          const x = pad + i * stepX
          const yC = h - pad - ((d.leads_created / max) * (h - 2 * pad))
          const yW = h - pad - ((d.signed / max) * (h - 2 * pad))
          return (
            <g key={d.week}>
              <circle cx={x} cy={yC} r="3" fill="#3b82f6" />
              <circle cx={x} cy={yW} r="3" fill="#22c55e" />
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-2">
        <span>{fmtWeek(data[0]?.week || '')}</span>
        <span>{fmtWeek(data[data.length - 1]?.week || '')}</span>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500" /> Leads created</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500" /> Jobs signed</div>
      </div>
    </div>
  )
}

const BilledChart: React.FC<{ data: { week: string; count: number; amount: number }[]; onPick: () => void }> = ({ data, onPick }) => {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-1.5 h-32 sm:h-40">
        {data.map((d) => (
          <div key={d.week} className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer" onClick={onPick} title={`${fmtWeek(d.week)} · ${d.count} billed · ${fmtUsd(d.amount)}`}>
            <span className="text-[9px] text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block">{d.amount > 0 ? fmtUsdShort(d.amount) : ''}</span>
            <div className="w-full bg-emerald-500/80 group-hover:bg-emerald-400 rounded-t transition-all" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }} />
            <span className="text-[9px] text-slate-500 mt-1">{fmtWeek(d.week).split(' ')[1]}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Jobs invoiced per week (last 12 weeks). Tap a bar for details.</p>
    </div>
  )
}

// ─── Funnel ───────────────────────────────────────────────────────────────────

const FunnelView: React.FC<{
  funnel: Analytics['funnel']
  onPick: (dim: string, label: string) => void
}> = ({ funnel, onPick }) => {
  const stages = [
    { key: 'leads',          label: 'New Leads',       count: funnel.leads,          color: 'bg-slate-500',   dim: 'leads' },
    { key: 'contracts_sent', label: 'Contracts Sent',  count: funnel.contracts_sent, color: 'bg-blue-500',    dim: 'contracts_sent' },
    { key: 'signed',         label: 'Signed',          count: funnel.signed,         color: 'bg-green-500',   dim: 'won' },
    { key: 'billed',         label: 'Billed',          count: funnel.billed,         color: 'bg-emerald-500', dim: 'billed' },
  ]
  const max = Math.max(1, ...stages.map((s) => s.count))
  const conv = [
    { label: 'Lead → Contract', rate: funnel.lead_to_contract },
    { label: 'Contract → Signed', rate: funnel.contract_to_signed },
    { label: 'Signed → Billed', rate: funnel.signed_to_billed },
  ]
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100
        return (
          <div key={s.key} className="cursor-pointer group" onClick={() => onPick(s.dim, s.label)}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-slate-300 group-hover:text-white">{i + 1}. {s.label}</span>
              <span className="text-sm font-semibold text-white tabular-nums">{s.count.toLocaleString()}</span>
            </div>
            <div className="bg-slate-700/40 rounded-md h-7 overflow-hidden">
              <div className={`${s.color} h-full rounded-md flex items-center justify-end pr-2 transition-all`} style={{ width: `${Math.max(pct, 4)}%` }}>
                {pct > 25 && <span className="text-[10px] text-white/90 font-medium">{Math.round(pct)}%</span>}
              </div>
            </div>
          </div>
        )
      })}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700">
        {conv.map((c) => (
          <div key={c.label} className="text-center">
            <p className="text-[10px] text-slate-500 leading-tight">{c.label}</p>
            <p className="text-sm font-semibold text-yellow-400 tabular-nums mt-0.5">{fmtPct(c.rate)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Aging ────────────────────────────────────────────────────────────────────

const AgingView: React.FC<{
  aging: Analytics['aging']
  onPick: () => void
}> = ({ aging, onPick }) => {
  const max = Math.max(1, ...aging.buckets.map((b) => b.count))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
          <p className="text-[11px] text-slate-400">Avg age (open)</p>
          <p className="text-xl font-bold text-white tabular-nums mt-0.5">{aging.avg_age_days === null ? '—' : `${Math.round(aging.avg_age_days)}d`}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 cursor-pointer hover:bg-red-500/15" onClick={onPick}>
          <p className="text-[11px] text-red-300">Stalled 30+ days</p>
          <p className="text-xl font-bold text-red-400 tabular-nums mt-0.5">{aging.stalled_count}</p>
          <p className="text-[10px] text-red-300/80 tabular-nums">{fmtUsd(aging.stalled_value)} at risk</p>
        </div>
      </div>
      <div className="space-y-2">
        {aging.buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs w-20 sm:w-24 text-slate-300 flex-shrink-0">{b.label}</span>
            <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${b.min >= 60 ? 'bg-red-500' : b.min >= 30 ? 'bg-orange-500' : 'bg-blue-500'}`}
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 w-10 text-right tabular-nums">{b.count}</span>
            <span className="text-[10px] text-slate-500 w-14 text-right tabular-nums hidden sm:inline">{fmtUsdShort(b.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Drill-down: desktop modal / mobile bottom sheet ──────────────────────────

const DrillSheet: React.FC<{ dimension: string; dkey?: string; label: string; days: number; onClose: () => void }> = ({ dimension, dkey, label, days, onClose }) => {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    getJobNimbusJobsApi(dimension, dkey, days)
      .then((res) => { if (live) setJobs(res.data.jobs || []) })
      .catch((e) => { if (live) setErr(e.response?.data?.error || e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [dimension, dkey, days])

  const showInvoice = dimension === 'billed'

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center items-end justify-center bg-black/60 md:p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 w-full md:max-w-4xl md:max-h-[85vh] max-h-[90vh] flex flex-col md:rounded-xl rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle on mobile */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <span className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-slate-700">
          <div className="min-w-0">
            <h3 className="text-white font-semibold truncate">{label}</h3>
            <p className="text-xs text-slate-500">{loading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white text-2xl leading-none px-2 -mr-2">×</button>
        </div>

        <div className="overflow-auto flex-1">
          {err ? (
            <p className="text-red-400 text-sm p-4">{err}</p>
          ) : loading ? (
            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" /></div>
          ) : jobs.length === 0 ? (
            <p className="text-slate-500 text-sm p-4">No jobs.</p>
          ) : (
            <>
              {/* Mobile: card list */}
              <ul className="md:hidden divide-y divide-slate-800">
                {jobs.map((j) => (
                  <li key={j.jnid} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full mt-1.5 ${statusColor(j.status_type)} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <a href={j.url} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline break-words">{j.name || '(unnamed)'}</a>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px]">
                          <span className={statusTextColor(j.status_type)}>{j.status || '—'}</span>
                          {j.sales_rep && <span className="text-slate-400">{j.sales_rep}</span>}
                          {j.source && <span className="text-slate-500">{j.source}</span>}
                        </div>
                        <div className="flex justify-between items-baseline mt-1.5">
                          <span className="text-[11px] text-slate-500">{fmtDate(showInvoice ? j.billed_date : (j.signed_date || j.date_created))}</span>
                          <span className="text-sm text-white tabular-nums font-medium">{fmtUsd(showInvoice ? j.invoice_value : j.estimate_value)}</span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead className="text-xs text-slate-400 uppercase sticky top-0 bg-slate-900">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Job</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Rep</th>
                    <th className="text-right px-3 py-2 font-medium">{showInvoice ? 'Invoiced' : 'Estimate'}</th>
                    <th className="text-right px-3 py-2 font-medium">{showInvoice ? 'Billed' : 'Updated'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {jobs.map((j) => (
                    <tr key={j.jnid} className="hover:bg-slate-800/50">
                      <td className="px-3 py-2">
                        <a href={j.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{j.name || '(unnamed)'}</a>
                        {(j.source || j.record_type) && <span className="block text-[11px] text-slate-500">{[j.record_type, j.source].filter(Boolean).join(' · ')}</span>}
                      </td>
                      <td className="px-3 py-2"><span className={`text-xs ${statusTextColor(j.status_type)}`}>{j.status || '—'}</span></td>
                      <td className="px-3 py-2 text-slate-300 text-xs">{j.sales_rep || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmtUsd(showInvoice ? j.invoice_value : j.estimate_value)}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">{fmtDate(showInvoice ? j.billed_date : (j.signed_date || j.date_created))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Rep deep-dive table ──────────────────────────────────────────────────────

const RepTable: React.FC<{ reps: RepRow[]; onPick: (rep: RepRow) => void }> = ({ reps, onPick }) => {
  const [sort, setSort] = useState<keyof RepRow>('sold_value')
  const sorted = useMemo(() => {
    const v = (r: RepRow) => {
      const x = r[sort]
      return typeof x === 'number' ? x : x === null ? -Infinity : 0
    }
    return [...reps].sort((a, b) => v(b) - v(a))
  }, [reps, sort])

  if (reps.length === 0) return <p className="text-sm text-slate-500">No sales rep data.</p>

  const Th: React.FC<{ k: keyof RepRow; label: string; align?: 'left' | 'right' }> = ({ k, label, align = 'right' }) => (
    <th
      onClick={() => setSort(k)}
      className={`text-${align} pb-2 px-1 font-medium cursor-pointer hover:text-white ${sort === k ? 'text-white' : ''}`}
    >
      {label}{sort === k ? ' ↓' : ''}
    </th>
  )

  return (
    <>
      {/* Mobile: card list (rep cards) */}
      <ul className="md:hidden space-y-2">
        {sorted.map((r) => (
          <li
            key={r.name}
            onClick={() => onPick(r)}
            className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 active:bg-slate-700/40 cursor-pointer"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-white truncate">{r.name}</span>
              <span className="text-sm text-slate-300 tabular-nums">{fmtUsd(r.sold_value)}</span>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-2 text-center">
              <div><p className="text-[10px] text-slate-500">Open</p><p className="text-xs text-blue-400 tabular-nums">{r.open}</p></div>
              <div><p className="text-[10px] text-slate-500">Signed</p><p className="text-xs text-green-400 tabular-nums">{r.won}</p></div>
              <div><p className="text-[10px] text-slate-500">Sent</p><p className="text-xs text-slate-300 tabular-nums">{r.contracts_sent}</p></div>
              <div><p className="text-[10px] text-slate-500">Close</p><p className="text-xs text-yellow-400 tabular-nums">{fmtPct(r.close_rate)}</p></div>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-slate-500">
              <span>Pipeline {fmtUsdShort(r.pipeline_value)}</span>
              <span>Avg {fmtUsdShort(r.avg_deal || 0)}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: full table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400 uppercase">
            <tr>
              <Th k="name" label="Rep" align="left" />
              <Th k="open" label="Open" />
              <Th k="contracts_sent" label="Sent" />
              <Th k="won" label="Signed" />
              <Th k="close_rate" label="Close %" />
              <Th k="avg_deal" label="Avg Deal" />
              <Th k="pipeline_value" label="Pipeline $" />
              <Th k="sold_value" label="$ Sold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {sorted.map((r) => (
              <tr key={r.name} className="cursor-pointer hover:bg-slate-700/30" onClick={() => onPick(r)}>
                <td className="py-2 px-1 text-white font-medium">{r.name}</td>
                <td className="py-2 px-1 text-right text-blue-400 tabular-nums">{r.open}</td>
                <td className="py-2 px-1 text-right text-slate-300 tabular-nums">{r.contracts_sent}</td>
                <td className="py-2 px-1 text-right text-green-400 tabular-nums">{r.won}</td>
                <td className="py-2 px-1 text-right text-yellow-400 tabular-nums font-medium">{fmtPct(r.close_rate)}</td>
                <td className="py-2 px-1 text-right text-slate-300 tabular-nums">{r.avg_deal ? fmtUsdShort(r.avg_deal) : '—'}</td>
                <td className="py-2 px-1 text-right text-slate-300 tabular-nums">{fmtUsdShort(r.pipeline_value)}</td>
                <td className="py-2 px-1 text-right text-white tabular-nums">{fmtUsd(r.sold_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Tabs nav ─────────────────────────────────────────────────────────────────

const TabsNav: React.FC<{ tab: Tab; onTab: (t: Tab) => void }> = ({ tab, onTab }) => (
  <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 w-full sm:w-auto">
    {TABS.map((t) => (
      <button
        key={t}
        onClick={() => onTab(t)}
        className={`flex-1 sm:flex-none text-xs sm:text-sm font-medium px-3 sm:px-4 py-1.5 rounded-md transition-colors ${
          tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        {t}
      </button>
    ))}
  </div>
)

const RangePicker: React.FC<{ days: number; onDays: (d: number) => void }> = ({ days, onDays }) => (
  <div className="flex items-center gap-0.5 bg-slate-800 border border-slate-700 rounded-lg p-1 overflow-x-auto no-scrollbar">
    {RANGE_OPTIONS.map((opt) => (
      <button
        key={opt.days}
        onClick={() => onDays(opt.days)}
        title={opt.long}
        className={`text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-md transition-colors flex-shrink-0 ${
          days === opt.days ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        <span className="sm:hidden">{opt.label}</span>
        <span className="hidden sm:inline">{opt.long}</span>
      </button>
    ))}
  </div>
)

// ─── Main page ────────────────────────────────────────────────────────────────

const JobNimbusDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(90)
  const [tab, setTab] = useState<Tab>('Overview')
  const [drill, setDrill] = useState<{ dimension: string; key?: string; label: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getJobNimbusAnalyticsApi(days)
      setAnalytics(res.data)
    } catch (e: any) {
      if (e.response?.status === 503) {
        setError('JobNimbus is not configured. Go to Integrations to set the API key.')
      } else {
        setError(e.response?.data?.error || e.message)
      }
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading && !analytics) {
    return (
      <>
        <Header title="JobNimbus Dashboard" />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Header title="JobNimbus Dashboard" />
        <div className="p-4 md:p-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
        </div>
      </>
    )
  }

  if (!analytics) return null

  const maxStatus = Math.max(1, ...analytics.by_status.map((s) => s.count))
  const maxSource = Math.max(1, ...analytics.by_source.map((s) => s.count))
  const maxType = Math.max(1, ...analytics.by_record_type.map((t) => t.count))

  const t = analytics.totals
  const p = analytics.prev_totals
  const v = analytics.values
  const pv = analytics.prev_values

  return (
    <>
      <Header title="JobNimbus Dashboard" actions={<RangePicker days={days} onDays={setDays} />} />

      {/* Sticky tab bar */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 md:px-6 py-2.5">
        <TabsNav tab={tab} onTab={setTab} />
      </div>

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">

        {/* ── Overview tab ─────────────────────────────────────────────── */}
        {tab === 'Overview' && (
          <>
            {/* Count tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              <Tile
                label="New Leads"
                value={t.leads}
                sub={<Delta current={t.leads} prev={p.leads} />}
                color="text-slate-200"
                onClick={() => setDrill({ dimension: 'leads', label: 'New Leads' })}
              />
              <Tile
                label="Open Pipeline"
                value={t.open}
                sub={<span className="text-slate-500">{fmtUsd(v.pipeline)}</span>}
                color="text-blue-400"
                onClick={() => setDrill({ dimension: 'open', label: 'Open Pipeline' })}
              />
              <Tile
                label="Signed"
                value={t.won}
                sub={<Delta current={t.won} prev={p.won} />}
                color="text-green-400"
                onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })}
              />
              <Tile
                label="Lost"
                value={t.lost}
                sub={<Delta current={t.lost} prev={p.lost} invert />}
                color="text-red-400"
                onClick={() => setDrill({ dimension: 'lost', label: 'Lost Jobs' })}
              />
              <Tile
                label="Closing Rate"
                value={fmtPct(analytics.closing_rate)}
                sub={<DeltaRate current={analytics.closing_rate} prev={analytics.prev_closing_rate} />}
                color="text-yellow-400"
                onClick={() => setDrill({ dimension: 'contracts_sent', label: 'Contracts Sent' })}
              />
            </div>

            {/* Value tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              <Tile
                label="Pipeline Value"
                value={fmtUsd(v.pipeline)}
                sub={<span className="text-slate-500">Open estimates</span>}
                color="text-blue-400"
                onClick={() => setDrill({ dimension: 'open', label: 'Open Pipeline' })}
              />
              <Tile
                label="$ Sold"
                value={fmtUsd(v.sold)}
                sub={<Delta current={v.sold} prev={pv.sold} />}
                color="text-green-400"
                onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })}
              />
              <Tile
                label="$ Billed"
                value={fmtUsd(v.billed)}
                sub={<Delta current={v.billed} prev={pv.billed} />}
                color="text-emerald-400"
                onClick={() => setDrill({ dimension: 'billed', label: 'Billed Jobs' })}
              />
            </div>

            {/* Funnel */}
            <Section title="Sales Funnel" subtitle="Counts within the selected window">
              <FunnelView funnel={analytics.funnel} onPick={(dim, label) => setDrill({ dimension: dim, label })} />
            </Section>

            {/* Trend */}
            <Section title="Leads vs. Signed" subtitle="Last 12 weeks">
              <TrendChart data={analytics.trend} />
            </Section>

            {/* Weekly billed */}
            <Section title="Weekly Jobs Billed">
              <BilledChart data={analytics.weekly_billed} onPick={() => setDrill({ dimension: 'billed', label: 'Billed Jobs' })} />
            </Section>

            {/* Recent activity */}
            <Section title="Recent Activity">
              {analytics.recent.length === 0 ? (
                <p className="text-sm text-slate-500">No jobs yet.</p>
              ) : (
                <ul className="divide-y divide-slate-700/50 -mx-4 md:-mx-5">
                  {analytics.recent.map((job) => (
                    <li key={job.jnid} className="px-4 md:px-5 py-3 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${statusColor(job.status_type)} flex-shrink-0`} />
                      <span className="text-sm text-white flex-1 truncate min-w-0">{job.name || '(unnamed)'}</span>
                      {job.value != null && job.value > 0 && <span className="text-xs text-slate-400 tabular-nums hidden sm:inline">{fmtUsd(job.value)}</span>}
                      <span className={`text-xs ${statusTextColor(job.status_type)} hidden sm:inline`}>{job.status || '—'}</span>
                      <span className="text-xs text-slate-500 w-14 sm:w-16 text-right tabular-nums">{fmtDate(job.date_updated)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        {/* ── Reps tab ─────────────────────────────────────────────────── */}
        {tab === 'Reps' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              <Tile label="Reps Active" value={analytics.by_sales_rep.length} color="text-slate-200" />
              <Tile label="Contracts Sent" value={t.contracts_sent} sub={<Delta current={t.contracts_sent} prev={p.contracts_sent} />} color="text-blue-400" onClick={() => setDrill({ dimension: 'contracts_sent', label: 'Contracts Sent' })} />
              <Tile label="Signed" value={t.won} sub={<Delta current={t.won} prev={p.won} />} color="text-green-400" onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })} />
              <Tile label="Avg Close" value={fmtPct(analytics.closing_rate)} sub={<DeltaRate current={analytics.closing_rate} prev={analytics.prev_closing_rate} />} color="text-yellow-400" />
            </div>

            <Section title="Sales Rep Performance" subtitle="Tap a column to sort. Tap a rep to drill in.">
              <RepTable
                reps={analytics.by_sales_rep}
                onPick={(rep) => setDrill({ dimension: 'sales_rep', key: rep.name, label: `Rep: ${rep.name}` })}
              />
            </Section>

            <Section title="Lead Sources">
              {analytics.by_source.length === 0 ? (
                <p className="text-sm text-slate-500">No lead source data.</p>
              ) : (
                <div className="space-y-2.5">
                  {analytics.by_source.map((s) => (
                    <BarRow key={s.source} label={s.source} count={s.count} max={maxSource} color="bg-purple-500" onClick={() => setDrill({ dimension: 'source', key: s.source, label: `Source: ${s.source}` })} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {/* ── Pipeline tab ─────────────────────────────────────────────── */}
        {tab === 'Pipeline' && (
          <>
            <Section title="Open Pipeline Aging" subtitle="Days since last update, currently-open jobs only">
              <AgingView aging={analytics.aging} onPick={() => setDrill({ dimension: 'open', label: 'Open Pipeline (stalled)' })} />
            </Section>

            <Section title="Jobs by Status">
              {analytics.by_status.length === 0 ? (
                <p className="text-sm text-slate-500">No status data.</p>
              ) : (
                <div className="space-y-2.5">
                  {analytics.by_status.map((s) => (
                    <BarRow
                      key={s.status}
                      label={s.status}
                      count={s.count}
                      max={maxStatus}
                      color={s.status_type === 4 ? 'bg-green-500' : s.status_type === 5 ? 'bg-red-500' : 'bg-blue-500'}
                      onClick={() => setDrill({ dimension: 'status', key: s.status, label: `Status: ${s.status}` })}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Job Types">
              {analytics.by_record_type.length === 0 ? (
                <p className="text-sm text-slate-500">No job type data.</p>
              ) : (
                <div className="space-y-2.5">
                  {analytics.by_record_type.map((rt) => (
                    <BarRow key={rt.type} label={rt.type} count={rt.count} max={maxType} color="bg-orange-500" onClick={() => setDrill({ dimension: 'record_type', key: rt.type, label: `Type: ${rt.type}` })} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

      </div>

      {drill && (
        <DrillSheet
          dimension={drill.dimension}
          dkey={drill.key}
          label={drill.label}
          days={days}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  )
}

export default JobNimbusDashboard

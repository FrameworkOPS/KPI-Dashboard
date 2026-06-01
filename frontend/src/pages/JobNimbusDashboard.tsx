import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/Header'
import PeriodPicker, { Period, PeriodKey, periodFromKey, PRESETS } from '../components/PeriodPicker'
import {
  getJobNimbusAnalyticsApi, getJobNimbusJobsApi,
  setJobNimbusTargetsApi, buildJobNimbusJobsCsvUrl,
} from '../services/api'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Totals { all: number; open: number; won: number; lost: number; leads: number; contracts_sent: number; billed: number }
interface PrevTotals { open: number; won: number; lost: number; leads: number; contracts_sent: number; billed: number }
interface Values { pipeline: number; sold: number; billed: number }

interface RepRow {
  name: string; open: number; won: number; lost: number; contracts_sent: number;
  close_rate: number | null; sold_value: number; pipeline_value: number; avg_deal: number | null;
}

interface Funnel {
  leads: number; contracts_sent: number; signed: number; billed: number;
  lead_to_contract: number | null; contract_to_signed: number | null; signed_to_billed: number | null;
}

interface Targets {
  weekly_sold: number | null; monthly_sold: number | null;
  weekly_billed: number | null; monthly_billed: number | null;
}

interface Analytics {
  totals: Totals
  values: Values
  prev_totals: PrevTotals
  prev_values: Values
  closing_rate: number | null
  prev_closing_rate: number | null
  win_rate: number | null
  funnel: Funnel
  prev_funnel: Funnel
  aging: {
    buckets: { label: string; min: number; max: number | null; count: number; value: number }[]
    stalled_count: number; stalled_value: number; avg_age_days: number | null
  }
  top_open_deals: {
    jnid: string; name: string | null; status: string | null; sales_rep: string | null;
    source: string | null; estimate_value: number; age_days: number; url: string;
  }[]
  by_status: { status: string; count: number; status_type: number | null }[]
  by_sales_rep: RepRow[]
  by_source: { source: string; count: number }[]
  by_record_type: { type: string; count: number }[]
  trend: { week: string; leads_created: number; signed: number; billed: number }[]
  weekly_billed: { week: string; count: number; amount: number }[]
  recent: { jnid: string; name: string | null; status: string | null; status_type: number | null; value: number | null; date_updated: string | null }[]
  targets: Targets
  progress: { wtd_sold: number; mtd_sold: number; wtd_billed: number; mtd_billed: number; week_start: string; month_start: string }
  filter: { from: string; to: string; compare_from: string; compare_to: string; rep: string | null; source: string | null; record_type: string | null }
  available_filters: { reps: string[]; sources: string[]; record_types: string[] }
}

interface JobRow {
  jnid: string; name: string | null; status: string | null; status_type: number | null
  sales_rep: string | null; source: string | null; record_type: string | null
  estimate_value: number | null; invoice_value: number | null
  date_created: string | null; signed_date: string | null; billed_date: string | null
  url: string
}

const TABS = ['Overview', 'Reps', 'Pipeline'] as const
type Tab = typeof TABS[number]

// ─── Formatters ───────────────────────────────────────────────────────────────

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
const isoDate = (d: Date) => d.toISOString().slice(0, 10)

const statusColor = (st: number | null): string =>
  st === 4 ? 'bg-green-500' : st === 5 ? 'bg-red-500' : 'bg-blue-500'
const statusTextColor = (st: number | null): string =>
  st === 4 ? 'text-green-400' : st === 5 ? 'text-red-400' : 'text-blue-400'

// ─── Delta indicators ─────────────────────────────────────────────────────────

const Delta: React.FC<{ current: number; prev: number; invert?: boolean }> = ({ current, prev, invert }) => {
  if (prev === 0 && current === 0) return <span className="text-[10px] text-slate-500">flat</span>
  if (prev === 0) return <span className="text-[10px] font-medium text-green-400">new</span>
  const diff = current - prev
  const pct = diff / prev
  const positive = invert ? diff < 0 : diff > 0
  const color = diff === 0 ? 'text-slate-500' : positive ? 'text-green-400' : 'text-red-400'
  const arrow = diff === 0 ? '·' : diff > 0 ? '▲' : '▼'
  return <span className={`text-[10px] font-medium ${color}`}>{arrow} {Math.abs(Math.round(pct * 100))}%</span>
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
  compareValue?: React.ReactNode; compareLabel?: string
}> = ({ label, value, sub, color = 'text-white', onClick, compareValue, compareLabel }) => (
  <div
    className={`bg-slate-800 rounded-xl border border-slate-700 p-3 sm:p-4 ${onClick ? 'cursor-pointer hover:border-blue-500/60 active:bg-slate-700/60 transition-colors' : ''}`}
    onClick={onClick}
  >
    <p className="text-[11px] sm:text-xs text-slate-400 leading-tight">{label}</p>
    <p className={`text-xl sm:text-2xl font-bold mt-1 ${color} tabular-nums`}>{value}</p>
    {compareValue !== undefined && (
      <div className="mt-1.5 pt-1.5 border-t border-slate-700/60">
        <p className="text-[10px] text-purple-300 leading-tight">{compareLabel || 'vs'}</p>
        <p className="text-sm font-semibold text-purple-200 tabular-nums">{compareValue}</p>
      </div>
    )}
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

// ─── Funnel — with optional side-by-side compare ──────────────────────────────

const FunnelView: React.FC<{
  funnel: Funnel
  compareFunnel?: Funnel | null
  compareLabel?: string
  onPick: (dim: string, label: string) => void
}> = ({ funnel, compareFunnel, compareLabel, onPick }) => {
  const stages = [
    { key: 'leads',          label: 'New Leads',       count: funnel.leads,          prev: compareFunnel?.leads ?? 0,          color: 'bg-slate-500',   dim: 'leads' },
    { key: 'contracts_sent', label: 'Contracts Sent',  count: funnel.contracts_sent, prev: compareFunnel?.contracts_sent ?? 0, color: 'bg-blue-500',    dim: 'contracts_sent' },
    { key: 'signed',         label: 'Signed',          count: funnel.signed,         prev: compareFunnel?.signed ?? 0,         color: 'bg-green-500',   dim: 'won' },
    { key: 'billed',         label: 'Billed',          count: funnel.billed,         prev: compareFunnel?.billed ?? 0,         color: 'bg-emerald-500', dim: 'billed' },
  ]
  const max = Math.max(1, ...stages.flatMap((s) => compareFunnel ? [s.count, s.prev] : [s.count]))
  const conv = [
    { label: 'Lead → Contract', rate: funnel.lead_to_contract,   prev: compareFunnel?.lead_to_contract ?? null },
    { label: 'Contract → Signed', rate: funnel.contract_to_signed, prev: compareFunnel?.contract_to_signed ?? null },
    { label: 'Signed → Billed', rate: funnel.signed_to_billed,   prev: compareFunnel?.signed_to_billed ?? null },
  ]
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100
        const prevPct = compareFunnel ? (s.prev / max) * 100 : 0
        return (
          <div key={s.key} className="cursor-pointer group" onClick={() => onPick(s.dim, s.label)}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-slate-300 group-hover:text-white">{i + 1}. {s.label}</span>
              <span className="text-sm font-semibold text-white tabular-nums">
                {s.count.toLocaleString()}{compareFunnel && <span className="text-purple-300 text-xs font-normal ml-2">vs {s.prev.toLocaleString()}</span>}
              </span>
            </div>
            <div className="bg-slate-700/40 rounded-md h-7 overflow-hidden relative">
              <div className={`${s.color} h-full rounded-md flex items-center justify-end pr-2 transition-all`} style={{ width: `${Math.max(pct, 4)}%` }}>
                {pct > 25 && <span className="text-[10px] text-white/90 font-medium">{Math.round(pct)}%</span>}
              </div>
            </div>
            {compareFunnel && (
              <div className="bg-slate-700/30 rounded-md h-4 overflow-hidden mt-1">
                <div className="bg-purple-500/70 h-full rounded-md" style={{ width: `${Math.max(prevPct, 2)}%` }} />
              </div>
            )}
          </div>
        )
      })}
      <div className={`grid ${compareFunnel ? 'grid-cols-3 gap-2' : 'grid-cols-3 gap-2'} pt-2 border-t border-slate-700`}>
        {conv.map((c) => (
          <div key={c.label} className="text-center">
            <p className="text-[10px] text-slate-500 leading-tight">{c.label}</p>
            <p className="text-sm font-semibold text-yellow-400 tabular-nums mt-0.5">{fmtPct(c.rate)}</p>
            {compareFunnel && <p className="text-[10px] text-purple-300 tabular-nums">{compareLabel || 'vs'}: {fmtPct(c.prev)}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Aging ────────────────────────────────────────────────────────────────────

const AgingView: React.FC<{ aging: Analytics['aging']; onPick: () => void }> = ({ aging, onPick }) => {
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

// ─── Top open deals ───────────────────────────────────────────────────────────

const TopDeals: React.FC<{ deals: Analytics['top_open_deals'] }> = ({ deals }) => {
  if (deals.length === 0) return <p className="text-sm text-slate-500">No open deals.</p>
  return (
    <ul className="divide-y divide-slate-700/50 -mx-4 md:-mx-5">
      {deals.map((d, i) => (
        <li key={d.jnid} className="px-4 md:px-5 py-2.5 flex items-center gap-3">
          <span className="text-xs text-slate-500 w-5 tabular-nums">{i + 1}.</span>
          <div className="flex-1 min-w-0">
            <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline truncate block">{d.name || '(unnamed)'}</a>
            <p className="text-[11px] text-slate-500 truncate">
              {[d.sales_rep, d.status, d.source].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white tabular-nums">{fmtUsdShort(d.estimate_value)}</p>
            <p className={`text-[10px] tabular-nums ${d.age_days >= 60 ? 'text-red-400' : d.age_days >= 30 ? 'text-orange-400' : 'text-slate-500'}`}>{d.age_days}d old</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ─── Targets card ─────────────────────────────────────────────────────────────

const TargetsCard: React.FC<{
  targets: Targets
  progress: Analytics['progress']
  canEdit: boolean
  onSave: (t: Partial<Targets>) => Promise<void>
}> = ({ targets, progress, canEdit, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [weeklySold, setWeeklySold] = useState(targets.weekly_sold?.toString() ?? '')
  const [monthlySold, setMonthlySold] = useState(targets.monthly_sold?.toString() ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setWeeklySold(targets.weekly_sold?.toString() ?? '')
    setMonthlySold(targets.monthly_sold?.toString() ?? '')
  }, [targets])

  const save = async () => {
    setBusy(true)
    try {
      await onSave({
        weekly_sold: weeklySold === '' ? null : Number(weeklySold),
        monthly_sold: monthlySold === '' ? null : Number(monthlySold),
      })
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const Bar: React.FC<{ label: string; actual: number; target: number | null }> = ({ label, actual, target }) => {
    if (!target || target <= 0) {
      return (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">{label}</span>
            <span className="text-slate-300 tabular-nums">{fmtUsd(actual)}</span>
          </div>
          <p className="text-[10px] text-slate-500">No target set</p>
        </div>
      )
    }
    const pct = Math.min(1.5, actual / target)
    const onPace = pct >= 0.85
    return (
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">{label}</span>
          <span className="text-slate-300 tabular-nums">{fmtUsdShort(actual)} / {fmtUsdShort(target)}</span>
        </div>
        <div className="bg-slate-700/50 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full ${onPace ? 'bg-green-500' : pct >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
        <p className={`text-[10px] mt-0.5 tabular-nums ${onPace ? 'text-green-400' : 'text-slate-500'}`}>
          {Math.round(pct * 100)}%{pct >= 1 ? ' — hit!' : onPace ? ' — on pace' : ' — behind'}
        </p>
      </div>
    )
  }

  return (
    <Section
      title="Targets & Progress"
      subtitle="$ Signed, current week & month"
      right={canEdit && !editing && (
        <button onClick={() => setEditing(true)} className="text-[11px] text-slate-400 hover:text-white">Edit</button>
      )}
    >
      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Bar label="This week" actual={progress.wtd_sold} target={targets.weekly_sold} />
          <Bar label="This month" actual={progress.mtd_sold} target={targets.monthly_sold} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-slate-400">Weekly $ target</span>
              <input
                type="number" value={weeklySold} onChange={(e) => setWeeklySold(e.target.value)}
                placeholder="e.g. 25000"
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-md text-sm px-2 py-1.5 text-white"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Monthly $ target</span>
              <input
                type="number" value={monthlySold} onChange={(e) => setMonthlySold(e.target.value)}
                placeholder="e.g. 100000"
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-md text-sm px-2 py-1.5 text-white"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className="text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md px-3 py-1.5 disabled:opacity-50">Save</button>
            <button disabled={busy} onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterState { rep: string | null; source: string | null; recordType: string | null }

const FilterBar: React.FC<{
  filters: FilterState
  available: { reps: string[]; sources: string[]; record_types: string[] }
  onChange: (f: FilterState) => void
}> = ({ filters, available, onChange }) => {
  const has = filters.rep || filters.source || filters.recordType
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      <FilterChip label="Rep" value={filters.rep} options={available.reps} onChange={(v) => onChange({ ...filters, rep: v })} />
      <FilterChip label="Source" value={filters.source} options={available.sources} onChange={(v) => onChange({ ...filters, source: v })} />
      <FilterChip label="Type" value={filters.recordType} options={available.record_types} onChange={(v) => onChange({ ...filters, recordType: v })} />
      {has && (
        <button
          onClick={() => onChange({ rep: null, source: null, recordType: null })}
          className="text-[11px] text-slate-400 hover:text-white px-2 py-1 flex-shrink-0"
        >
          Clear
        </button>
      )}
    </div>
  )
}

const FilterChip: React.FC<{
  label: string; value: string | null; options: string[]; onChange: (v: string | null) => void
}> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative inline-block flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
          value
            ? 'bg-blue-500/15 border-blue-500/50 text-blue-200'
            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
        }`}
      >
        <span className="text-slate-500">{label}:</span> {value || 'All'}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 max-h-64 overflow-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            className={`w-full text-left text-xs px-3 py-2 hover:bg-slate-800 ${!value ? 'text-blue-400' : 'text-slate-300'}`}
          >
            All
          </button>
          {options.map((o) => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false) }}
              className={`w-full text-left text-xs px-3 py-2 hover:bg-slate-800 truncate ${value === o ? 'text-blue-400' : 'text-slate-300'}`}
            >
              {o}
            </button>
          ))}
          {options.length === 0 && <p className="text-[11px] text-slate-500 px-3 py-2">None.</p>}
        </div>
      )}
    </div>
  )
}

// ─── Rep compare grid ─────────────────────────────────────────────────────────

const RepCompare: React.FC<{ reps: RepRow[]; selected: string[]; onChange: (s: string[]) => void; onPick: (r: RepRow) => void }> = ({ reps, selected, onChange, onPick }) => {
  const picked = reps.filter((r) => selected.includes(r.name))
  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name].slice(0, 4))
  }
  const metrics: { key: keyof RepRow; label: string; fmt: (v: any) => string; color?: string }[] = [
    { key: 'won',            label: 'Signed',         fmt: (v) => String(v ?? 0),                       color: 'text-green-400' },
    { key: 'sold_value',     label: '$ Sold',         fmt: (v) => fmtUsd(v ?? 0),                       color: 'text-white' },
    { key: 'close_rate',     label: 'Close %',        fmt: (v) => fmtPct(v ?? null),                    color: 'text-yellow-400' },
    { key: 'avg_deal',       label: 'Avg Deal',       fmt: (v) => v ? fmtUsdShort(v) : '—',             color: 'text-slate-200' },
    { key: 'contracts_sent', label: 'Contracts Sent', fmt: (v) => String(v ?? 0),                       color: 'text-blue-300' },
    { key: 'open',           label: 'Open',           fmt: (v) => String(v ?? 0),                       color: 'text-blue-400' },
    { key: 'pipeline_value', label: 'Pipeline $',     fmt: (v) => fmtUsdShort(v ?? 0),                  color: 'text-slate-200' },
  ]
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {reps.map((r) => (
          <button
            key={r.name}
            onClick={() => toggle(r.name)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              selected.includes(r.name)
                ? 'bg-blue-500/20 border-blue-500/60 text-blue-200'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mb-2">{selected.length === 0 ? 'Pick up to 4 reps to compare.' : `${selected.length}/4 selected`}</p>
      {picked.length > 0 && (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="text-[11px] text-slate-500 uppercase">
              <tr>
                <th className="text-left px-2 py-1 font-medium">Metric</th>
                {picked.map((r) => (
                  <th key={r.name} className="text-right px-2 py-1 font-medium text-white">
                    <button onClick={() => onPick(r)} className="hover:underline">{r.name}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {metrics.map((m) => (
                <tr key={String(m.key)}>
                  <td className="px-2 py-1.5 text-slate-400 text-xs">{m.label}</td>
                  {picked.map((r) => (
                    <td key={r.name} className={`px-2 py-1.5 text-right tabular-nums ${m.color || 'text-white'}`}>{m.fmt(r[m.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Drill-down sheet (now with CSV export) ───────────────────────────────────

const DrillSheet: React.FC<{
  dimension: string; dkey?: string; label: string
  period: Period
  filters: FilterState
  onClose: () => void
}> = ({ dimension, dkey, label, period, filters, onClose }) => {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const params = useMemo(() => ({
    dimension, key: dkey,
    from: period.from.toISOString(), to: period.to.toISOString(),
    rep: filters.rep, source: filters.source, record_type: filters.recordType,
  }), [dimension, dkey, period.from, period.to, filters.rep, filters.source, filters.recordType])

  useEffect(() => {
    let live = true
    setLoading(true)
    getJobNimbusJobsApi(params)
      .then((res) => { if (live) setJobs(res.data.jobs || []) })
      .catch((e) => { if (live) setErr(e.response?.data?.error || e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [params])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const showInvoice = dimension === 'billed'

  const downloadCsv = async () => {
    const url = buildJobNimbusJobsCsvUrl(params)
    const token = localStorage.getItem('token')
    const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!resp.ok) return
    const blob = await resp.blob()
    const a = document.createElement('a')
    const objUrl = URL.createObjectURL(blob)
    a.href = objUrl
    a.download = (resp.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/)?.[1] || 'jobnimbus.csv'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(objUrl)
  }

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center items-end justify-center bg-black/60 md:p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 w-full md:max-w-4xl md:max-h-[85vh] max-h-[90vh] flex flex-col md:rounded-xl rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <span className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-slate-700 gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-white font-semibold truncate">{label}</h3>
            <p className="text-xs text-slate-500">{loading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}</p>
          </div>
          {jobs.length > 0 && (
            <button onClick={downloadCsv} className="text-xs font-medium bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-md px-3 py-1.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              CSV
            </button>
          )}
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
      <ul className="md:hidden space-y-2">
        {sorted.map((r) => (
          <li key={r.name} onClick={() => onPick(r)} className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 active:bg-slate-700/40 cursor-pointer">
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

// ─── Tab nav ──────────────────────────────────────────────────────────────────

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

// ─── URL state encoding / decoding ────────────────────────────────────────────

const PRESET_KEYS = new Set(PRESETS.map((p) => p.key))

function periodFromParams(prefix: string, params: URLSearchParams, fallbackKey: PeriodKey): Period {
  const key = (params.get(prefix) || fallbackKey) as PeriodKey
  if (key === 'custom') {
    const from = params.get(`${prefix}_from`)
    const to = params.get(`${prefix}_to`)
    return periodFromKey('custom', from ? new Date(from) : undefined, to ? new Date(to) : undefined)
  }
  if (PRESET_KEYS.has(key)) return periodFromKey(key)
  return periodFromKey(fallbackKey)
}

function applyPeriodToParams(prefix: string, params: URLSearchParams, p: Period | null) {
  if (!p) {
    params.delete(prefix); params.delete(`${prefix}_from`); params.delete(`${prefix}_to`); return
  }
  params.set(prefix, p.key)
  if (p.key === 'custom') {
    params.set(`${prefix}_from`, isoDate(p.from))
    params.set(`${prefix}_to`, isoDate(p.to))
  } else {
    params.delete(`${prefix}_from`); params.delete(`${prefix}_to`)
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

const JobNimbusDashboard: React.FC = () => {
  const [params, setParams] = useSearchParams()

  const [period, setPeriod] = useState<Period>(() => periodFromParams('period', params, 'this_month'))
  const [compare, setCompare] = useState<Period | null>(() => params.has('compare') ? periodFromParams('compare', params, 'last_month') : null)
  const [filters, setFilters] = useState<FilterState>(() => ({
    rep: params.get('rep'), source: params.get('source'), recordType: params.get('type'),
  }))
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') as Tab) || 'Overview')
  const [compareReps, setCompareReps] = useState<string[]>(() => (params.get('cmp_reps') || '').split(',').filter(Boolean))

  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<{ dimension: string; key?: string; label: string } | null>(null)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  // Persist state → URL
  useEffect(() => {
    const next = new URLSearchParams(params)
    applyPeriodToParams('period', next, period)
    applyPeriodToParams('compare', next, compare)
    if (filters.rep) next.set('rep', filters.rep); else next.delete('rep')
    if (filters.source) next.set('source', filters.source); else next.delete('source')
    if (filters.recordType) next.set('type', filters.recordType); else next.delete('type')
    if (tab !== 'Overview') next.set('tab', tab); else next.delete('tab')
    if (compareReps.length) next.set('cmp_reps', compareReps.join(',')); else next.delete('cmp_reps')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, compare, filters, tab, compareReps])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getJobNimbusAnalyticsApi({
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        compare_from: compare?.from.toISOString(),
        compare_to: compare?.to.toISOString(),
        rep: filters.rep, source: filters.source, record_type: filters.recordType,
      })
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
  }, [period.from, period.to, compare, filters])

  useEffect(() => { load() }, [load])

  const saveTargets = async (t: Partial<Targets>) => {
    await setJobNimbusTargetsApi(t)
    await load()
  }

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
  const cmpOn = !!compare
  const cmpLabel = compare?.label

  return (
    <>
      <Header
        title="JobNimbus Dashboard"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodPicker period={period} onChange={setPeriod} />
            {compare ? (
              <div className="flex items-center gap-1">
                <PeriodPicker period={compare} onChange={setCompare} label="vs" variant="compare" />
                <button onClick={() => setCompare(null)} className="text-slate-400 hover:text-white text-lg px-1" aria-label="Stop comparing">×</button>
              </div>
            ) : (
              <button
                onClick={() => setCompare(periodFromKey(period.key === 'this_month' ? 'last_month' : period.key === 'this_week' ? 'last_week' : period.key === 'this_quarter' ? 'last_quarter' : period.key === 'this_year' ? 'last_year' : 'last_month'))}
                className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300"
              >
                Compare to…
              </button>
            )}
          </div>
        }
      />

      {/* Sticky tab + filter bar */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 md:px-6 py-2.5 space-y-2">
        <TabsNav tab={tab} onTab={setTab} />
        <FilterBar
          filters={filters}
          available={analytics.available_filters}
          onChange={setFilters}
        />
      </div>

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">

        {tab === 'Overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              <Tile
                label="New Leads" value={t.leads} color="text-slate-200"
                sub={!cmpOn && <Delta current={t.leads} prev={p.leads} />}
                compareValue={cmpOn ? p.leads.toLocaleString() : undefined}
                compareLabel={cmpLabel}
                onClick={() => setDrill({ dimension: 'leads', label: 'New Leads' })}
              />
              <Tile
                label="Open Pipeline" value={t.open} color="text-blue-400"
                sub={<span className="text-slate-500">{fmtUsd(v.pipeline)}</span>}
                onClick={() => setDrill({ dimension: 'open', label: 'Open Pipeline' })}
              />
              <Tile
                label="Signed" value={t.won} color="text-green-400"
                sub={!cmpOn && <Delta current={t.won} prev={p.won} />}
                compareValue={cmpOn ? p.won.toLocaleString() : undefined}
                compareLabel={cmpLabel}
                onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })}
              />
              <Tile
                label="Lost" value={t.lost} color="text-red-400"
                sub={!cmpOn && <Delta current={t.lost} prev={p.lost} invert />}
                compareValue={cmpOn ? p.lost.toLocaleString() : undefined}
                compareLabel={cmpLabel}
                onClick={() => setDrill({ dimension: 'lost', label: 'Lost Jobs' })}
              />
              <Tile
                label="Closing Rate" value={fmtPct(analytics.closing_rate)} color="text-yellow-400"
                sub={!cmpOn && <DeltaRate current={analytics.closing_rate} prev={analytics.prev_closing_rate} />}
                compareValue={cmpOn ? fmtPct(analytics.prev_closing_rate) : undefined}
                compareLabel={cmpLabel}
                onClick={() => setDrill({ dimension: 'contracts_sent', label: 'Contracts Sent' })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              <Tile
                label="Pipeline Value" value={fmtUsd(v.pipeline)} color="text-blue-400"
                sub={<span className="text-slate-500">Open estimates</span>}
                onClick={() => setDrill({ dimension: 'open', label: 'Open Pipeline' })}
              />
              <Tile
                label="$ Sold" value={fmtUsd(v.sold)} color="text-green-400"
                sub={!cmpOn && <Delta current={v.sold} prev={pv.sold} />}
                compareValue={cmpOn ? fmtUsd(pv.sold) : undefined}
                compareLabel={cmpLabel}
                onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })}
              />
              <Tile
                label="$ Billed" value={fmtUsd(v.billed)} color="text-emerald-400"
                sub={!cmpOn && <Delta current={v.billed} prev={pv.billed} />}
                compareValue={cmpOn ? fmtUsd(pv.billed) : undefined}
                compareLabel={cmpLabel}
                onClick={() => setDrill({ dimension: 'billed', label: 'Billed Jobs' })}
              />
            </div>

            <TargetsCard targets={analytics.targets} progress={analytics.progress} canEdit={isAdmin} onSave={saveTargets} />

            <Section title="Sales Funnel" subtitle={cmpOn ? `${period.label} vs ${compare?.label}` : period.label}>
              <FunnelView funnel={analytics.funnel} compareFunnel={cmpOn ? analytics.prev_funnel : null} compareLabel={cmpLabel} onPick={(dim, label) => setDrill({ dimension: dim, label })} />
            </Section>

            <Section title="Leads vs. Signed" subtitle="Last 12 weeks">
              <TrendChart data={analytics.trend} />
            </Section>

            <Section title="Weekly Jobs Billed">
              <BilledChart data={analytics.weekly_billed} onPick={() => setDrill({ dimension: 'billed', label: 'Billed Jobs' })} />
            </Section>

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

        {tab === 'Reps' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              <Tile label="Reps Active" value={analytics.by_sales_rep.length} color="text-slate-200" />
              <Tile label="Contracts Sent" value={t.contracts_sent}
                sub={!cmpOn && <Delta current={t.contracts_sent} prev={p.contracts_sent} />}
                compareValue={cmpOn ? p.contracts_sent.toLocaleString() : undefined} compareLabel={cmpLabel}
                color="text-blue-400"
                onClick={() => setDrill({ dimension: 'contracts_sent', label: 'Contracts Sent' })} />
              <Tile label="Signed" value={t.won}
                sub={!cmpOn && <Delta current={t.won} prev={p.won} />}
                compareValue={cmpOn ? p.won.toLocaleString() : undefined} compareLabel={cmpLabel}
                color="text-green-400"
                onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })} />
              <Tile label="Avg Close" value={fmtPct(analytics.closing_rate)}
                sub={!cmpOn && <DeltaRate current={analytics.closing_rate} prev={analytics.prev_closing_rate} />}
                compareValue={cmpOn ? fmtPct(analytics.prev_closing_rate) : undefined} compareLabel={cmpLabel}
                color="text-yellow-400" />
            </div>

            <Section title="Compare Reps" subtitle="Side-by-side metrics for up to 4 reps">
              <RepCompare
                reps={analytics.by_sales_rep}
                selected={compareReps}
                onChange={setCompareReps}
                onPick={(rep) => setDrill({ dimension: 'sales_rep', key: rep.name, label: `Rep: ${rep.name}` })}
              />
            </Section>

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

        {tab === 'Pipeline' && (
          <>
            <Section
              title="Top 10 Open Deals"
              subtitle="Largest open estimates — tap to view in JobNimbus"
            >
              <TopDeals deals={analytics.top_open_deals} />
            </Section>

            <Section title="Open Pipeline Aging" subtitle="Days since last update, currently-open jobs only">
              <AgingView aging={analytics.aging} onPick={() => setDrill({ dimension: 'stalled', label: 'Stalled Pipeline (30+ days)' })} />
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
          period={period}
          filters={filters}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  )
}

export default JobNimbusDashboard

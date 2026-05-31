import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import { getJobNimbusAnalyticsApi, getJobNimbusJobsApi } from '../services/api'

interface Analytics {
  totals: { all: number; open: number; won: number; lost: number; leads: number }
  values: { pipeline: number; sold: number; billed: number }
  closing_rate: number | null
  win_rate: number | null
  by_status: { status: string; count: number; status_type: number | null }[]
  by_sales_rep: { name: string; open: number; won: number; lost: number; close_rate: number | null; sold_value: number }[]
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
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: 'All time', days: 365 * 5 },
]

const fmtPct = (n: number | null) => n === null ? '—' : `${Math.round(n * 100)}%`
const fmtUsd = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtUsdShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtWeek = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const statusColor = (st: number | null): string =>
  st === 4 ? 'bg-green-500' : st === 5 ? 'bg-red-500' : 'bg-blue-500'
const statusTextColor = (st: number | null): string =>
  st === 4 ? 'text-green-400' : st === 5 ? 'text-red-400' : 'text-blue-400'

const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: string; color?: string; onClick?: () => void }> = ({ label, value, sub, color = 'text-white', onClick }) => (
  <div
    className={`bg-slate-800 rounded-xl border border-slate-700 p-4 ${onClick ? 'cursor-pointer hover:border-blue-500/60 transition-colors' : ''}`}
    onClick={onClick}
  >
    <p className="text-xs text-slate-400">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
)

const BarRow: React.FC<{ label: string; count: number; max: number; color?: string; onClick?: () => void }> = ({ label, count, max, color = 'bg-blue-500', onClick }) => {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className={`flex items-center gap-3 ${onClick ? 'cursor-pointer group' : ''}`} onClick={onClick}>
      <span className={`text-xs w-32 truncate flex-shrink-0 ${onClick ? 'text-slate-300 group-hover:text-white' : 'text-slate-300'}`} title={label}>{label}</span>
      <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-12 text-right tabular-nums">{count}</span>
    </div>
  )
}

const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {right}
    </div>
    {children}
  </div>
)

// Two-line trend: leads created vs jobs signed
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
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
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

// Weekly billed: bars by count, labeled with $ amount
const BilledChart: React.FC<{ data: { week: string; count: number; amount: number }[]; onPick: (week: string) => void }> = ({ data, onPick }) => {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div>
      <div className="flex items-end gap-1.5 h-40">
        {data.map((d) => (
          <div key={d.week} className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer" onClick={() => onPick(d.week)} title={`${fmtWeek(d.week)} · ${d.count} billed · ${fmtUsd(d.amount)}`}>
            <span className="text-[9px] text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{d.amount > 0 ? fmtUsdShort(d.amount) : ''}</span>
            <div className="w-full bg-emerald-500/80 group-hover:bg-emerald-400 rounded-t transition-all" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }} />
            <span className="text-[9px] text-slate-500 mt-1">{fmtWeek(d.week).split(' ')[1]}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-2">Jobs invoiced per week (last 12 weeks). Click a bar for details.</p>
    </div>
  )
}

// ── Drill-down modal ──────────────────────────────────────────────────────────
const DrillModal: React.FC<{ dimension: string; dkey?: string; label: string; days: number; onClose: () => void }> = ({ dimension, dkey, label, days, onClose }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h3 className="text-white font-semibold">{label}</h3>
            <p className="text-xs text-slate-500">{loading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="overflow-auto p-2">
          {err ? (
            <p className="text-red-400 text-sm p-4">{err}</p>
          ) : loading ? (
            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" /></div>
          ) : jobs.length === 0 ? (
            <p className="text-slate-500 text-sm p-4">No jobs.</p>
          ) : (
            <table className="w-full text-sm">
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
          )}
        </div>
      </div>
    </div>
  )
}

const JobNimbusDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(90)
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

  return (
    <>
      <Header
        title="JobNimbus Dashboard"
        actions={
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  days === opt.days ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">

        {/* Count tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Tile label="New Leads" value={analytics.totals.leads} color="text-slate-300" onClick={() => setDrill({ dimension: 'leads', label: 'New Leads' })} />
          <Tile label="Open Pipeline" value={analytics.totals.open} color="text-blue-400" onClick={() => setDrill({ dimension: 'open', label: 'Open Pipeline' })} />
          <Tile label="Signed (Won)" value={analytics.totals.won} color="text-green-400" onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })} />
          <Tile label="Lost" value={analytics.totals.lost} color="text-red-400" onClick={() => setDrill({ dimension: 'lost', label: 'Lost Jobs' })} />
          <Tile
            label="Closing Rate"
            value={fmtPct(analytics.closing_rate)}
            sub={`${analytics.totals.won} won / ${analytics.totals.won + analytics.totals.lost} closed`}
            color="text-yellow-400"
          />
        </div>

        {/* Value tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tile label="Open Pipeline Value" value={fmtUsd(analytics.values.pipeline)} color="text-blue-400" sub="Signed-estimate value of open jobs" onClick={() => setDrill({ dimension: 'open', label: 'Open Pipeline' })} />
          <Tile label="$ Sold" value={fmtUsd(analytics.values.sold)} color="text-green-400" sub="Signed estimates in range" onClick={() => setDrill({ dimension: 'won', label: 'Signed Jobs' })} />
          <Tile label="$ Billed" value={fmtUsd(analytics.values.billed)} color="text-emerald-400" sub="Invoiced in range" onClick={() => setDrill({ dimension: 'billed', label: 'Billed Jobs' })} />
        </div>

        {/* Trend */}
        <Section title="Leads vs. Signed (last 12 weeks)">
          <TrendChart data={analytics.trend} />
        </Section>

        {/* Weekly billed */}
        <Section title="Weekly Jobs Billed">
          <BilledChart data={analytics.weekly_billed} onPick={() => setDrill({ dimension: 'billed', label: 'Billed Jobs' })} />
        </Section>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

          {/* By status */}
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

          {/* By sales rep */}
          <Section title="Sales Rep Performance">
            {analytics.by_sales_rep.length === 0 ? (
              <p className="text-sm text-slate-500">No sales rep data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-400 uppercase">
                    <tr>
                      <th className="text-left pb-2 font-medium">Rep</th>
                      <th className="text-right pb-2 font-medium">Open</th>
                      <th className="text-right pb-2 font-medium">Won</th>
                      <th className="text-right pb-2 font-medium">$ Sold</th>
                      <th className="text-right pb-2 font-medium">Close %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {analytics.by_sales_rep.map((r) => (
                      <tr key={r.name} className="cursor-pointer hover:bg-slate-700/30" onClick={() => setDrill({ dimension: 'sales_rep', key: r.name, label: `Rep: ${r.name}` })}>
                        <td className="py-2 text-white font-medium">{r.name}</td>
                        <td className="py-2 text-right text-blue-400 tabular-nums">{r.open}</td>
                        <td className="py-2 text-right text-green-400 tabular-nums">{r.won}</td>
                        <td className="py-2 text-right text-slate-300 tabular-nums">{fmtUsd(r.sold_value)}</td>
                        <td className="py-2 text-right text-yellow-400 tabular-nums font-medium">{fmtPct(r.close_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* By source */}
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

          {/* By record type */}
          <Section title="Job Types">
            {analytics.by_record_type.length === 0 ? (
              <p className="text-sm text-slate-500">No job type data.</p>
            ) : (
              <div className="space-y-2.5">
                {analytics.by_record_type.map((t) => (
                  <BarRow key={t.type} label={t.type} count={t.count} max={maxType} color="bg-orange-500" onClick={() => setDrill({ dimension: 'record_type', key: t.type, label: `Type: ${t.type}` })} />
                ))}
              </div>
            )}
          </Section>

        </div>

        {/* Recent activity */}
        <Section title="Recent Activity">
          {analytics.recent.length === 0 ? (
            <p className="text-sm text-slate-500">No jobs yet.</p>
          ) : (
            <div className="divide-y divide-slate-700/50 -mx-5">
              {analytics.recent.map((job) => (
                <div key={job.jnid} className="px-5 py-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${statusColor(job.status_type)} flex-shrink-0`} />
                  <span className="text-sm text-white flex-1 truncate">{job.name || '(unnamed)'}</span>
                  {job.value != null && job.value > 0 && <span className="text-xs text-slate-400 tabular-nums">{fmtUsd(job.value)}</span>}
                  <span className={`text-xs ${statusTextColor(job.status_type)}`}>{job.status || '—'}</span>
                  <span className="text-xs text-slate-500 w-16 text-right">{fmtDate(job.date_updated)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>

      {drill && (
        <DrillModal
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

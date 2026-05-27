import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import { getJobNimbusAnalyticsApi } from '../services/api'

interface Analytics {
  totals: { all: number; open: number; won: number; lost: number }
  closing_rate: number | null
  win_rate: number | null
  by_status: { status: string; count: number; status_type: number | null }[]
  by_sales_rep: { name: string; open: number; won: number; lost: number; close_rate: number | null }[]
  by_source: { source: string; count: number }[]
  by_record_type: { type: string; count: number }[]
  trend: { week: string; created: number; won: number }[]
  recent: { jnid: string; name: string | null; status: string | null; status_type: number | null; date_updated: string | null }[]
  filter: { from: string; to: string }
}

const RANGE_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: 'All time', days: 365 * 5 },
]

const fmtPct = (n: number | null) => n === null ? '—' : `${Math.round(n * 100)}%`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtWeek = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const statusColor = (status_type: number | null): string => {
  if (status_type === 4) return 'bg-green-500'
  if (status_type === 5) return 'bg-red-500'
  return 'bg-blue-500'
}
const statusTextColor = (status_type: number | null): string => {
  if (status_type === 4) return 'text-green-400'
  if (status_type === 5) return 'text-red-400'
  return 'text-blue-400'
}

const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: string; color?: string }> = ({ label, value, sub, color = 'text-white' }) => (
  <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
    <p className="text-xs text-slate-400">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
)

const BarRow: React.FC<{ label: string; count: number; max: number; color?: string }> = ({ label, count, max, color = 'bg-blue-500' }) => {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-300 w-32 truncate flex-shrink-0" title={label}>{label}</span>
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

const TrendChart: React.FC<{ data: { week: string; created: number; won: number }[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.won)))
  const w = 600
  const h = 140
  const pad = 24
  const stepX = (w - 2 * pad) / Math.max(1, data.length - 1)

  const pointsCreated = data.map((d, i) => {
    const x = pad + i * stepX
    const y = h - pad - ((d.created / max) * (h - 2 * pad))
    return `${x},${y}`
  }).join(' ')
  const pointsWon = data.map((d, i) => {
    const x = pad + i * stepX
    const y = h - pad - ((d.won / max) * (h - 2 * pad))
    return `${x},${y}`
  }).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
        {/* gridline */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" strokeWidth="1" />
        {/* lines */}
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={pointsCreated} />
        <polyline fill="none" stroke="#22c55e" strokeWidth="2" points={pointsWon} />
        {/* points */}
        {data.map((d, i) => {
          const x = pad + i * stepX
          const yC = h - pad - ((d.created / max) * (h - 2 * pad))
          const yW = h - pad - ((d.won / max) * (h - 2 * pad))
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
        <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500" /> Won</div>
      </div>
    </div>
  )
}

const JobNimbusDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(90)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getJobNimbusAnalyticsApi(days)
      setAnalytics(res.data)
    } catch (e: any) {
      if (e.response?.status === 503) {
        setError('JobNimbus webhook is not configured. Go to Integrations to set it up.')
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

        {/* Top stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Tile label="Total Jobs" value={analytics.totals.all} />
          <Tile label="Open" value={analytics.totals.open} color="text-blue-400" />
          <Tile label="Won" value={analytics.totals.won} color="text-green-400" />
          <Tile label="Lost" value={analytics.totals.lost} color="text-red-400" />
          <Tile
            label="Closing Rate"
            value={fmtPct(analytics.closing_rate)}
            sub={`${analytics.totals.won} won / ${analytics.totals.won + analytics.totals.lost} closed`}
            color="text-yellow-400"
          />
        </div>

        {/* Trend chart */}
        <Section title="Lead Volume & Wins (last 12 weeks)">
          <TrendChart data={analytics.trend} />
        </Section>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

          {/* By status */}
          <Section title="Deals by Status">
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
                  />
                ))}
              </div>
            )}
          </Section>

          {/* By sales rep */}
          <Section title="Sales Rep Performance">
            {analytics.by_sales_rep.length === 0 ? (
              <div className="text-sm text-slate-500">
                <p>No sales rep data.</p>
                <p className="text-xs mt-1">Map the <strong className="text-slate-400">sales_rep_name</strong> field in Zapier to see per-rep breakdowns.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-400 uppercase">
                    <tr>
                      <th className="text-left pb-2 font-medium">Rep</th>
                      <th className="text-right pb-2 font-medium">Open</th>
                      <th className="text-right pb-2 font-medium">Won</th>
                      <th className="text-right pb-2 font-medium">Lost</th>
                      <th className="text-right pb-2 font-medium">Close %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {analytics.by_sales_rep.map((r) => (
                      <tr key={r.name}>
                        <td className="py-2 text-white font-medium">{r.name}</td>
                        <td className="py-2 text-right text-blue-400 tabular-nums">{r.open}</td>
                        <td className="py-2 text-right text-green-400 tabular-nums">{r.won}</td>
                        <td className="py-2 text-right text-red-400 tabular-nums">{r.lost}</td>
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
              <div className="text-sm text-slate-500">
                <p>No lead source data.</p>
                <p className="text-xs mt-1">Map the <strong className="text-slate-400">source</strong> field in Zapier to see lead source breakdown.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {analytics.by_source.map((s) => (
                  <BarRow key={s.source} label={s.source} count={s.count} max={maxSource} color="bg-purple-500" />
                ))}
              </div>
            )}
          </Section>

          {/* By record type */}
          <Section title="Job Types">
            {analytics.by_record_type.length === 0 ? (
              <div className="text-sm text-slate-500">
                <p>No record type data.</p>
                <p className="text-xs mt-1">Map the <strong className="text-slate-400">record_type</strong> field in Zapier.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {analytics.by_record_type.map((t) => (
                  <BarRow key={t.type} label={t.type} count={t.count} max={maxType} color="bg-orange-500" />
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
                  <span className={`text-xs ${statusTextColor(job.status_type)}`}>{job.status || '—'}</span>
                  <span className="text-xs text-slate-500 w-16 text-right">{fmtDate(job.date_updated)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
    </>
  )
}

export default JobNimbusDashboard

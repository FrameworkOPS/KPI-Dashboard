import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import { getMetricsDashboardApi } from '../services/api'
import { getLeadTimeStatus, getLeadTimeColorClass } from '../utils/forecasterConstants'
import { formatDate } from '../utils/dates'

interface CurrentMetrics {
  pipeline_shingle: number
  pipeline_metal: number
  production_shingle: number
  production_metal: number
  lead_time_shingle: number
  lead_time_metal: number
  active_crews: number
  total_leads: number
  total_supers: number
  revenue_shingle: number
  revenue_metal: number
}

interface WeekMetric {
  week: string
  pipeline_sqs_shingle: number
  pipeline_sqs_metal: number
  production_rate_shingle: number
  production_rate_metal: number
  sales_forecast_shingle: number
  sales_forecast_metal: number
  lead_time_days_shingle: number
  lead_time_days_metal: number
  revenue_shingle: number
  revenue_metal: number
}

interface CrewDetail {
  id: string
  crew_name: string
  crew_type: string
  weekly_sq_capacity: number
  effective_capacity: number
  ramp_pct: number
  is_blocked: boolean
  lead_count: number
  super_count: number
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

const KpiTile = ({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
  </div>
)

const CHART_TABS = [
  { key: 'pipeline', label: 'Pipeline SQs', description: 'Pipeline squares by week, shingle and metal' },
  { key: 'production', label: 'Production Rate', description: 'Production rate in squares per week, shingle and metal' },
  { key: 'revenue', label: 'Revenue ($k)', description: 'Weekly revenue in thousands of dollars, shingle and metal stacked' },
] as const
type ChartKey = typeof CHART_TABS[number]['key']

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid #475569', color: '#f1f5f9' }
const axisTick = { fill: '#94a3b8', fontSize: 11 }

export default function Metrics() {
  const [current, setCurrent] = useState<CurrentMetrics | null>(null)
  const [weeks, setWeeks] = useState<WeekMetric[]>([])
  const [crewDetails, setCrewDetails] = useState<CrewDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChart, setActiveChart] = useState<ChartKey>('pipeline')

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getMetricsDashboardApi()
      const d = res.data?.data
      setCurrent(d?.current || null)
      setWeeks(d?.weeks || [])
      setCrewDetails(d?.crew_details || [])
    } catch (e: any) {
      setError(e.message || 'Could not load metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMetrics() }, [loadMetrics])

  const chartData = weeks.map((w) => ({
    week: formatDate(w.week, { month: 'short', day: 'numeric' }),
    shingle_pipeline: w.pipeline_sqs_shingle,
    metal_pipeline: w.pipeline_sqs_metal,
    shingle_rate: w.production_rate_shingle,
    metal_rate: w.production_rate_metal,
    shingle_revenue: Math.round(w.revenue_shingle / 1000),
    metal_revenue: Math.round(w.revenue_metal / 1000),
    total_revenue: Math.round((w.revenue_shingle + w.revenue_metal) / 1000),
  }))

  // With no production capacity the server caps lead time at ~99 weeks; say so instead of showing the cap.
  const leadTile = (label: string, days: number, capacity: number) => {
    const hasCapacity = capacity > 0
    const weeks = days / 7
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        {hasCapacity ? (
          <span className={`inline-block px-3 py-1 rounded text-sm font-bold ${getLeadTimeColorClass(getLeadTimeStatus(weeks))}`}>
            {weeks.toFixed(1)} wk
          </span>
        ) : (
          <>
            <span className="inline-block px-3 py-1 rounded text-sm font-bold bg-slate-700 text-slate-300">No capacity</span>
            <p className="text-xs text-slate-400 mt-1">Add an active crew to calculate lead time.</p>
          </>
        )}
      </div>
    )
  }
  const activeTab = CHART_TABS.find((t) => t.key === activeChart)!

  return (
    <>
      <Header
        title="Metrics"
        actions={
          <button
            type="button"
            onClick={loadMetrics}
            disabled={loading}
            className="px-4 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{error}</span>
            <button type="button" onClick={loadMetrics} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        {loading && !current ? (
          <div className="text-center py-8 text-slate-400" role="status" aria-live="polite">Loading metrics…</div>
        ) : !current && !error ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
            <p className="text-slate-400">No metrics yet. Add crews and pipeline jobs first, then come back here.</p>
          </div>
        ) : current ? (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiTile label="Shingle Pipeline" value={`${fmt(current.pipeline_shingle || 0)} SQs`} color="text-cyan-300" />
              <KpiTile label="Metal Pipeline" value={`${fmt(current.pipeline_metal || 0)} SQs`} color="text-pink-300" />
              <KpiTile label="Shingle Production" value={`${fmt(current.production_shingle || 0)} SQs/wk`} color="text-cyan-300" sub="current week" />
              <KpiTile label="Metal Production" value={`${fmt(current.production_metal || 0)} SQs/wk`} color="text-pink-300" sub="current week" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {leadTile('Shingle Lead Time', current.lead_time_shingle, current.production_shingle)}
              {leadTile('Metal Lead Time', current.lead_time_metal, current.production_metal)}
              <KpiTile label="Active Crews" value={String(current.active_crews || 0)} sub={`${current.total_leads || 0} leads · ${current.total_supers || 0} supers`} />
              <KpiTile
                label="Weekly Revenue"
                value={`$${fmt((current.revenue_shingle || 0) + (current.revenue_metal || 0))}`}
                sub="shingle + metal"
              />
            </div>

            {/* Charts */}
            <section aria-labelledby="metrics-chart-title" className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <h2 id="metrics-chart-title" className="sr-only">Trend charts</h2>
              <div className="flex gap-2 mb-4 flex-wrap" role="group" aria-label="Chart">
                {CHART_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveChart(key)}
                    aria-pressed={activeChart === key}
                    className={`px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${activeChart === key ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {chartData.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No weekly data to chart yet.</p>
              ) : (
                <div role="img" aria-label={activeTab.description}>
                  {activeChart === 'pipeline' && (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="week" tick={axisTick} />
                        <YAxis tick={axisTick} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Area type="monotone" dataKey="shingle_pipeline" name="Shingle" stroke="#22d3ee" fill="#22d3ee20" strokeWidth={2} />
                        <Area type="monotone" dataKey="metal_pipeline" name="Metal" stroke="#f472b6" fill="#f472b620" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {activeChart === 'production' && (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="week" tick={axisTick} />
                        <YAxis tick={axisTick} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="shingle_rate" name="Shingle SQs/wk" stroke="#22d3ee" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="metal_rate" name="Metal SQs/wk" stroke="#f472b6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {activeChart === 'revenue' && (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="week" tick={axisTick} />
                        <YAxis tick={axisTick} unit="k" />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}k`, '']} />
                        <Legend />
                        <Bar dataKey="shingle_revenue" name="Shingle ($k)" fill="#22d3ee" stackId="a" />
                        <Bar dataKey="metal_revenue" name="Metal ($k)" fill="#f472b6" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </section>

            {/* Crew details */}
            {crewDetails.length > 0 && (
              <section aria-labelledby="crew-capacity-title" className="relative bg-slate-800 rounded-xl overflow-x-auto border border-slate-700" tabIndex={0}>
                <div className="px-4 py-3 border-b border-slate-700">
                  <h2 id="crew-capacity-title" className="font-semibold text-slate-200 text-sm">Current Week Crew Capacity</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-700/50">
                    <tr>
                      {['Crew', 'Type', 'Base SQs/wk', 'Ramp', 'Effective SQs/wk', 'Leads', 'Supers', 'Status'].map((h) => (
                        <th scope="col" key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {crewDetails.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-700/40">
                        <th scope="row" className="px-4 py-2 font-medium text-white text-left">{c.crew_name}</th>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${c.crew_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                            {c.crew_type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-300">{c.weekly_sq_capacity}</td>
                        <td className="px-4 py-2 text-slate-300">{c.ramp_pct}%</td>
                        <td className="px-4 py-2 text-slate-300">{c.effective_capacity}</td>
                        <td className="px-4 py-2 text-slate-300">{c.lead_count}</td>
                        <td className="px-4 py-2 text-slate-300">{c.super_count}</td>
                        <td className="px-4 py-2">
                          {c.is_blocked
                            ? <span className="px-2 py-0.5 rounded text-xs bg-red-900/40 text-red-300">Blocked</span>
                            : c.ramp_pct < 100
                            ? <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/40 text-yellow-300">Ramping</span>
                            : <span className="px-2 py-0.5 rounded text-xs bg-green-900/40 text-green-300">Active</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}

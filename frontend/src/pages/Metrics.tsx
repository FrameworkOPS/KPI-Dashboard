import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import { getLeadTimeStatus, getLeadTimeColorClass } from '../utils/forecasterConstants'

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
  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
)

export default function Metrics() {
  const { token } = useAuthStore()
  const [current, setCurrent] = useState<CurrentMetrics | null>(null)
  const [weeks, setWeeks] = useState<WeekMetric[]>([])
  const [crewDetails, setCrewDetails] = useState<CrewDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [activeChart, setActiveChart] = useState<'pipeline' | 'production' | 'revenue'>('pipeline')

  useEffect(() => { loadMetrics() }, [])

  const loadMetrics = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/metrics/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        setCurrent(d.data?.current || null)
        setWeeks(d.data?.weeks || [])
        setCrewDetails(d.data?.crew_details || [])
      }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const chartData = weeks.map((w) => ({
    week: new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    shingle_pipeline: w.pipeline_sqs_shingle,
    metal_pipeline: w.pipeline_sqs_metal,
    shingle_rate: w.production_rate_shingle,
    metal_rate: w.production_rate_metal,
    shingle_revenue: Math.round(w.revenue_shingle / 1000),
    metal_revenue: Math.round(w.revenue_metal / 1000),
    total_revenue: Math.round((w.revenue_shingle + w.revenue_metal) / 1000),
  }))

  const leadShingleWeeks = current ? (current.lead_time_shingle / 7).toFixed(1) : '—'
  const leadMetalWeeks = current ? (current.lead_time_metal / 7).toFixed(1) : '—'
  const leadShingleStatus = current ? getLeadTimeStatus(current.lead_time_shingle / 7) : 'GREEN'
  const leadMetalStatus = current ? getLeadTimeStatus(current.lead_time_metal / 7) : 'GREEN'

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Metrics</h1>
        <button
          onClick={loadMetrics}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && !current ? (
        <div className="text-center py-8 text-slate-400">Loading metrics...</div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="Shingle Pipeline" value={`${fmt(current?.pipeline_shingle || 0)} SQs`} color="text-cyan-400" />
            <KpiTile label="Metal Pipeline" value={`${fmt(current?.pipeline_metal || 0)} SQs`} color="text-pink-400" />
            <KpiTile label="Shingle Production" value={`${fmt(current?.production_shingle || 0)} SQs/wk`} color="text-cyan-300" sub="current week" />
            <KpiTile label="Metal Production" value={`${fmt(current?.production_metal || 0)} SQs/wk`} color="text-pink-300" sub="current week" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Shingle Lead Time</p>
              <span className={`px-3 py-1 rounded text-sm font-bold ${getLeadTimeColorClass(leadShingleStatus)}`}>
                {leadShingleWeeks}w
              </span>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Metal Lead Time</p>
              <span className={`px-3 py-1 rounded text-sm font-bold ${getLeadTimeColorClass(leadMetalStatus)}`}>
                {leadMetalWeeks}w
              </span>
            </div>
            <KpiTile label="Active Crews" value={String(current?.active_crews || 0)} />
            <KpiTile
              label="Weekly Revenue"
              value={`$${fmt((current?.revenue_shingle || 0) + (current?.revenue_metal || 0))}`}
              sub="shingle + metal"
            />
          </div>

          {/* Charts */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex gap-2 mb-4">
              {([
                { key: 'pipeline', label: 'Pipeline SQs' },
                { key: 'production', label: 'Production Rate' },
                { key: 'revenue', label: 'Revenue ($k)' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveChart(key)}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${activeChart === key ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeChart === 'pipeline' && (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#f1f5f9' }} />
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
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#f1f5f9' }} />
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
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit="k" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#f1f5f9' }}
                    formatter={(v: number) => [`$${v}k`, '']} />
                  <Legend />
                  <Bar dataKey="shingle_revenue" name="Shingle ($k)" fill="#22d3ee" stackId="a" />
                  <Bar dataKey="metal_revenue" name="Metal ($k)" fill="#f472b6" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Crew details */}
          {crewDetails.length > 0 && (
            <div className="bg-slate-800 rounded-lg overflow-x-auto border border-slate-700">
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="font-semibold text-slate-200 text-sm">Current Week Crew Capacity</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-700/50">
                  <tr>
                    {['Crew', 'Type', 'Base SQs/wk', 'Ramp', 'Effective SQs/wk', 'Leads', 'Supers', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {crewDetails.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-700/40">
                      <td className="px-4 py-2 font-medium text-white">{c.crew_name}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.crew_type === 'shingle' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-pink-900/40 text-pink-300'}`}>
                          {c.crew_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-300">{c.weekly_sq_capacity}</td>
                      <td className="px-4 py-2 text-slate-300">{c.ramp_pct}%</td>
                      <td className="px-4 py-2 text-slate-300">{c.effective_capacity}</td>
                      <td className="px-4 py-2 text-slate-400">{c.lead_count}</td>
                      <td className="px-4 py-2 text-slate-400">{c.super_count}</td>
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
            </div>
          )}
        </>
      )}
    </div>
  )
}

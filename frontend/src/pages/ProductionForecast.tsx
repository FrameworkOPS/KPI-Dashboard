import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { getLeadTimeStatus, getLeadTimeColorClass } from '../utils/forecasterConstants'

interface CrewEvent {
  type: 'added' | 'removed'
  crew_name: string
  crew_type: string
  date: string
}

interface ForecastWeek {
  week: string
  pipeline_sqs_shingles: number
  pipeline_sqs_metal: number
  production_rate_shingles: number
  production_rate_metal: number
  sales_forecast_shingles: number
  sales_forecast_metal: number
  lead_time_weeks_shingle: number
  lead_time_weeks_metal: number
  crew_changes: CrewEvent[]
  custom_projects: Array<{ name: string; start_date: string; end_date: string }>
}

type ForecastDuration = '3' | '6' | '9'

export default function ProductionForecast() {
  const { token } = useAuthStore()
  const [forecastData, setForecastData] = useState<ForecastWeek[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedType, setSelectedType] = useState<'all' | 'shingle' | 'metal'>('all')
  const [duration, setDuration] = useState<ForecastDuration>('6')

  useEffect(() => { loadForecast() }, [duration])

  const getDurationWeeks = (d: ForecastDuration) => ({ '3': 13, '6': 26, '9': 39 }[d])

  const loadForecast = async () => {
    setLoading(true)
    try {
      const weeks = getDurationWeeks(duration)
      const res = await fetch(`/api/forecasts/six-month?weeks=${weeks}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setForecastData(data.data?.weeks || [])
      }
    } catch (err) {
      console.error('Error loading forecast:', err)
    } finally {
      setLoading(false)
    }
  }

  const getWeekLabel = (weekStr: string) =>
    new Date(weekStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Production Forecast</h1>
        <button
          onClick={loadForecast}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="flex gap-2 items-center">
        <span className="text-sm font-medium text-slate-400 mr-2">Duration:</span>
        {(['3', '6', '9'] as ForecastDuration[]).map((d) => (
          <button key={d} onClick={() => setDuration(d)}
            className={`px-4 py-2 rounded font-medium text-sm ${duration === d ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {d} Mo
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {(['all', 'shingle', 'metal'] as const).map((type) => (
          <button key={type} onClick={() => setSelectedType(type)}
            className={`px-4 py-2 rounded font-medium text-sm ${
              selectedType === type
                ? type === 'all' ? 'bg-slate-600 text-white' : type === 'shingle' ? 'bg-cyan-600 text-white' : 'bg-pink-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {type === 'all' ? 'All Types' : type === 'shingle' ? 'Shingles' : 'Metal'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading forecast...</div>
      ) : forecastData.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center">
          <p className="text-slate-400">No forecast data. Configure crews and pipeline first.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-300 min-w-20">Week</th>
                {(selectedType === 'all' || selectedType === 'shingle') && <>
                  <th className="px-4 py-3 text-right font-medium text-cyan-400">Pipe (S)</th>
                  <th className="px-4 py-3 text-right font-medium text-cyan-400">Rate (S)</th>
                  <th className="px-4 py-3 text-right font-medium text-cyan-400">Sales (S)</th>
                </>}
                {(selectedType === 'all' || selectedType === 'metal') && <>
                  <th className="px-4 py-3 text-right font-medium text-pink-400">Pipe (M)</th>
                  <th className="px-4 py-3 text-right font-medium text-pink-400">Rate (M)</th>
                  <th className="px-4 py-3 text-right font-medium text-pink-400">Sales (M)</th>
                </>}
                <th className="px-4 py-3 text-center font-medium text-slate-300">Lead (S)</th>
                <th className="px-4 py-3 text-center font-medium text-slate-300">Lead (M)</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {forecastData.map((week) => {
                const hasEvents = week.crew_changes.length > 0 || week.custom_projects.length > 0
                return (
                  <tr key={week.week} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3 font-medium text-slate-200">{getWeekLabel(week.week)}</td>
                    {(selectedType === 'all' || selectedType === 'shingle') && <>
                      <td className="px-4 py-3 text-right text-slate-300">{(week.pipeline_sqs_shingles ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{(week.production_rate_shingles ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{(week.sales_forecast_shingles ?? 0).toFixed(0)}</td>
                    </>}
                    {(selectedType === 'all' || selectedType === 'metal') && <>
                      <td className="px-4 py-3 text-right text-slate-300">{(week.pipeline_sqs_metal ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{(week.production_rate_metal ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{(week.sales_forecast_metal ?? 0).toFixed(0)}</td>
                    </>}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${getLeadTimeColorClass(getLeadTimeStatus(week.lead_time_weeks_shingle))}`}>
                        {week.lead_time_weeks_shingle}w
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${getLeadTimeColorClass(getLeadTimeStatus(week.lead_time_weeks_metal))}`}>
                        {week.lead_time_weeks_metal}w
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hasEvents ? (
                        <div className="space-y-1">
                          {week.crew_changes.map((e, i) => (
                            <span key={i} className={`block px-2 py-1 rounded ${e.type === 'added' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                              {e.type === 'added' ? '+' : '-'} {e.crew_name} ({e.crew_type})
                            </span>
                          ))}
                          {week.custom_projects.map((p, i) => (
                            <span key={i} className="block px-2 py-1 rounded bg-slate-600 text-slate-300">
                              Block: {p.name}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-800 rounded-lg p-4">
        <h3 className="font-bold text-slate-200 mb-3 text-sm">Legend</h3>
        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
          <span><span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-800 mr-1">GREEN</span> 4–5 wks</span>
          <span><span className="inline-block px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 mr-1">YELLOW</span> 6–8 wks</span>
          <span><span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-800 mr-1">RED</span> 8+ wks</span>
          <span>S = Shingles, M = Metal</span>
        </div>
      </div>
    </div>
  )
}

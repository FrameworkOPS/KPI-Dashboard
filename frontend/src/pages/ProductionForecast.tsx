import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import { getProductionForecastApi } from '../services/api'
import { getLeadTimeStatus, getLeadTimeColorClass, LEAD_TIME_THRESHOLDS } from '../utils/forecasterConstants'
import { formatDate } from '../utils/dates'

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
const DURATION_WEEKS: Record<ForecastDuration, number> = { '3': 13, '6': 26, '9': 39 }

const pill = (active: boolean, activeCls = 'bg-blue-600 text-white') =>
  `px-4 py-2 min-h-[44px] rounded-lg font-medium text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
    active ? activeCls : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`

export default function ProductionForecast() {
  const [forecastData, setForecastData] = useState<ForecastWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'all' | 'shingle' | 'metal'>('all')
  const [duration, setDuration] = useState<ForecastDuration>('6')

  const loadForecast = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getProductionForecastApi(DURATION_WEEKS[duration])
      setForecastData(res.data?.data?.weeks || [])
    } catch (e: any) {
      setError(e.message || 'Could not load the forecast')
    } finally {
      setLoading(false)
    }
  }, [duration])

  useEffect(() => { loadForecast() }, [loadForecast])

  const showShingle = selectedType === 'all' || selectedType === 'shingle'
  const showMetal = selectedType === 'all' || selectedType === 'metal'
  const weekLabel = (w: string) => formatDate(w, { month: 'short', day: 'numeric' })

  const leadCell = (weeks: number, type: string) => (
    <td className="px-4 py-3">
      <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${getLeadTimeColorClass(getLeadTimeStatus(weeks))}`}>
        {weeks}<span aria-hidden="true">w</span>
        <span className="sr-only"> week {type} lead time</span>
      </span>
    </td>
  )

  return (
    <>
      <Header
        title="Production Forecast"
        actions={
          <button
            type="button"
            onClick={loadForecast}
            disabled={loading}
            className="px-4 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="flex gap-2 items-center flex-wrap" role="group" aria-label="Forecast length">
            <span className="text-sm font-medium text-slate-400 mr-1">Duration:</span>
            {(['3', '6', '9'] as ForecastDuration[]).map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={duration === d} className={pill(duration === d)}>
                {d} mo
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center flex-wrap" role="group" aria-label="Roof type">
            <span className="text-sm font-medium text-slate-400 mr-1">Type:</span>
            {(['all', 'shingle', 'metal'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                aria-pressed={selectedType === type}
                className={pill(selectedType === type, type === 'all' ? 'bg-slate-600 text-white' : type === 'shingle' ? 'bg-cyan-700 text-white' : 'bg-pink-700 text-white')}
              >
                {type === 'all' ? 'All Types' : type === 'shingle' ? 'Shingles' : 'Metal'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{error}</span>
            <button type="button" onClick={loadForecast} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-slate-400" role="status" aria-live="polite">Loading forecast…</div>
        ) : !error && forecastData.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
            <p className="text-slate-400">No forecast yet. Add crews and pipeline jobs first, then come back here.</p>
          </div>
        ) : forecastData.length > 0 ? (
          <div className="relative bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto" tabIndex={0} aria-label="Weekly forecast table, scrolls horizontally">
            <table className="w-full text-sm">
              <caption className="sr-only">Week-by-week pipeline, production rate, sales forecast and lead time. S is shingles, M is metal. Amounts are in squares.</caption>
              <thead className="bg-slate-700 border-b border-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-300 min-w-20">Week</th>
                  {showShingle && <>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-cyan-300"><abbr title="Pipeline squares, shingles" className="no-underline">Pipe (S)</abbr></th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-cyan-300"><abbr title="Production rate, shingles" className="no-underline">Rate (S)</abbr></th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-cyan-300"><abbr title="Sales forecast, shingles" className="no-underline">Sales (S)</abbr></th>
                  </>}
                  {showMetal && <>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-pink-300"><abbr title="Pipeline squares, metal" className="no-underline">Pipe (M)</abbr></th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-pink-300"><abbr title="Production rate, metal" className="no-underline">Rate (M)</abbr></th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-pink-300"><abbr title="Sales forecast, metal" className="no-underline">Sales (M)</abbr></th>
                  </>}
                  {showShingle && <th scope="col" className="px-4 py-3 text-center font-medium text-slate-300"><abbr title="Lead time, shingles" className="no-underline">Lead (S)</abbr></th>}
                  {showMetal && <th scope="col" className="px-4 py-3 text-center font-medium text-slate-300"><abbr title="Lead time, metal" className="no-underline">Lead (M)</abbr></th>}
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-300">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {forecastData.map((week) => {
                  const hasEvents = week.crew_changes.length > 0 || week.custom_projects.length > 0
                  return (
                    <tr key={week.week} className="hover:bg-slate-700/50">
                      <th scope="row" className="px-4 py-3 font-medium text-slate-200 text-left whitespace-nowrap">{weekLabel(week.week)}</th>
                      {showShingle && <>
                        <td className="px-4 py-3 text-right text-slate-300">{(week.pipeline_sqs_shingles ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{(week.production_rate_shingles ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{(week.sales_forecast_shingles ?? 0).toFixed(0)}</td>
                      </>}
                      {showMetal && <>
                        <td className="px-4 py-3 text-right text-slate-300">{(week.pipeline_sqs_metal ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{(week.production_rate_metal ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{(week.sales_forecast_metal ?? 0).toFixed(0)}</td>
                      </>}
                      {showShingle && leadCell(week.lead_time_weeks_shingle, 'shingle')}
                      {showMetal && leadCell(week.lead_time_weeks_metal, 'metal')}
                      <td className="px-4 py-3 text-xs">
                        {hasEvents ? (
                          <ul className="space-y-1">
                            {week.crew_changes.map((e, i) => (
                              <li key={`c${i}`} className={`block px-2 py-1 rounded ${e.type === 'added' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                                {e.type === 'added' ? 'Crew added:' : 'Crew removed:'} {e.crew_name} ({e.crew_type})
                              </li>
                            ))}
                            {week.custom_projects.map((p, i) => (
                              <li key={`p${i}`} className="block px-2 py-1 rounded bg-slate-600 text-slate-200">
                                Block: {p.name}
                              </li>
                            ))}
                          </ul>
                        ) : <span className="text-slate-400"><span aria-hidden="true">—</span><span className="sr-only">No events</span></span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <section aria-labelledby="forecast-legend" className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h2 id="forecast-legend" className="font-semibold text-slate-200 mb-3 text-sm">Lead time legend</h2>
          <ul className="flex flex-wrap gap-4 text-xs text-slate-300">
            <li><span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-800 mr-1">Green</span> under {LEAD_TIME_THRESHOLDS.yellow} weeks</li>
            <li><span className="inline-block px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 mr-1">Yellow</span> {LEAD_TIME_THRESHOLDS.yellow}–{LEAD_TIME_THRESHOLDS.red - 1} weeks</li>
            <li><span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-800 mr-1">Red</span> {LEAD_TIME_THRESHOLDS.red}+ weeks</li>
            <li>S = Shingles, M = Metal. Pipe, Rate and Sales are in squares (SQs).</li>
          </ul>
        </section>
      </div>
    </>
  )
}

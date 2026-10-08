import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Header from '../components/Header'
import { getSalesForecastApi, setSalesForecastApi } from '../services/api'
import { isoDate, mondayOf, formatDate } from '../utils/dates'

interface SalesForecast {
  forecast_week: string
  job_type: string
  projected_square_footage: number
}

type JobType = 'shingle' | 'metal'
const WEEKS_AHEAD = 26

interface CellInputProps {
  isEditing: boolean
  value: number
  formSqs: string
  label: string
  onFormChange: (v: string) => void
  onStartEditing: () => void
  onSave: () => void
  onCancel: () => void
}

const CellInput = React.memo(function CellInput({ isEditing, value, formSqs, label, onFormChange, onStartEditing, onSave, onCancel }: CellInputProps) {
  if (isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <input
          type="number" min={0} step="any" value={formSqs}
          aria-label={label}
          onChange={(e) => onFormChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave() } if (e.key === 'Escape') onCancel() }}
          className="w-24 px-2 py-1 min-h-[44px] border border-slate-500 rounded-lg text-sm bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="SQs" autoFocus
        />
        <button type="button" onClick={onSave} className="px-3 min-h-[44px] bg-green-700 text-white text-xs rounded-lg hover:bg-green-600">Save</button>
        <button type="button" onClick={onCancel} className="px-3 min-h-[44px] bg-slate-600 text-white text-xs rounded-lg hover:bg-slate-500">Cancel</button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onStartEditing}
      aria-label={`${label}: ${value > 0 ? value.toFixed(0) : 'not set'}. Edit`}
      className="w-full text-left cursor-pointer hover:bg-slate-600/30 px-2 py-1 min-h-[44px] rounded-lg text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      {value > 0 ? value.toFixed(0) : <span className="text-slate-400" aria-hidden="true">—</span>}
    </button>
  )
})

function upcomingWeeks(): string[] {
  const weeks: string[] = []
  const d = mondayOf(new Date())
  for (let i = 0; i < WEEKS_AHEAD; i++) {
    weeks.push(isoDate(d))
    d.setDate(d.getDate() + 7)
  }
  return weeks
}

export default function SalesForecast() {
  const [forecasts, setForecasts] = useState<SalesForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingWeek, setEditingWeek] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<JobType | null>(null)
  const [editingSqs, setEditingSqs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filling, setFilling] = useState<JobType | null>(null)

  const weeks = useMemo(upcomingWeeks, [])
  const thisWeek = weeks[0]

  const valueMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of forecasts) m.set(`${String(f.forecast_week).slice(0, 10)}|${f.job_type}`, Number(f.projected_square_footage) || 0)
    return m
  }, [forecasts])
  const getValue = useCallback((week: string, jobType: JobType) => valueMap.get(`${week}|${jobType}`) || 0, [valueMap])

  const loadForecasts = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await getSalesForecastApi(weeks[0], weeks[weeks.length - 1])
      setForecasts(res.data?.data || [])
    } catch (e: any) {
      setLoadError(e.message || 'Could not load the sales forecast')
    } finally {
      setLoading(false)
    }
  }, [weeks])

  useEffect(() => { loadForecasts() }, [loadForecasts])

  const postForecast = (week: string, jobType: JobType, sqsValue: number) =>
    setSalesForecastApi({ forecastWeek: week, jobType, projectedSquareFootage: sqsValue, projectedJobCount: 0 })

  const stopEditing = () => { setEditingWeek(null); setEditingType(null); setEditingSqs('') }

  const handleSave = async (week: string, jobType: JobType) => {
    setError(null); setNotice(null)
    const v = parseFloat(editingSqs)
    if (editingSqs === '' || isNaN(v) || v < 0) { setError('Enter a number of squares (0 or more).'); return }
    try {
      await postForecast(week, jobType, v)
      stopEditing()
      await loadForecasts()
    } catch (e: any) { setError(e.message || 'Save failed') }
  }

  // Carry the most recent entered value forward into the empty weeks after it.
  const handleFillForward = async (jobType: JobType) => {
    setError(null); setNotice(null)
    let lastIdx = -1
    for (let i = weeks.length - 1; i >= 0; i--) { if (getValue(weeks[i], jobType) > 0) { lastIdx = i; break } }
    if (lastIdx === -1) { setError(`No ${jobType} forecast entered yet. Enter at least one week first.`); return }
    const sourceValue = getValue(weeks[lastIdx], jobType)
    const targets = weeks.slice(lastIdx + 1).filter((w) => getValue(w, jobType) === 0)
    if (!targets.length) { setNotice(`Every ${jobType} week after ${formatDate(weeks[lastIdx])} already has a value. Nothing to fill.`); return }
    if (!confirm(`Fill ${targets.length} empty ${jobType} week${targets.length === 1 ? '' : 's'} after ${formatDate(weeks[lastIdx])} with ${sourceValue.toFixed(0)} SQs? Weeks that already have a value are left alone.`)) return
    setFilling(jobType)
    try {
      for (const w of targets) await postForecast(w, jobType, sourceValue)
      await loadForecasts()
      setNotice(`Filled ${targets.length} ${jobType} week${targets.length === 1 ? '' : 's'} with ${sourceValue.toFixed(0)} SQs.`)
    } catch (e: any) {
      setError(e.message || 'Fill failed part-way. Reload to see what was saved.')
    } finally {
      setFilling(null)
    }
  }

  const startEditing = (week: string, jobType: JobType) => {
    const v = getValue(week, jobType)
    setEditingSqs(v > 0 ? String(v) : '')
    setEditingWeek(week); setEditingType(jobType); setError(null); setNotice(null)
  }

  const fillButton = (jobType: JobType, cls: string) => (
    <button
      type="button"
      onClick={() => handleFillForward(jobType)}
      disabled={filling !== null || loading}
      aria-label={`Fill empty ${jobType} weeks forward from the last entered value`}
      className={`px-3 min-h-[44px] text-white text-xs rounded-lg font-normal disabled:opacity-50 ${cls}`}
    >
      {filling === jobType ? 'Filling…' : 'Fill ↓'}
    </button>
  )

  return (
    <>
      <Header title="Sales Forecast" />
      <div className="p-4 md:p-6 space-y-4">
        <p className="text-sm text-slate-400">
          Projected squares sold per week for the next {WEEKS_AHEAD} weeks. Select a cell to edit it; Enter saves and Esc cancels.
          “Fill ↓” copies the last entered value into the empty weeks after it.
        </p>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 underline min-h-[44px] px-2">Dismiss</button>
          </div>
        )}
        {notice && <p role="status" className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-sm text-blue-300">{notice}</p>}
        {loadError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{loadError}</span>
            <button type="button" onClick={loadForecasts} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}

        <div className="relative bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto" tabIndex={0} aria-label="Sales forecast table, scrolls horizontally">
          {loading ? (
            <div className="px-6 py-4 text-center text-slate-400" role="status" aria-live="polite">Loading forecast…</div>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Projected squares per week by roof type.</caption>
              <thead className="bg-slate-700 border-b border-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-300">Week of</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-cyan-300">
                    <div className="flex items-center gap-2">Shingle SQs {fillButton('shingle', 'bg-cyan-700 hover:bg-cyan-600')}</div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-pink-300">
                    <div className="flex items-center gap-2">Metal SQs {fillButton('metal', 'bg-pink-700 hover:bg-pink-600')}</div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-300">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {weeks.map((week) => {
                  const sv = getValue(week, 'shingle')
                  const mv = getValue(week, 'metal')
                  const isCurrent = week === thisWeek
                  const label = formatDate(week, { month: 'short', day: 'numeric', year: '2-digit' })
                  return (
                    <tr key={week} className={isCurrent ? 'bg-blue-900/20' : 'hover:bg-slate-700/30'}>
                      <th scope="row" className="px-4 py-2 text-slate-200 font-medium whitespace-nowrap text-left">
                        {label}
                        {isCurrent && <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">This week</span>}
                      </th>
                      <td className="px-2 py-1">
                        <CellInput
                          isEditing={editingWeek === week && editingType === 'shingle'}
                          value={sv} formSqs={editingSqs} label={`Shingle squares, week of ${label}`}
                          onFormChange={setEditingSqs}
                          onStartEditing={() => startEditing(week, 'shingle')}
                          onSave={() => handleSave(week, 'shingle')}
                          onCancel={stopEditing}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CellInput
                          isEditing={editingWeek === week && editingType === 'metal'}
                          value={mv} formSqs={editingSqs} label={`Metal squares, week of ${label}`}
                          onFormChange={setEditingSqs}
                          onStartEditing={() => startEditing(week, 'metal')}
                          onSave={() => handleSave(week, 'metal')}
                          onCancel={stopEditing}
                        />
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-200">
                        {sv + mv > 0 ? (sv + mv).toFixed(0) : <span className="text-slate-400" aria-hidden="true">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

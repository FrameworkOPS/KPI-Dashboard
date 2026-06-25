import React, { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

interface SalesForecast {
  forecast_week: string
  job_type: string
  projected_square_footage: number
}

interface CellInputProps {
  isEditing: boolean
  value: number
  formSqs: string
  onFormChange: (v: string) => void
  onStartEditing: () => void
  onSave: () => void
  onCancel: () => void
}

const CellInput = React.memo(function CellInput({ isEditing, value, formSqs, onFormChange, onStartEditing, onSave, onCancel }: CellInputProps) {
  if (isEditing) {
    return (
      <div className="space-y-1">
        <input
          type="number" value={formSqs}
          onChange={(e) => onFormChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
          placeholder="SQs" autoFocus
        />
        <div className="flex gap-1">
          <button onClick={onSave} className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">Save</button>
          <button onClick={onCancel} className="px-2 py-1 bg-gray-300 text-gray-800 text-xs rounded hover:bg-gray-400">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div onClick={onStartEditing} className="cursor-pointer hover:bg-slate-600/30 px-2 py-1 rounded min-h-7 text-slate-200">
      {value > 0 ? value.toFixed(0) : <span className="text-slate-600">—</span>}
    </div>
  )
})

const getMonday = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d
}

const formatDate = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getWeeks = (): string[] => {
  const weeks: string[] = []
  const current = getMonday(new Date())
  const end = new Date(current)
  end.setDate(end.getDate() + 182)
  let d = new Date(current)
  while (d <= end) {
    weeks.push(formatDate(new Date(d)))
    d.setDate(d.getDate() + 7)
  }
  return weeks
}

const isCurrentWeek = (week: string): boolean => {
  const diff = (new Date().getTime() - new Date(week + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff < 7
}

export default function SalesForecast() {
  const { token } = useAuthStore()
  const [forecasts, setForecasts] = useState<SalesForecast[]>([])
  const [loading, setLoading] = useState(false)
  const [editingWeek, setEditingWeek] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editingSqs, setEditingSqs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyingAll, setCopyingAll] = useState<'shingle' | 'metal' | null>(null)

  useEffect(() => { loadForecasts() }, [])

  const getValue = useCallback((week: string, jobType: string): number => {
    const item = forecasts.find((f) => f.forecast_week.substring(0, 10) === week && f.job_type === jobType)
    return item?.projected_square_footage || 0
  }, [forecasts])

  const loadForecasts = async () => {
    setLoading(true)
    try {
      const start = formatDate(getMonday(new Date()))
      const end = new Date(getMonday(new Date())); end.setDate(end.getDate() + 182)
      const res = await fetch(`/api/sales-forecast?startWeek=${start}&endWeek=${formatDate(end)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { const data = await res.json(); setForecasts(data.data || []) }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const postForecast = async (week: string, jobType: string, sqs: number) => {
    const res = await fetch('/api/sales-forecast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ forecastWeek: week, jobType, projectedSquareFootage: sqs, projectedJobCount: 0 }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Save failed (${res.status})`) }
    return res
  }

  const handleSave = async (week: string, jobType: string) => {
    setError(null)
    const v = parseFloat(editingSqs)
    if (!editingSqs || isNaN(v) || v < 0) { setError('Enter a valid value (0 or more)'); return }
    try {
      await postForecast(week, jobType, v)
      setEditingWeek(null); setEditingType(null); setEditingSqs('')
      await loadForecasts()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed') }
  }

  const handleCopyAllWeeks = async (jobType: 'shingle' | 'metal') => {
    setError(null)
    const weeks = getWeeks()
    const firstIdx = weeks.findIndex((w) => getValue(w, jobType) > 0)
    if (firstIdx === -1) { setError(`No ${jobType} values found. Enter at least one week first.`); return }
    const sourceValue = getValue(weeks[firstIdx], jobType)
    const toCopy = weeks.slice(firstIdx + 1)
    if (!toCopy.length) { setError('Nothing to copy — only one week in the table.'); return }
    setCopyingAll(jobType)
    try { for (const w of toCopy) await postForecast(w, jobType, sourceValue); await loadForecasts() }
    catch (err) { setError(err instanceof Error ? err.message : 'Copy failed') }
    finally { setCopyingAll(null) }
  }

  const startEditing = (week: string, jobType: string) => {
    const existing = forecasts.find((f) => f.forecast_week.substring(0, 10) === week && f.job_type === jobType)
    setEditingSqs(existing?.projected_square_footage.toString() || '')
    setEditingWeek(week); setEditingType(jobType); setError(null)
  }

  const weeks = getWeeks()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Sales Forecast</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 flex justify-between items-start">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 hover:text-red-200 underline ml-4">Dismiss</button>
        </div>
      )}

      <div className="bg-slate-800 rounded-lg overflow-x-auto">
        {loading ? (
          <div className="px-6 py-4 text-center text-slate-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-300">Week</th>
                <th className="px-4 py-3 text-left font-medium text-cyan-400">
                  <div className="flex items-center gap-2">
                    Shingle SQs
                    <button onClick={() => handleCopyAllWeeks('shingle')} disabled={copyingAll === 'shingle'}
                      className="px-2 py-0.5 bg-cyan-700 text-white text-xs rounded hover:bg-cyan-600 font-normal disabled:opacity-50">
                      {copyingAll === 'shingle' ? 'Copying…' : 'Fill ↓'}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-medium text-pink-400">
                  <div className="flex items-center gap-2">
                    Metal SQs
                    <button onClick={() => handleCopyAllWeeks('metal')} disabled={copyingAll === 'metal'}
                      className="px-2 py-0.5 bg-pink-700 text-white text-xs rounded hover:bg-pink-600 font-normal disabled:opacity-50">
                      {copyingAll === 'metal' ? 'Copying…' : 'Fill ↓'}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {weeks.map((week) => {
                const sv = getValue(week, 'shingle')
                const mv = getValue(week, 'metal')
                const isCurrent = isCurrentWeek(week)
                return (
                  <tr key={week} className={isCurrent ? 'bg-blue-900/20' : 'hover:bg-slate-700/30'}>
                    <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">
                      {new Date(week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      {isCurrent && <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">Now</span>}
                    </td>
                    <td className="px-4 py-3">
                      <CellInput
                        isEditing={editingWeek === week && editingType === 'shingle'}
                        value={sv} formSqs={editingSqs}
                        onFormChange={setEditingSqs}
                        onStartEditing={() => startEditing(week, 'shingle')}
                        onSave={() => handleSave(week, 'shingle')}
                        onCancel={() => { setEditingWeek(null); setEditingType(null) }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <CellInput
                        isEditing={editingWeek === week && editingType === 'metal'}
                        value={mv} formSqs={editingSqs}
                        onFormChange={setEditingSqs}
                        onStartEditing={() => startEditing(week, 'metal')}
                        onSave={() => handleSave(week, 'metal')}
                        onCancel={() => { setEditingWeek(null); setEditingType(null) }}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {sv + mv > 0 ? (sv + mv).toFixed(0) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-slate-500">Click any cell to edit · Enter to save · Esc to cancel · Fill ↓ forward-fills all empty weeks from the last entered value</p>
    </div>
  )
}

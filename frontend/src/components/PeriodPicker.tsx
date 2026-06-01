import React, { useEffect, useRef, useState } from 'react'

export type PeriodKey =
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter'
  | 'this_year' | 'last_year'
  | 'custom'

export interface Period {
  key: PeriodKey
  from: Date
  to: Date
  label: string
}

// ── Date math helpers ─────────────────────────────────────────────────────────

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfWeek = (d: Date) => {
  const x = startOfDay(d); const dow = x.getDay(); const off = dow === 0 ? -6 : 1 - dow
  x.setDate(x.getDate() + off); return x
}
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const startOfQuarter = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate())

export function periodFromKey(key: PeriodKey, customFrom?: Date, customTo?: Date): Period {
  const now = new Date()
  switch (key) {
    case 'this_week': {
      const from = startOfWeek(now)
      return { key, from, to: now, label: 'This week' }
    }
    case 'last_week': {
      const to = startOfWeek(now)
      const from = addDays(to, -7)
      return { key, from, to, label: 'Last week' }
    }
    case 'this_month': {
      return { key, from: startOfMonth(now), to: now, label: 'This month' }
    }
    case 'last_month': {
      const to = startOfMonth(now)
      const from = addMonths(to, -1)
      return { key, from, to, label: 'Last month' }
    }
    case 'this_quarter': {
      return { key, from: startOfQuarter(now), to: now, label: 'This quarter' }
    }
    case 'last_quarter': {
      const to = startOfQuarter(now)
      const from = new Date(to.getFullYear(), to.getMonth() - 3, 1)
      return { key, from, to, label: 'Last quarter' }
    }
    case 'this_year': {
      return { key, from: startOfYear(now), to: now, label: 'This year' }
    }
    case 'last_year': {
      const from = new Date(now.getFullYear() - 1, 0, 1)
      const to = new Date(now.getFullYear(), 0, 1)
      return { key, from, to, label: 'Last year' }
    }
    case 'custom': {
      const from = customFrom ? startOfDay(customFrom) : addDays(now, -30)
      const to = customTo ? customTo : now
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { key, from, to, label: `${fmt(from)} – ${fmt(to)}` }
    }
  }
}

export const PRESETS: { key: PeriodKey; label: string; group: 'This' | 'Last' }[] = [
  { key: 'this_week',    label: 'This week',    group: 'This' },
  { key: 'this_month',   label: 'This month',   group: 'This' },
  { key: 'this_quarter', label: 'This quarter', group: 'This' },
  { key: 'this_year',    label: 'This year',    group: 'This' },
  { key: 'last_week',    label: 'Last week',    group: 'Last' },
  { key: 'last_month',   label: 'Last month',   group: 'Last' },
  { key: 'last_quarter', label: 'Last quarter', group: 'Last' },
  { key: 'last_year',    label: 'Last year',    group: 'Last' },
]

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// ── The picker UI ─────────────────────────────────────────────────────────────

interface Props {
  period: Period
  onChange: (p: Period) => void
  label?: string        // optional left label, e.g. "Compare to"
  align?: 'left' | 'right'
  variant?: 'primary' | 'ghost' | 'compare'
}

const PeriodPicker: React.FC<Props> = ({ period, onChange, label, align = 'left', variant = 'primary' }) => {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(period.key === 'custom' ? isoDate(period.from) : isoDate(period.from))
  const [customTo, setCustomTo] = useState(period.key === 'custom' ? isoDate(period.to) : isoDate(period.to))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const choose = (key: PeriodKey) => {
    onChange(periodFromKey(key))
    setOpen(false)
  }

  const applyCustom = () => {
    const f = new Date(customFrom + 'T00:00:00')
    const t = new Date(customTo + 'T23:59:59')
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || f > t) return
    onChange(periodFromKey('custom', f, t))
    setOpen(false)
  }

  const buttonClasses =
    variant === 'compare'
      ? 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/15 text-purple-200'
      : variant === 'ghost'
      ? 'border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300'
      : 'border-slate-700 bg-slate-800 hover:bg-slate-700/80 text-white'

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${buttonClasses}`}
      >
        {label && <span className="text-[10px] uppercase text-slate-500 mr-1">{label}</span>}
        <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span className="truncate max-w-[140px] sm:max-w-none">{period.label}</span>
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-2 w-[280px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <div className="grid grid-cols-2 gap-3">
            {(['This', 'Last'] as const).map((group) => (
              <div key={group}>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">{group}</p>
                <div className="flex flex-col gap-1">
                  {PRESETS.filter((p) => p.group === group).map((p) => (
                    <button
                      key={p.key}
                      onClick={() => choose(p.key)}
                      className={`text-left text-xs px-2 py-1.5 rounded-md transition-colors ${
                        period.key === p.key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {p.label.replace(`${group} `, '')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Custom range</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md text-xs px-2 py-1.5 text-white"
              />
              <input
                type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md text-xs px-2 py-1.5 text-white"
              />
            </div>
            <button
              onClick={applyCustom}
              className="w-full text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md py-1.5"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PeriodPicker

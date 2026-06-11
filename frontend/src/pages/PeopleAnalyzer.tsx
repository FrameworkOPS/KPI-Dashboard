import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import {
  listCoreValuesApi, createCoreValueApi, updateCoreValueApi, deleteCoreValueApi,
  listAnalyzerEntriesApi, upsertAnalyzerEntryApi,
} from '../services/api'
import { CoreValue, PeopleAnalyzerRow, ValueScore } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────
const VALUE_SCORES: ValueScore[] = ['+', '+/-', '-']

const scoreColor = (s: ValueScore | undefined): string => {
  if (s === '+')    return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (s === '-')    return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (s === '+/-')  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  return 'bg-slate-700 text-slate-500 border-slate-600'
}

const ynColor = (v: boolean | null | undefined): string => {
  if (v === true)  return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (v === false) return 'bg-red-500/20 text-red-400 border-red-500/30'
  return 'bg-slate-700 text-slate-500 border-slate-600'
}

// Right-person/right-seat verdict: + on every active value AND Y/Y/Y on GWC.
function verdict(row: PeopleAnalyzerRow, values: CoreValue[]): {
  label: string; color: string;
} {
  if (!row.entry_id) return { label: 'Not evaluated', color: 'text-slate-500' }
  const allPlus = values.every(v => (row.value_scores || {})[v.id] === '+')
  const gwcYes = row.gwc_get === true && row.gwc_want === true && row.gwc_capacity === true
  if (allPlus && gwcYes) return { label: 'Right person, right seat', color: 'text-green-400' }
  if (allPlus && !gwcYes) return { label: 'Right person, wrong seat', color: 'text-yellow-400' }
  if (!allPlus && gwcYes) return { label: 'Wrong person, right seat', color: 'text-yellow-400' }
  return { label: 'Wrong person, wrong seat', color: 'text-red-400' }
}

const currentQuarter = (d = new Date()) => Math.ceil((d.getMonth() + 1) / 3)

// ── Edit Modal ──────────────────────────────────────────────────────────────
interface EditModalProps {
  row: PeopleAnalyzerRow
  values: CoreValue[]
  quarter: number
  year: number
  onClose: () => void
  onSaved: () => void
}

const EditModal: React.FC<EditModalProps> = ({ row, values, quarter, year, onClose, onSaved }) => {
  const [scores, setScores] = useState<Record<string, ValueScore>>(row.value_scores || {})
  const [get, setGet]           = useState<boolean | null>(row.gwc_get)
  const [want, setWant]         = useState<boolean | null>(row.gwc_want)
  const [capacity, setCapacity] = useState<boolean | null>(row.gwc_capacity)
  const [notes, setNotes]       = useState(row.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await upsertAnalyzerEntryApi({
        subject_user_id: row.user_id, quarter, year,
        value_scores: scores,
        gwc_get: get, gwc_want: want, gwc_capacity: capacity,
        notes,
      })
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally { setSaving(false) }
  }

  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || 'Unnamed'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[95vh]">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">{name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Q{quarter} {year} · People Analyzer</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}

          {/* Core values */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Core Values</h3>
            <div className="space-y-2">
              {values.length === 0 && (
                <p className="text-slate-500 text-sm">No core values configured yet. Add some from the page header.</p>
              )}
              {values.map(v => (
                <div key={v.id} className="bg-slate-700/40 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{v.name}</p>
                    {v.description && <p className="text-xs text-slate-400 mt-0.5">{v.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {VALUE_SCORES.map(s => (
                      <button
                        key={s}
                        onClick={() => setScores(prev => ({ ...prev, [v.id]: s }))}
                        className={`px-3 py-1.5 rounded border text-sm font-semibold transition-colors ${
                          scores[v.id] === s ? scoreColor(s) : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                        }`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GWC */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">GWC</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { key: 'get', label: 'Get it', value: get, set: setGet },
                { key: 'want', label: 'Want it', value: want, set: setWant },
                { key: 'capacity', label: 'Capacity to do it', value: capacity, set: setCapacity },
              ] as const).map(({ key, label, value, set }) => (
                <div key={key} className="bg-slate-700/40 rounded-lg px-3 py-3">
                  <p className="text-xs text-slate-400 mb-2">{label}</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => set(true)}
                      className={`flex-1 px-3 py-1.5 rounded border text-sm font-semibold transition-colors ${
                        value === true ? ynColor(true) : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                      }`}
                    >Yes</button>
                    <button
                      onClick={() => set(false)}
                      className={`flex-1 px-3 py-1.5 rounded border text-sm font-semibold transition-colors ${
                        value === false ? ynColor(false) : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                      }`}
                    >No</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Notes</h3>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, examples, follow-up actions…"
              className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Core Values Editor (drawer) ──────────────────────────────────────────────
interface ValuesEditorProps {
  values: CoreValue[]
  onClose: () => void
  onChanged: () => void
}

const ValuesEditor: React.FC<ValuesEditorProps> = ({ values, onClose, onChanged }) => {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const handleAdd = async () => {
    if (!newName.trim()) return
    await createCoreValueApi({ name: newName, description: newDesc, sort_order: values.length })
    setNewName(''); setNewDesc(''); setAdding(false)
    onChanged()
  }

  const handleRename = async (v: CoreValue, name: string, description: string) => {
    if (name === v.name && description === (v.description || '')) return
    await updateCoreValueApi(v.id, { name, description })
    onChanged()
  }

  const handleDelete = async (v: CoreValue) => {
    if (!confirm(`Archive "${v.name}"? Past evaluations keep their score.`)) return
    await deleteCoreValueApi(v.id)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-xl flex flex-col max-h-[95vh]">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-white font-semibold text-base">Core Values</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-2 flex-1">
          {values.map(v => (
            <CoreValueRow key={v.id} value={v} onRename={handleRename} onDelete={handleDelete} />
          ))}

          {adding ? (
            <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
              <input
                value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2"
              />
              <input
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(false)} className="text-slate-400 text-sm px-3 py-1.5 hover:text-white">Cancel</button>
                <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg">Add</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="w-full text-sm text-blue-400 hover:text-blue-300 border border-dashed border-slate-600 rounded-lg py-2.5">
              + Add core value
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const CoreValueRow: React.FC<{
  value: CoreValue
  onRename: (v: CoreValue, name: string, description: string) => void
  onDelete: (v: CoreValue) => void
}> = ({ value, onRename, onDelete }) => {
  const [name, setName] = useState(value.name)
  const [desc, setDesc] = useState(value.description || '')
  return (
    <div className="bg-slate-700/40 rounded-lg p-3 space-y-2">
      <input
        value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => onRename(value, name, desc)}
        className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2"
      />
      <input
        value={desc} onChange={(e) => setDesc(e.target.value)}
        onBlur={() => onRename(value, name, desc)}
        placeholder="Description"
        className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded px-3 py-2"
      />
      <div className="flex justify-end">
        <button onClick={() => onDelete(value)} className="text-xs text-red-400 hover:text-red-300">Archive</button>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
const PeopleAnalyzer: React.FC = () => {
  const now = new Date()
  const [quarter, setQuarter] = useState(currentQuarter(now))
  const [year, setYear] = useState(now.getFullYear())
  const [values, setValues] = useState<CoreValue[]>([])
  const [rows, setRows] = useState<PeopleAnalyzerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<PeopleAnalyzerRow | null>(null)
  const [valuesOpen, setValuesOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [vRes, rRes] = await Promise.all([
        listCoreValuesApi(),
        listAnalyzerEntriesApi(quarter, year),
      ])
      setValues(vRes.data)
      setRows(rRes.data)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally { setLoading(false) }
  }, [quarter, year])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    let right = 0, almost = 0, wrong = 0, none = 0
    for (const r of rows) {
      const v = verdict(r, values)
      if (v.label.startsWith('Right person, right seat')) right++
      else if (v.label.startsWith('Not')) none++
      else if (v.label.startsWith('Wrong person, wrong')) wrong++
      else almost++
    }
    return { right, almost, wrong, none }
  }, [rows, values])

  return (
    <>
      <Header
        title="People Analyzer"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={quarter}
              onChange={(e) => setQuarter(parseInt(e.target.value, 10))}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2"
            >
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => setValuesOpen(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2 rounded-lg"
            >Edit Values</button>
          </div>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill label="Right person, right seat" count={counts.right} color="text-green-400" />
          <StatPill label="Needs work"                count={counts.almost} color="text-yellow-400" />
          <StatPill label="Wrong fit"                 count={counts.wrong}  color="text-red-400" />
          <StatPill label="Not yet evaluated"         count={counts.none}   color="text-slate-400" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                  <th className="sticky left-0 bg-slate-800 px-4 py-3 text-left min-w-[180px]">Person</th>
                  {values.map(v => (
                    <th key={v.id} className="text-center px-2 py-3 min-w-[60px]">{v.name}</th>
                  ))}
                  <th className="text-center px-2 py-3" title="Get it">G</th>
                  <th className="text-center px-2 py-3" title="Want it">W</th>
                  <th className="text-center px-2 py-3" title="Capacity">C</th>
                  <th className="text-left px-3 py-3 min-w-[180px]">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {rows.map(row => {
                  const v = verdict(row, values)
                  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || 'Unnamed'
                  return (
                    <tr key={row.user_id}
                      onClick={() => setEditing(row)}
                      className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                    >
                      <td className="sticky left-0 bg-slate-800 px-4 py-3 whitespace-nowrap">
                        <p className="text-white font-medium text-xs">{name}</p>
                        <p className="text-slate-500 text-[10px] capitalize">{row.role} · {row.team}{row.roster_only ? ' · roster' : ''}</p>
                      </td>
                      {values.map(cv => {
                        const s = (row.value_scores || {})[cv.id]
                        return (
                          <td key={cv.id} className="text-center px-2 py-3">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded border text-xs font-semibold ${scoreColor(s)}`}>
                              {s || '·'}
                            </span>
                          </td>
                        )
                      })}
                      <td className="text-center px-2 py-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded border text-xs font-semibold ${ynColor(row.gwc_get)}`}>
                          {row.gwc_get === true ? 'Y' : row.gwc_get === false ? 'N' : '·'}
                        </span>
                      </td>
                      <td className="text-center px-2 py-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded border text-xs font-semibold ${ynColor(row.gwc_want)}`}>
                          {row.gwc_want === true ? 'Y' : row.gwc_want === false ? 'N' : '·'}
                        </span>
                      </td>
                      <td className="text-center px-2 py-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded border text-xs font-semibold ${ynColor(row.gwc_capacity)}`}>
                          {row.gwc_capacity === true ? 'Y' : row.gwc_capacity === false ? 'N' : '·'}
                        </span>
                      </td>
                      <td className={`px-3 py-3 text-xs font-medium ${v.color}`}>{v.label}</td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={values.length + 5} className="text-center py-10 text-slate-500 text-sm">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          row={editing}
          values={values}
          quarter={quarter}
          year={year}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {valuesOpen && (
        <ValuesEditor
          values={values}
          onClose={() => setValuesOpen(false)}
          onChanged={load}
        />
      )}
    </>
  )
}

const StatPill: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
    <p className={`text-2xl font-bold ${color}`}>{count}</p>
    <p className="text-xs text-slate-400 mt-1">{label}</p>
  </div>
)

export default PeopleAnalyzer

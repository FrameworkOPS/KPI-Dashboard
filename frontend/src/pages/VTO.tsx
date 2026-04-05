import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import { getVTOApi, updateVTOSectionApi } from '../services/api'
import { VTOSection } from '../types'

// Section definitions
const SECTIONS = [
  {
    key: 'core_values',
    title: 'Core Values',
    description: 'The non-negotiable principles that define your culture.',
    fields: [
      { key: 'values', label: 'Core Values (one per line)', type: 'textarea' },
    ],
  },
  {
    key: 'core_focus',
    title: 'Core Focus',
    description: 'Your company\'s reason for being.',
    fields: [
      { key: 'purpose', label: 'Purpose / Cause / Passion', type: 'textarea' },
      { key: 'niche', label: 'Our Niche (what we do best)', type: 'textarea' },
    ],
  },
  {
    key: 'ten_year_target',
    title: '10-Year Target',
    description: 'Your big, audacious goal for the next decade.',
    fields: [
      { key: 'target', label: '10-Year Target Statement', type: 'textarea' },
    ],
  },
  {
    key: 'marketing_strategy',
    title: 'Marketing Strategy',
    description: 'How you attract and retain your ideal customers.',
    fields: [
      { key: 'target_market', label: 'Target Market (The Sweet Spot)', type: 'textarea' },
      { key: 'three_uniques', label: '3 Uniques', type: 'textarea' },
      { key: 'proven_process', label: 'Proven Process', type: 'textarea' },
      { key: 'guarantee', label: 'Guarantee', type: 'textarea' },
    ],
  },
  {
    key: 'three_year_picture',
    title: '3-Year Picture',
    description: 'A vivid description of what your business looks like in 3 years.',
    fields: [
      { key: 'revenue', label: 'Revenue Target', type: 'text' },
      { key: 'profit', label: 'Profit Target', type: 'text' },
      { key: 'measurables', label: 'Measurables (key numbers)', type: 'textarea' },
      { key: 'looks_like', label: 'What does it look like?', type: 'textarea' },
    ],
  },
  {
    key: 'one_year_plan',
    title: '1-Year Plan',
    description: 'Your concrete goals for this year.',
    fields: [
      { key: 'revenue', label: 'Revenue Goal', type: 'text' },
      { key: 'profit', label: 'Profit Goal', type: 'text' },
      { key: 'measurables', label: 'Measurables', type: 'textarea' },
      { key: 'goals', label: '3–7 Goals for the Year (one per line)', type: 'textarea' },
    ],
  },
]

interface SectionCardProps {
  sectionDef: typeof SECTIONS[0]
  data: VTOSection | undefined
  onSaved: () => void
}

const SectionCard: React.FC<SectionCardProps> = ({ sectionDef, data, onSaved }) => {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const startEdit = () => {
    const current: Record<string, string> = {}
    sectionDef.fields.forEach((f) => {
      current[f.key] = data?.content?.[f.key] || ''
    })
    setForm(current)
    setEditing(true)
    setError('')
  }

  const cancelEdit = () => {
    setEditing(false)
    setError('')
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateVTOSectionApi(sectionDef.key, form)
      onSaved()
      setEditing(false)
    } catch (e: any) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  const hasContent = data && Object.values(data.content || {}).some((v) => v && String(v).trim())

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      <div className="px-5 py-4 border-b border-slate-700 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{sectionDef.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{sectionDef.description}</p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex-shrink-0 text-slate-400 hover:text-blue-400 transition-colors p-1 rounded"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      <div className="p-5">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm mb-3">{error}</div>}
        {editing ? (
          <div className="space-y-4">
            {sectionDef.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-slate-400 mb-1">{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={4}
                    className={inputCls}
                    value={form[field.key] || ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={`Enter ${field.label.toLowerCase()}…`}
                  />
                ) : (
                  <input
                    type="text"
                    className={inputCls}
                    value={form[field.key] || ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={`Enter ${field.label.toLowerCase()}…`}
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={cancelEdit} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : hasContent ? (
          <div className="space-y-3">
            {sectionDef.fields.map((field) => {
              const val = data?.content?.[field.key]
              if (!val) return null
              return (
                <div key={field.key}>
                  <p className="text-xs font-medium text-slate-400 mb-1">{field.label}</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{val}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500 text-sm mb-3">No content yet.</p>
            <button onClick={startEdit} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              + Add content
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const VTO: React.FC = () => {
  const [sections, setSections] = useState<VTOSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadVTO = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getVTOApi()
      setSections(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVTO() }, [loadVTO])

  return (
    <>
      <Header title="Vision / Traction Organizer" />
      <div className="p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {SECTIONS.map((sectionDef) => (
              <SectionCard
                key={sectionDef.key}
                sectionDef={sectionDef}
                data={sections.find((s) => s.section_key === sectionDef.key)}
                onSaved={loadVTO}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default VTO

import React, { useEffect, useRef, useState } from 'react'
import { createIssueApi, createTodoApi, getUsersApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { User } from '../types'

type Mode = 'issue' | 'todo'

const TEAMS = ['leadership', 'sales', 'production', 'office'] as const

export default function QuickAdd() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('issue')
  const [users, setUsers] = useState<User[]>([])
  const [title, setTitle] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [team, setTeam] = useState<string>(user?.team || 'leadership')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // Load users once when first opened
  useEffect(() => {
    if (open && users.length === 0) {
      getUsersApi().then(r => setUsers(r.data || [])).catch(() => {})
    }
  }, [open])

  // Focus title on open
  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus(), 80)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const reset = () => {
    setTitle('')
    setOwnerId('')
    setPriority('medium')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      if (mode === 'issue') {
        await createIssueApi({
          title: title.trim(),
          team,
          priority,
          owner_id: ownerId || null,
          status: 'open',
        })
        setFlash('Issue added')
      } else {
        await createTodoApi({
          title: title.trim(),
          team,
          owner_id: ownerId || null,
          status: 'pending',
          due_date: null,
        })
        setFlash('To-Do added')
      }
      reset()
      setTimeout(() => { setFlash(null) }, 2000)
    } catch {
      setFlash('Failed — try again')
      setTimeout(() => setFlash(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">

      {/* Popover panel */}
      {open && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-80 p-4 mb-1">
          {/* Mode toggle */}
          <div className="flex gap-1 mb-4 bg-slate-900 rounded-lg p-1">
            {(['issue', 'todo'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); reset() }}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize ${
                  mode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'issue' ? 'Issue' : 'To-Do'}
              </button>
            ))}
          </div>

          {flash && (
            <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium text-center ${
              flash.includes('Failed') ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'
            }`}>{flash}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input
                ref={titleRef}
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={mode === 'issue' ? 'Issue title…' : 'To-do title…'}
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase tracking-wide">Assign to</label>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.filter(u => u.active).map(u => (
                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase tracking-wide">Team</label>
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TEAMS.map(t => (
                    <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            {mode === 'issue' && (
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase tracking-wide">Priority</label>
                <div className="flex gap-1">
                  {(['high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-1 rounded text-xs font-medium transition-colors capitalize ${
                        priority === p
                          ? p === 'high' ? 'bg-red-600 text-white'
                            : p === 'medium' ? 'bg-yellow-600 text-white'
                            : 'bg-slate-500 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${mode === 'issue' ? 'Issue' : 'To-Do'}`}
            </button>
          </form>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Quick add issue or to-do"
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-slate-700 text-slate-300 rotate-45'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}

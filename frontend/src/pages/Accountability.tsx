import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Header from '../components/Header'
import {
  getAccountabilityApi,
  createSeatApi,
  updateSeatApi,
  deleteSeatApi,
  getUsersApi,
  listSeatDocumentsApi,
  uploadSeatDocumentApi,
  deleteSeatDocumentApi,
} from '../services/api'
import { AccountabilitySeat, SeatDocument, User } from '../types'
import { useAuthStore } from '../store/authStore'

// ── Tree helpers ──────────────────────────────────────────────────────────────

function buildTree(seats: AccountabilitySeat[]): AccountabilitySeat[] {
  const map: Record<string, AccountabilitySeat> = {}
  const roots: AccountabilitySeat[] = []
  seats.forEach((s) => { map[s.id] = { ...s, children: [] } })
  seats.forEach((s) => {
    if (s.parent_seat_id && map[s.parent_seat_id]) {
      map[s.parent_seat_id].children!.push(map[s.id])
    } else {
      roots.push(map[s.id])
    }
  })
  const sortRec = (n: AccountabilitySeat) => {
    n.children!.sort((a, b) => a.sort_order - b.sort_order || a.seat_name.localeCompare(b.seat_name))
    n.children!.forEach(sortRec)
  }
  roots.sort((a, b) => a.sort_order - b.sort_order)
  roots.forEach(sortRec)
  return roots
}

function ownerLabel(seat: AccountabilitySeat, users: User[]): { name: string | null; initials: string | null } {
  const u = users.find((x) => x.id === seat.owner_id)
  const first = u?.first_name || seat.owner?.first_name || seat.owner_first_name || null
  const last  = u?.last_name  || seat.owner?.last_name  || seat.owner_last_name  || null
  if (!first && !last) return { name: null, initials: null }
  const name = `${first || ''} ${last || ''}`.trim()
  const initials = `${(first?.[0] || '').toUpperCase()}${(last?.[0] || '').toUpperCase()}` || null
  return { name, initials }
}

// ── Detail panel — name, owner, 5 duties, documents ───────────────────────────

interface SeatDetailProps {
  seat: AccountabilitySeat
  allSeats: AccountabilitySeat[]
  users: User[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
  onDelete: (id: string) => void
}

const SeatDetail: React.FC<SeatDetailProps> = ({ seat, allSeats, users, canEdit, onClose, onChanged, onDelete }) => {
  const [name, setName] = useState(seat.seat_name)
  const [description, setDescription] = useState(seat.seat_description || '')
  const [ownerId, setOwnerId] = useState(seat.owner_id || '')
  const [parentId, setParentId] = useState(seat.parent_seat_id || '')
  // Always render 5 duty rows; blanks are stripped on save.
  const initialDuties = (() => {
    const d = [...(seat.responsibilities || [])]
    while (d.length < 5) d.push('')
    return d.slice(0, 5)
  })()
  const [duties, setDuties] = useState<string[]>(initialDuties)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [docs, setDocs] = useState<SeatDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    setDocsLoading(true)
    try {
      const r = await listSeatDocumentsApi(seat.id)
      setDocs(r.data)
    } catch { /* ignore */ }
    setDocsLoading(false)
  }, [seat.id])

  useEffect(() => { loadDocs() }, [loadDocs])

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await updateSeatApi(seat.id, {
        seat_name: name.trim() || seat.seat_name,
        seat_description: description.trim() || null,
        owner_id: ownerId || null,
        parent_seat_id: parentId || null,
        responsibilities: duties.map((d) => d.trim()).filter(Boolean),
      })
      onChanged()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError(null)
    try {
      await uploadSeatDocumentApi(seat.id, file)
      await loadDocs()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeDoc = async (docId: string) => {
    if (!confirm('Delete this document?')) return
    try {
      await deleteSeatDocumentApi(docId)
      setDocs((prev) => prev.filter((d) => d.id !== docId))
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Seat Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}

          {/* Seat name + owner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Seat Name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Seat Holder</label>
              <select className={inputCls} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={!canEdit}>
                <option value="">— Open Seat —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} placeholder="One-line description of this seat" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Reports To</label>
            <select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!canEdit}>
              <option value="">— Top Level —</option>
              {allSeats.filter((s) => s.id !== seat.id).map((s) => (
                <option key={s.id} value={s.id}>{s.seat_name}</option>
              ))}
            </select>
          </div>

          {/* 5 main duties */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Five Main Duties</label>
            <div className="space-y-2">
              {duties.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-4 text-right">{i + 1}.</span>
                  <input
                    className={inputCls}
                    value={d}
                    onChange={(e) => {
                      const next = [...duties]; next[i] = e.target.value; setDuties(next)
                    }}
                    placeholder={`Duty ${i + 1}`}
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-400">Documents</label>
              {canEdit && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onUpload(f)
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : '+ Upload file'}
                  </button>
                </>
              )}
            </div>
            {docsLoading ? (
              <p className="text-xs text-slate-500">Loading documents…</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No documents attached.</p>
            ) : (
              <ul className="space-y-1">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 bg-slate-700/40 rounded px-3 py-2">
                    <div className="min-w-0 flex-1">
                      {d.download_url ? (
                        <a href={d.download_url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300 truncate block">
                          {d.file_name}
                        </a>
                      ) : (
                        <span className="text-sm text-slate-300 truncate block">{d.file_name}</span>
                      )}
                      <p className="text-[10px] text-slate-500">
                        {d.file_size ? `${(d.file_size / 1024).toFixed(0)} KB · ` : ''}
                        {d.uploaded_by_name ? `by ${d.uploaded_by_name}` : ''}
                      </p>
                    </div>
                    {canEdit && (
                      <button onClick={() => removeDoc(d.id)} className="text-slate-500 hover:text-red-400 p-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-700 flex-shrink-0">
          {canEdit ? (
            <button onClick={() => onDelete(seat.id)} className="text-red-400 hover:text-red-300 text-sm">
              Delete Seat
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Close</button>
            {canEdit && (
              <button onClick={save} disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add-seat modal ────────────────────────────────────────────────────────────

interface AddSeatModalProps {
  defaultParentId?: string | null
  allSeats: AccountabilitySeat[]
  users: User[]
  onClose: () => void
  onCreated: () => void
}

const AddSeatModal: React.FC<AddSeatModalProps> = ({ defaultParentId, allSeats, users, onClose, onCreated }) => {
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [parentId, setParentId] = useState(defaultParentId || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      await createSeatApi({
        seat_name: name.trim(),
        owner_id: ownerId || null,
        parent_seat_id: parentId || null,
        responsibilities: [],
      })
      onCreated(); onClose()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">New Seat</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Seat Name *</label>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Seat Holder</label>
            <select className={inputCls} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">— Open Seat —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Reports To</label>
            <select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Top Level —</option>
              {allSeats.map((s) => <option key={s.id} value={s.id}>{s.seat_name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tree node — vertical family-tree style, expandable ────────────────────────

interface SeatNodeProps {
  seat: AccountabilitySeat
  users: User[]
  expanded: Record<string, boolean>
  toggleExpand: (id: string) => void
  onSelect: (s: AccountabilitySeat) => void
  onAddChild: (parentId: string) => void
  canEdit: boolean
}

const SeatNode: React.FC<SeatNodeProps> = ({ seat, users, expanded, toggleExpand, onSelect, onAddChild, canEdit }) => {
  const isOpen = expanded[seat.id] !== false // default expanded
  const hasChildren = (seat.children?.length ?? 0) > 0
  const owner = ownerLabel(seat, users)
  const duties = (seat.responsibilities || []).slice(0, 5)

  return (
    <li className="flex flex-col items-center">
      {/* Node card */}
      <div className="flex flex-col items-center">
        <div
          onClick={() => onSelect(seat)}
          className="bg-slate-800 hover:bg-slate-700/70 border border-slate-700 rounded-xl shadow-sm cursor-pointer transition-colors w-64 group"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-700/50">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
              owner.initials ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-500 border border-dashed border-slate-500'
            }`}>
              {owner.initials || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{seat.seat_name}</p>
              <p className={`text-[11px] truncate ${owner.name ? 'text-slate-400' : 'text-slate-500 italic'}`}>
                {owner.name || 'Open seat'}
              </p>
            </div>
            {hasChildren && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(seat.id) }}
                title={isOpen ? 'Collapse' : 'Expand'}
                className="text-slate-500 hover:text-blue-400 p-1"
              >
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
          {duties.length > 0 && (
            <ul className="px-4 py-2 space-y-0.5">
              {duties.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-500 truncate">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span className="truncate">{d}</span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="px-4 py-2 border-t border-slate-700/50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onAddChild(seat.id) }}
                className="text-[11px] text-slate-400 hover:text-blue-400"
              >
                + Add report
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(seat) }}
                className="text-[11px] text-slate-400 hover:text-blue-400"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Vertical connector + children row */}
      {hasChildren && isOpen && (
        <>
          <div className="w-px h-6 bg-slate-600" />
          <ul className="flex justify-center items-start gap-6 relative">
            {/* Horizontal connector across siblings */}
            {seat.children!.length > 1 && (
              <div className="absolute top-0 left-0 right-0 h-px bg-slate-600"
                style={{ left: '8rem', right: '8rem' }} />
            )}
            {seat.children!.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* short vertical drop from horizontal bar to each child */}
                <div className="w-px h-3 bg-slate-600" />
                <SeatNode
                  seat={child}
                  users={users}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
                  canEdit={canEdit}
                />
              </div>
            ))}
          </ul>
        </>
      )}
    </li>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const Accountability: React.FC = () => {
  const { user } = useAuthStore()
  const [seats, setSeats] = useState<AccountabilitySeat[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AccountabilitySeat | null>(null)
  const [addParentId, setAddParentId] = useState<string | null | undefined>(undefined)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const canEdit = user?.role === 'admin' || user?.role === 'leadership'

  const loadData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [seatsRes, usersRes] = await Promise.all([getAccountabilityApi(), getUsersApi()])
      // Flatten the server tree into a flat list (it returns roots) — easier to rebuild client-side.
      const flat: AccountabilitySeat[] = []
      const walk = (nodes: AccountabilitySeat[]) => {
        for (const n of nodes) {
          flat.push({ ...n, children: undefined })
          if (n.children) walk(n.children)
        }
      }
      walk(seatsRes.data)
      setSeats(flat)
      setUsers(usersRes.data)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this seat? Reports will be re-parented to its parent.')) return
    try {
      await deleteSeatApi(id)
      setSelected(null)
      await loadData()
    } catch (e: any) { setError(e.message) }
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] !== false) }))
  }

  const expandAll = () => {
    const m: Record<string, boolean> = {}
    seats.forEach((s) => { m[s.id] = true })
    setExpanded(m)
  }
  const collapseAll = () => {
    const m: Record<string, boolean> = {}
    seats.forEach((s) => { m[s.id] = false })
    setExpanded(m)
  }

  const tree = useMemo(() => buildTree(seats), [seats])

  // Keep the open detail panel in sync after refresh
  useEffect(() => {
    if (selected) {
      const refreshed = seats.find((s) => s.id === selected.id)
      if (refreshed) setSelected(refreshed)
    }
  }, [seats])

  return (
    <>
      <Header
        title="Accountability Chart"
        actions={
          canEdit && (
            <div className="flex gap-2">
              <button onClick={expandAll} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium px-3 py-2 rounded-lg">Expand all</button>
              <button onClick={collapseAll} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium px-3 py-2 rounded-lg">Collapse all</button>
              <button
                onClick={() => setAddParentId(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Seat
              </button>
            </div>
          )
        }
      />

      <div className="p-4 md:p-6">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-sm mb-3">No seats defined yet.</p>
            {canEdit && (
              <button onClick={() => setAddParentId(null)} className="text-blue-400 hover:text-blue-300 text-sm">
                + Add the first seat
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto pb-6">
            <ul className="flex justify-center items-start gap-10 min-w-max px-6">
              {tree.map((root) => (
                <SeatNode
                  key={root.id}
                  seat={root}
                  users={users}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  onSelect={setSelected}
                  onAddChild={(pid) => setAddParentId(pid)}
                  canEdit={canEdit}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {selected && (
        <SeatDetail
          seat={selected}
          allSeats={seats}
          users={users}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onChanged={loadData}
          onDelete={handleDelete}
        />
      )}

      {addParentId !== undefined && (
        <AddSeatModal
          defaultParentId={addParentId}
          allSeats={seats}
          users={users}
          onClose={() => setAddParentId(undefined)}
          onCreated={loadData}
        />
      )}
    </>
  )
}

export default Accountability

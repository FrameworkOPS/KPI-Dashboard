import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import {
  getAccountabilityApi,
  createSeatApi,
  updateSeatApi,
  deleteSeatApi,
  getUsersApi,
} from '../services/api'
import { AccountabilitySeat, User } from '../types'
import { useAuthStore } from '../store/authStore'

// Build a tree from flat list
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
  return roots
}

interface SeatModalProps {
  seat?: AccountabilitySeat | null
  allSeats: AccountabilitySeat[]
  users: User[]
  onClose: () => void
  onSave: () => void
}

const SeatModal: React.FC<SeatModalProps> = ({ seat, allSeats, users, onClose, onSave }) => {
  const [form, setForm] = useState({
    seat_name: seat?.seat_name || '',
    seat_description: seat?.seat_description || '',
    owner_id: seat?.owner_id || '',
    parent_seat_id: seat?.parent_seat_id || '',
    responsibilities: (seat?.responsibilities || []).join('\n'),
    sort_order: seat?.sort_order ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        owner_id: form.owner_id || null,
        parent_seat_id: form.parent_seat_id || null,
        responsibilities: form.responsibilities.split('\n').map((r) => r.trim()).filter(Boolean),
      }
      if (seat) {
        await updateSeatApi(seat.id, payload)
      } else {
        await createSeatApi(payload)
      }
      onSave()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{seat ? 'Edit Seat' : 'New Seat'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Seat Name *</label>
            <input required className={inputCls} value={form.seat_name} onChange={(e) => setForm({ ...form, seat_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <input className={inputCls} value={form.seat_description} onChange={(e) => setForm({ ...form, seat_description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Owner</label>
              <select className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value="">— Open —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Reports To</label>
              <select className={inputCls} value={form.parent_seat_id} onChange={(e) => setForm({ ...form, parent_seat_id: e.target.value })}>
                <option value="">— Top Level —</option>
                {allSeats.filter((s) => s.id !== seat?.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.seat_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Responsibilities (one per line)</label>
            <textarea rows={4} className={inputCls} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} placeholder="Responsibility 1&#10;Responsibility 2&#10;Responsibility 3" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Sort Order</label>
            <input type="number" className={inputCls} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : seat ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface SeatNodeProps {
  seat: AccountabilitySeat
  users: User[]
  allSeats: AccountabilitySeat[]
  depth: number
  onEdit: (seat: AccountabilitySeat) => void
  onDelete: (id: string) => void
}

const SeatNode: React.FC<SeatNodeProps> = ({ seat, users, allSeats, depth, onEdit, onDelete }) => {
  const { user: authUser } = useAuthStore()
  const ownerUser = users.find((u) => u.id === seat.owner_id)
  const ownerName = ownerUser
    ? `${ownerUser.first_name} ${ownerUser.last_name}`
    : seat.owner
    ? `${seat.owner.first_name} ${seat.owner.last_name}`
    : null
  const initials = ownerUser
    ? `${ownerUser.first_name[0]}${ownerUser.last_name[0]}`
    : null

  const canEdit = authUser?.role === 'admin' || authUser?.role === 'leadership'

  return (
    <div className={`${depth > 0 ? 'ml-8 mt-3' : 'mt-4'} relative`}>
      {depth > 0 && (
        <div className="absolute -left-4 top-5 w-4 h-px bg-slate-600" />
      )}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 relative group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
              ownerUser ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 border border-dashed border-slate-500'
            }`}>
              {initials || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{seat.seat_name}</p>
              <p className={`text-xs mt-0.5 ${ownerName ? 'text-slate-400' : 'text-slate-600 italic'}`}>
                {ownerName || 'Open Seat'}
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => onEdit(seat)} className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={() => onDelete(seat.id)} className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {seat.responsibilities && seat.responsibilities.length > 0 && (
          <ul className="mt-3 space-y-1">
            {seat.responsibilities.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                <span className="text-blue-500 mt-0.5">•</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
      {seat.children && seat.children.length > 0 && (
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-700" style={{ marginLeft: '-0.5px' }} />
          {seat.children
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((child) => (
              <SeatNode
                key={child.id}
                seat={child}
                users={users}
                allSeats={allSeats}
                depth={depth + 1}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
        </div>
      )}
    </div>
  )
}

const Accountability: React.FC = () => {
  const { user } = useAuthStore()
  const [seats, setSeats] = useState<AccountabilitySeat[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editSeat, setEditSeat] = useState<AccountabilitySeat | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [seatsRes, usersRes] = await Promise.all([getAccountabilityApi(), getUsersApi()])
      setSeats(seatsRes.data)
      setUsers(usersRes.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this seat?')) return
    try {
      await deleteSeatApi(id)
      await loadData()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const canEdit = user?.role === 'admin' || user?.role === 'leadership'
  const tree = buildTree(seats)

  return (
    <>
      <Header
        title="Accountability Chart"
        actions={
          canEdit && (
            <button
              onClick={() => { setEditSeat(null); setShowModal(true) }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Seat
            </button>
          )
        }
      />
      <div className="p-4 md:p-6">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : seats.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-sm mb-3">No seats defined yet.</p>
            {canEdit && (
              <button onClick={() => { setEditSeat(null); setShowModal(true) }} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
                + Add the first seat
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-8 overflow-x-auto pb-4">
            {tree
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((seat) => (
                <div key={seat.id} className="min-w-[280px]">
                  <SeatNode
                    seat={seat}
                    users={users}
                    allSeats={seats}
                    depth={0}
                    onEdit={(s) => { setEditSeat(s); setShowModal(true) }}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
          </div>
        )}
      </div>
      {showModal && (
        <SeatModal
          seat={editSeat}
          allSeats={seats}
          users={users}
          onClose={() => setShowModal(false)}
          onSave={loadData}
        />
      )}
    </>
  )
}

export default Accountability

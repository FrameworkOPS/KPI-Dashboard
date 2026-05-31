import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import {
  getUsersApi,
  createUserApi,
  updateUserApi,
  resendInviteApi,
} from '../services/api'
import { User } from '../types'

interface UserModalProps {
  user?: User | null
  onClose: () => void
  onSave: () => void
}

const UserModal: React.FC<UserModalProps> = ({ user, onClose, onSave }) => {
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    password: '',
    role: (user?.role || 'team_member') as User['role'],
    team: (user?.team || 'sales') as User['team'],
    active: user?.active ?? true,
  })
  const [invite, setInvite] = useState(!user) // new users default to email invitation
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setWarning('')
    try {
      if (user) {
        const payload: any = { ...form }
        if (!payload.password) delete payload.password
        await updateUserApi(user.id, payload)
        onSave()
        onClose()
      } else if (invite) {
        const res = await createUserApi({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          team: form.team,
          invite: true,
        })
        onSave()
        if (res.data?.email_warning) setWarning(res.data.email_warning)
        else onClose()
      } else {
        await createUserApi({ ...form })
        onSave()
        onClose()
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{user ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          {warning && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-sm">
              {warning}
              <button type="button" onClick={onClose} className="ml-2 underline">Close</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">First Name *</label>
              <input required className={inputCls} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Last Name *</label>
              <input required className={inputCls} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email *</label>
            <input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {!user && (
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={invite}
                onChange={(e) => setInvite(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
              />
              Send email invitation (user sets their own password)
            </label>
          )}
          {!(invite && !user) && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Password {user ? '(leave blank to keep current)' : '*'}
              </label>
              <input
                type="password"
                required={!user}
                className={inputCls}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={user ? '••••••••' : 'Minimum 6 characters'}
              />
            </div>
          )}
          {invite && !user && (
            <p className="text-xs text-slate-500">
              An invitation email with a link to set a password (and the team's meeting link) will be sent to this address.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
              <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}>
                <option value="admin">Admin</option>
                <option value="leadership">Leadership</option>
                <option value="manager">Manager</option>
                <option value="team_member">Team Member</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Team</label>
              <select className={inputCls} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value as User['team'] })}>
                <option value="sales">Sales</option>
                <option value="production">Production</option>
                <option value="office">Office</option>
                <option value="leadership">Leadership</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, active: !form.active })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.active ? 'bg-blue-600' : 'bg-slate-600'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${form.active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <label className="text-sm text-slate-300">{form.active ? 'Active' : 'Inactive'}</label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : user ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [search, setSearch] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getUsersApi()
      setUsers(res.data)
    } catch (e: any) {
      const status = e.response?.status
      if (status === 403) setError('Access denied — admin role required.')
      else if (status === 404) setError('User management API not available. Ensure the latest deploy is active.')
      else setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleToggleActive = async (user: User) => {
    try {
      await updateUserApi(user.id, { active: !user.active })
      await loadUsers()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleResend = async (user: User) => {
    setError(null)
    setNotice(null)
    try {
      await resendInviteApi(user.id)
      setNotice(`Invitation re-sent to ${user.email}.`)
      setTimeout(() => setNotice(null), 5000)
      await loadUsers()
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const filtered = users.filter((u) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q)
    )
  })

  return (
    <>
      <Header
        title="User Management"
        actions={
          <button
            onClick={() => { setEditUser(null); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}
        {notice && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm">{notice}</div>}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <p className="text-xs text-slate-500">{filtered.length} users</p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Team</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Active</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map((u) => {
                  const initials = `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase()
                  return (
                    <tr key={u.id} className={`hover:bg-slate-700/20 transition-colors ${!u.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-white">{initials}</span>
                          </div>
                          <span className="text-white font-medium">{u.first_name || ''} {u.last_name || ''}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={u.role} />
                          {u.invited && <StatusBadge status="invited" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 capitalize">{u.team}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${u.active ? 'bg-blue-600' : 'bg-slate-600'}`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${u.active ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {u.invited && (
                            <button
                              onClick={() => handleResend(u)}
                              title="Resend invitation"
                              className="text-slate-400 hover:text-amber-400 transition-colors p-1 rounded text-xs font-medium"
                            >
                              Resend
                            </button>
                          )}
                          <button
                            onClick={() => { setEditUser(u); setShowModal(true) }}
                            title="Edit user"
                            className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <UserModal
          user={editUser}
          onClose={() => setShowModal(false)}
          onSave={loadUsers}
        />
      )}
    </>
  )
}

export default UserManagement

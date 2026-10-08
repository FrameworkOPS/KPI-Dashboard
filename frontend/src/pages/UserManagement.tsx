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
import { TEAM_VALUES } from '../utils/teams'
import { useAuthStore } from '../store/authStore'
import { useDialog } from '../components/useDialog'

interface UserModalProps {
  user?: User | null
  /** True when the row being edited is the signed-in admin. */
  isSelf: boolean
  onClose: () => void
  onSave: () => void
}

const UserModal: React.FC<UserModalProps> = ({ user, isSelf, onClose, onSave }) => {
  const dialogRef = useDialog<HTMLDivElement>(onClose)
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
  const [rosterOnly, setRosterOnly] = useState(user?.roster_only ?? false)
  const [jobDuties, setJobDuties] = useState((user?.job_duties || []).join('\n'))
  // Multi-team membership. Defaults to the user's existing team list, or just
  // the primary team for new users. The primary `team` is always the first.
  const [teams, setTeams] = useState<User['team'][]>(
    user?.teams && user.teams.length ? user.teams : [(user?.team as User['team']) || 'sales']
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setWarning('')
    try {
      const duties = jobDuties.split('\n').map((s) => s.trim()).filter(Boolean)
      const teamsPayload = teams.length ? teams : [form.team]
      const primaryTeam = teamsPayload[0]
      if (user) {
        const payload: any = { ...form, team: primaryTeam, teams: teamsPayload, roster_only: rosterOnly, job_duties: duties }
        if (rosterOnly) payload.email = null
        if (!payload.password) delete payload.password
        await updateUserApi(user.id, payload)
        onSave()
        onClose()
      } else if (rosterOnly) {
        await createUserApi({
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          team: primaryTeam,
          teams: teamsPayload,
          roster_only: true,
          job_duties: duties,
        })
        onSave()
        onClose()
      } else if (invite) {
        const res = await createUserApi({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          team: primaryTeam,
          teams: teamsPayload,
          job_duties: duties,
          invite: true,
        })
        onSave()
        if (res.data?.email_warning) setWarning(res.data.email_warning)
        else onClose()
      } else {
        await createUserApi({ ...form, team: primaryTeam, teams: teamsPayload, job_duties: duties })
        onSave()
        onClose()
      }
    } catch (e: any) {
      setError(e.message || 'Could not save this user')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="user-modal-title"
        className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 id="user-modal-title" className="text-base font-semibold text-white">{user ? 'Edit User' : 'New User'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
          {warning && (
            <div role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-sm">
              {warning}
              <button type="button" onClick={onClose} className="ml-2 underline min-h-[44px]">Close</button>
            </div>
          )}
          {isSelf && (
            <p className="text-xs text-slate-400 bg-slate-700/30 border border-slate-700 rounded-lg px-3 py-2">
              You are editing your own account. Your role and active status can only be changed by another admin.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer bg-slate-700/30 border border-slate-700 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={rosterOnly}
              onChange={(e) => setRosterOnly(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="font-medium">Roster only (no login)</span>
              <span className="block text-xs text-slate-400">
                Track this person on the org chart without giving them an account. No email or password required.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="user-first-name" className="block text-xs font-medium text-slate-400 mb-1">First Name *</label>
              <input id="user-first-name" required autoComplete="off" className={inputCls} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="user-last-name" className="block text-xs font-medium text-slate-400 mb-1">Last Name *</label>
              <input id="user-last-name" required autoComplete="off" className={inputCls} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          {!rosterOnly && (
            <div>
              <label htmlFor="user-email" className="block text-xs font-medium text-slate-400 mb-1">Email *</label>
              <input id="user-email" required={!rosterOnly} type="email" autoComplete="off" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          )}
          {!user && !rosterOnly && (
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
          {!rosterOnly && !(invite && !user) && (
            <div>
              <label htmlFor="user-password" className="block text-xs font-medium text-slate-400 mb-1">
                Password {user ? '(leave blank to keep current)' : '*'}
              </label>
              <input
                id="user-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required={!user && !rosterOnly}
                className={inputCls}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={user ? '••••••••' : 'Minimum 6 characters'}
              />
            </div>
          )}
          {invite && !user && !rosterOnly && (
            <p className="text-xs text-slate-400">
              An invitation email with a link to set a password (and the team's meeting link) will be sent to this address.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="user-role" className="block text-xs font-medium text-slate-400 mb-1">Role</label>
              <select id="user-role" className={inputCls} value={form.role} disabled={isSelf} onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}>
                <option value="admin">Admin</option>
                <option value="leadership">Leadership</option>
                <option value="manager">Manager</option>
                <option value="team_member">Team Member</option>
              </select>
            </div>
            <fieldset>
              <legend className="block text-xs font-medium text-slate-400 mb-1">Teams</legend>
              <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 space-y-1.5">
                {([...TEAM_VALUES, 'all'] as const).map((t) => {
                  const checked = teams.includes(t)
                  const isPrimary = teams[0] === t
                  return (
                    <label key={t} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = teams.includes(t) ? teams : [...teams, t]
                            setTeams(next)
                            setForm({ ...form, team: next[0] })
                          } else {
                            const next = teams.filter((x) => x !== t)
                            setTeams(next)
                            if (next[0]) setForm({ ...form, team: next[0] })
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="capitalize">{t}</span>
                      {isPrimary && teams.length > 1 && (
                        <span className="text-[11px] text-blue-400 ml-1">(primary)</span>
                      )}
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">First team checked is the primary team.</p>
            </fieldset>
          </div>
          <div>
            <label htmlFor="user-duties" className="block text-xs font-medium text-slate-400 mb-1">Job Duties (one per line)</label>
            <textarea
              id="user-duties"
              rows={4}
              className={inputCls}
              value={jobDuties}
              onChange={(e) => setJobDuties(e.target.value)}
              placeholder={'Duty 1\nDuty 2\nDuty 3'}
            />
          </div>
          {user && !rosterOnly && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                aria-label="Account active"
                disabled={isSelf}
                onClick={() => setForm({ ...form, active: !form.active })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed ${form.active ? 'bg-blue-600' : 'bg-slate-600'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${form.active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-slate-300">{form.active ? 'Active' : 'Inactive'}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 min-h-[44px] rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : user ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const UserManagement: React.FC = () => {
  const me = useAuthStore((s) => s.user)
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
      if (status === 403) setError('Only admins can manage users.')
      else if (status === 404) setError('User management is not available on this server. Make sure the latest deploy is active.')
      else setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleToggleActive = async (user: User) => {
    if (user.active) {
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'this user'
      if (!confirm(`Deactivate ${name}? They will be signed out and unable to log in until reactivated.`)) return
    }
    setError(null)
    // Flip the row right away; reload (or revert) once the server answers.
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: !u.active } : u)))
    try {
      await updateUserApi(user.id, { active: !user.active })
      await loadUsers()
    } catch (e: any) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: user.active } : u)))
      setError(e.message)
    }
  }

  const handleResend = async (user: User) => {
    setError(null)
    setNotice(null)
    try {
      await resendInviteApi(user.id)
      setNotice(`Invitation re-sent to ${user.email || 'user'}.`)
      setTimeout(() => setNotice(null), 5000)
      await loadUsers()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const filtered = users.filter((u) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.first_name || '').toLowerCase().includes(q) ||
      (u.last_name || '').toLowerCase().includes(q) ||
      `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q)
    )
  })

  return (
    <>
      <Header
        title="User Management"
        actions={
          <button
            type="button"
            onClick={() => { setEditUser(null); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-4">
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{error}</span>
            <button type="button" onClick={loadUsers} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
          </div>
        )}
        {notice && <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm">{notice}</div>}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              aria-label="Search users"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-10 pr-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <p className="text-xs text-slate-400" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'user' : 'users'}</p>
        </div>

        <div className="relative bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32" role="status" aria-live="polite">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" aria-hidden="true" />
              <span className="sr-only">Loading users…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">{search ? 'No users match your search.' : 'No users yet.'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Team</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Active</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map((u) => {
                  const initials = `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase()
                  const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim()
                  const isSelf = me?.id === u.id
                  return (
                    <tr key={u.id} className={`hover:bg-slate-700/20 transition-colors ${!u.active ? 'text-slate-400' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${u.active ? 'bg-blue-600' : 'bg-slate-600'}`} aria-hidden="true">
                            <span className="text-xs font-bold text-white">{initials}</span>
                          </div>
                          <span className={`font-medium ${u.active ? 'text-white' : 'text-slate-300'}`}>
                            {fullName}
                            {isSelf && <span className="ml-1.5 text-[11px] font-normal text-blue-400">(you)</span>}
                            {!u.active && <span className="ml-1.5 text-[11px] font-normal text-slate-400">· inactive</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {u.roster_only
                          ? <span className="text-slate-400 italic text-xs">roster only · no login</span>
                          : (u.email || <span className="text-slate-400" aria-label="No email">—</span>)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={u.role} />
                          {u.invited && <StatusBadge status="invited" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 capitalize">
                        {(u.teams && u.teams.length > 1) ? u.teams.join(', ') : u.team}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {/* The hit area is padded to 44px; the visible pill stays small. */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={u.active}
                          aria-label={`${fullName || 'User'} active`}
                          disabled={isSelf}
                          title={isSelf ? 'You cannot deactivate your own account' : undefined}
                          onClick={() => handleToggleActive(u)}
                          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${u.active ? 'bg-blue-600' : 'bg-slate-600'}`}>
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${u.active ? 'translate-x-4' : 'translate-x-0'}`} />
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {u.invited && (
                            <button
                              type="button"
                              onClick={() => handleResend(u)}
                              aria-label={`Resend invitation to ${fullName || 'user'}`}
                              className="text-slate-400 hover:text-amber-400 transition-colors px-2 min-h-[44px] rounded-lg text-xs font-medium"
                            >
                              Resend
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setEditUser(u); setShowModal(true) }}
                            aria-label={`Edit ${fullName || 'user'}`}
                            className="text-slate-400 hover:text-blue-400 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          isSelf={!!editUser && me?.id === editUser.id}
          onClose={() => setShowModal(false)}
          onSave={loadUsers}
        />
      )}
    </>
  )
}

export default UserManagement

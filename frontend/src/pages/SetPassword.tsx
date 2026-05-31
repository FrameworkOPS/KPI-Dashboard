import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getInviteApi, acceptInviteApi } from '../services/api'

const SetPassword: React.FC = () => {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<{ email: string; first_name: string | null; team: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token.')
      setLoading(false)
      return
    }
    getInviteApi(token)
      .then((res) => setInvite(res.data))
      .catch((e) => setError(e.response?.data?.error || 'This invitation is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      const res = await acceptInviteApi(token, password)
      localStorage.setItem('token', res.data.token)
      // Force a fresh load so the auth store picks up the session.
      window.location.href = '/'
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base'

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/skyright-web_logotype-color.jpg"
            alt="Skyright Roofing &amp; Gutters"
            className="mx-auto h-20 sm:h-24 w-auto object-contain mb-4"
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Set Your Password</h1>
          {invite && (
            <p className="text-slate-400 mt-1 text-sm">
              Welcome{invite.first_name ? `, ${invite.first_name}` : ''} — create a password to join.
            </p>
          )}
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : !invite ? (
            <div className="space-y-4 text-center">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error || 'Invalid invitation.'}
              </div>
              <button onClick={() => navigate('/login')} className="text-blue-400 text-sm hover:underline">
                Go to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input type="email" value={invite.email} disabled className={`${inputCls} opacity-70`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
                <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 min-h-[48px] rounded-lg transition-colors"
              >
                {submitting ? 'Setting password…' : 'Set Password & Join'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default SetPassword

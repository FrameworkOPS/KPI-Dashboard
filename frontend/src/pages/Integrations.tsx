import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import api, { configureJobNimbusApi, disconnectJobNimbusApi, getJobNimbusStatusApi } from '../services/api'

interface QBOStatus {
  connected: boolean
  realm_id?: string
  token_expiry?: string
}

interface JNStatus {
  connected: boolean
}

const Integrations: React.FC = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  // QuickBooks
  const [qboStatus, setQboStatus] = useState<QBOStatus | null>(null)
  const [qboLoading, setQboLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  // JobNimbus
  const [jnStatus, setJnStatus] = useState<JNStatus | null>(null)
  const [jnLoading, setJnLoading] = useState(true)
  const [jnApiKey, setJnApiKey] = useState('')
  const [jnSaving, setJnSaving] = useState(false)
  const [jnDisconnecting, setJnDisconnecting] = useState(false)
  const [showJnKeyInput, setShowJnKeyInput] = useState(false)

  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const flash = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 4000)
  }

  // Check for ?qbo=connected redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('qbo') === 'connected') {
      flash('QuickBooks Online connected successfully!', 'success')
      window.history.replaceState({}, '', '/integrations')
    }
  }, [])

  const fetchQBOStatus = async () => {
    try {
      setQboLoading(true)
      const res = await api.get('/integrations/qbo/status')
      setQboStatus(res.data)
    } catch {
      setQboStatus({ connected: false })
    } finally {
      setQboLoading(false)
    }
  }

  const fetchJNStatus = async () => {
    try {
      setJnLoading(true)
      const res = await getJobNimbusStatusApi()
      setJnStatus(res.data)
    } catch {
      setJnStatus({ connected: false })
    } finally {
      setJnLoading(false)
    }
  }

  useEffect(() => {
    fetchQBOStatus()
    fetchJNStatus()
  }, [])

  const handleQBOConnect = () => { window.location.href = '/api/integrations/qbo/connect' }
  const handleQBOReconnect = () => { window.location.href = '/api/integrations/qbo/reconnect' }

  const handleQBODisconnect = async () => {
    if (!confirm('Disconnect QuickBooks Online? This will remove stored tokens.')) return
    setDisconnecting(true)
    try {
      await api.post('/integrations/qbo/disconnect')
      flash('QuickBooks Online disconnected.', 'success')
      setQboStatus({ connected: false })
    } catch (e: any) {
      flash(e.response?.data?.error || 'Disconnect failed', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleJNSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jnApiKey.trim()) return
    setJnSaving(true)
    try {
      await configureJobNimbusApi(jnApiKey.trim())
      flash('JobNimbus connected successfully!', 'success')
      setJnApiKey('')
      setShowJnKeyInput(false)
      await fetchJNStatus()
    } catch (e: any) {
      flash(e.response?.data?.error || 'Failed to save API key', 'error')
    } finally {
      setJnSaving(false)
    }
  }

  const handleJNDisconnect = async () => {
    if (!confirm('Remove JobNimbus API key?')) return
    setJnDisconnecting(true)
    try {
      await disconnectJobNimbusApi()
      flash('JobNimbus disconnected.', 'success')
      setJnStatus({ connected: false })
    } catch (e: any) {
      flash(e.response?.data?.error || 'Disconnect failed', 'error')
    } finally {
      setJnDisconnecting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-slate-400">You do not have permission to view this page.</p>
      </div>
    )
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Integrations</h1>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          msg.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {msg.text}
        </div>
      )}

      {/* QuickBooks Online */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">QuickBooks Online</p>
              <p className="text-slate-400 text-sm">P&L, revenue, and financial data</p>
            </div>
          </div>
          {qboLoading ? (
            <span className="text-slate-500 text-sm">Checking…</span>
          ) : (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              qboStatus?.connected
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-slate-700 text-slate-400'
            }`}>
              {qboStatus?.connected ? 'Connected' : 'Not connected'}
            </span>
          )}
        </div>

        {qboStatus?.connected && (
          <div className="mb-4 bg-slate-700/50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Realm ID</span>
              <span className="text-slate-300 font-mono text-xs">{qboStatus.realm_id}</span>
            </div>
            {qboStatus.token_expiry && (
              <div className="flex justify-between">
                <span className="text-slate-400">Token expires</span>
                <span className="text-slate-300 text-xs">{new Date(qboStatus.token_expiry).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {!qboStatus?.connected ? (
            <button onClick={handleQBOConnect} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors">
              Connect QuickBooks Online
            </button>
          ) : (
            <>
              <button onClick={handleQBOReconnect} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                Re-authorize
              </button>
              <button
                onClick={handleQBODisconnect}
                disabled={disconnecting}
                className="px-4 py-2 bg-slate-700 hover:bg-red-600/40 text-slate-300 hover:text-red-400 border border-slate-600 hover:border-red-500/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          )}
          {qboStatus?.connected && (
            <button onClick={fetchQBOStatus} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium transition-colors">
              Refresh Status
            </button>
          )}
        </div>

        {!qboStatus?.connected && (
          <p className="mt-3 text-slate-500 text-xs">
            Clicking "Connect" will redirect you to Intuit to authorize access. You'll be redirected back here when complete.
          </p>
        )}
      </div>

      {/* JobNimbus */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">JobNimbus</p>
              <p className="text-slate-400 text-sm">Job pipeline, open jobs, and won revenue</p>
            </div>
          </div>
          {jnLoading ? (
            <span className="text-slate-500 text-sm">Checking…</span>
          ) : (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              jnStatus?.connected
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-slate-700 text-slate-400'
            }`}>
              {jnStatus?.connected ? 'Connected' : 'Not connected'}
            </span>
          )}
        </div>

        {!jnStatus?.connected && !showJnKeyInput && (
          <button
            onClick={() => setShowJnKeyInput(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Connect JobNimbus
          </button>
        )}

        {showJnKeyInput && (
          <form onSubmit={handleJNSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">API Key</label>
              <input
                required
                type="password"
                placeholder="Paste your JobNimbus API key…"
                className={inputCls}
                value={jnApiKey}
                onChange={(e) => setJnApiKey(e.target.value)}
                autoFocus
              />
              <p className="mt-1 text-slate-500 text-xs">
                Found in JobNimbus → Settings → Integrations → API Key.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={jnSaving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {jnSaving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setShowJnKeyInput(false); setJnApiKey('') }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {jnStatus?.connected && (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { setShowJnKeyInput(true) }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Update API Key
            </button>
            <button
              onClick={handleJNDisconnect}
              disabled={jnDisconnecting}
              className="px-4 py-2 bg-slate-700 hover:bg-red-600/40 text-slate-300 hover:text-red-400 border border-slate-600 hover:border-red-500/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {jnDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Integrations

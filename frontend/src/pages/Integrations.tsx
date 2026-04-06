import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'

interface QBOStatus {
  connected: boolean
  realm_id?: string
  token_expiry?: string
}

const Integrations: React.FC = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [qboStatus, setQboStatus] = useState<QBOStatus | null>(null)
  const [qboLoading, setQboLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Check for ?qbo=connected redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('qbo') === 'connected') {
      setMsg({ text: 'QuickBooks Online connected successfully!', type: 'success' })
      // Clean up URL
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

  useEffect(() => {
    fetchQBOStatus()
  }, [])

  const handleQBOConnect = () => {
    // Navigate to backend connect route — it will redirect to Intuit
    window.location.href = '/api/integrations/qbo/connect'
  }

  const handleQBOReconnect = () => {
    window.location.href = '/api/integrations/qbo/reconnect'
  }

  const handleQBODisconnect = async () => {
    if (!confirm('Disconnect QuickBooks Online? This will remove stored tokens.')) return
    setDisconnecting(true)
    try {
      await api.post('/integrations/qbo/disconnect')
      setMsg({ text: 'QuickBooks Online disconnected.', type: 'success' })
      setQboStatus({ connected: false })
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || 'Disconnect failed', type: 'error' })
    } finally {
      setDisconnecting(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-slate-400">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Integrations</h1>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          msg.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {msg.text}
        </div>
      )}

      {/* HubSpot */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">HubSpot CRM</p>
              <p className="text-slate-400 text-sm">Sync deal data to Scorecard</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
            Connected via API Key
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-slate-500 text-xs">
            Connected using a private app access token. Tracks Appointments (stage 87743795) and
            Contract Signed (stage 60609660) deals. Use the HubSpot sync button on the Scorecard page.
          </p>
        </div>
      </div>

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
                <span className="text-slate-300 text-xs">
                  {new Date(qboStatus.token_expiry).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {!qboStatus?.connected ? (
            <button
              onClick={handleQBOConnect}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Connect QuickBooks Online
            </button>
          ) : (
            <>
              <button
                onClick={handleQBOReconnect}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
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
            <button
              onClick={fetchQBOStatus}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
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
    </div>
  )
}

export default Integrations

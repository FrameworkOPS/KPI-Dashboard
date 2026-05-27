import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import api, {
  configureJobNimbusApi,
  regenerateJobNimbusTokenApi,
  disconnectJobNimbusApi,
  getJobNimbusStatusApi,
} from '../services/api'

interface QBOStatus {
  connected: boolean
  realm_id?: string
  token_expiry?: string
}

interface JNStatus {
  connected: boolean
  webhook_url: string | null
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
  const [jnWorking, setJnWorking] = useState(false)
  const [jnDisconnecting, setJnDisconnecting] = useState(false)
  const [copied, setCopied] = useState(false)

  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const flash = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 5000)
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
      setJnStatus({ connected: false, webhook_url: null })
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

  const handleJNSetup = async () => {
    setJnWorking(true)
    try {
      const res = await configureJobNimbusApi()
      setJnStatus({ connected: true, webhook_url: res.data.webhook_url })
    } catch (e: any) {
      flash(e.response?.data?.error || 'Failed to generate webhook URL', 'error')
    } finally {
      setJnWorking(false)
    }
  }

  const handleJNRegenerate = async () => {
    if (!confirm('Regenerate the webhook URL? You will need to update the URL in Zapier.')) return
    setJnWorking(true)
    try {
      const res = await regenerateJobNimbusTokenApi()
      setJnStatus({ connected: true, webhook_url: res.data.webhook_url })
      flash('New webhook URL generated. Update it in Zapier.', 'success')
    } catch (e: any) {
      flash(e.response?.data?.error || 'Failed to regenerate token', 'error')
    } finally {
      setJnWorking(false)
    }
  }

  const handleJNDisconnect = async () => {
    if (!confirm('Disconnect JobNimbus? This will remove the webhook token and all stored job data.')) return
    setJnDisconnecting(true)
    try {
      await disconnectJobNimbusApi()
      flash('JobNimbus disconnected.', 'success')
      setJnStatus({ connected: false, webhook_url: null })
    } catch (e: any) {
      flash(e.response?.data?.error || 'Disconnect failed', 'error')
    } finally {
      setJnDisconnecting(false)
    }
  }

  const handleCopy = () => {
    if (!jnStatus?.webhook_url) return
    navigator.clipboard.writeText(jnStatus.webhook_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-slate-400">You do not have permission to view this page.</p>
      </div>
    )
  }

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

      {/* JobNimbus via Zapier */}
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
              <p className="text-white font-medium">JobNimbus <span className="text-slate-500 font-normal text-xs ml-1">via Zapier</span></p>
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
              {jnStatus?.connected ? 'Webhook active' : 'Not configured'}
            </span>
          )}
        </div>

        {/* Webhook URL display */}
        {jnStatus?.connected && jnStatus.webhook_url && (
          <div className="mb-4 space-y-2">
            <p className="text-xs text-slate-400">Paste this URL into your Zapier action as the webhook endpoint:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono truncate">
                {jnStatus.webhook_url}
              </code>
              <button
                onClick={handleCopy}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
                  copied
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-600'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-slate-700/40 border border-slate-600/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">Zapier setup steps:</p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li>In Zapier, create a Zap triggered by <strong className="text-slate-300">JobNimbus → New or Updated Job</strong></li>
                <li>Add an action: <strong className="text-slate-300">Webhooks by Zapier → POST</strong></li>
                <li>Paste the URL above as the webhook URL</li>
                <li>Set Payload Type to <strong className="text-slate-300">JSON</strong> and map the JobNimbus job fields</li>
              </ol>
            </div>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {!jnStatus?.connected ? (
            <button
              onClick={handleJNSetup}
              disabled={jnWorking}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {jnWorking ? 'Generating…' : 'Generate Webhook URL'}
            </button>
          ) : (
            <>
              <button
                onClick={handleJNRegenerate}
                disabled={jnWorking}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {jnWorking ? 'Regenerating…' : 'Regenerate URL'}
              </button>
              <button
                onClick={handleJNDisconnect}
                disabled={jnDisconnecting}
                className="px-4 py-2 bg-slate-700 hover:bg-red-600/40 text-slate-300 hover:text-red-400 border border-slate-600 hover:border-red-500/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {jnDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          )}
        </div>

        {!jnStatus?.connected && (
          <p className="mt-3 text-slate-500 text-xs">
            Generates a secure webhook URL. Paste it into a Zapier Webhook action connected to your JobNimbus account — Zapier will push job data to this dashboard automatically.
          </p>
        )}
      </div>
    </div>
  )
}

export default Integrations

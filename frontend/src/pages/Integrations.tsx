import React, { useCallback, useEffect, useState } from 'react'
import Header from '../components/Header'
import { useAuthStore } from '../store/authStore'
import api, { getQboConnectUrlApi } from '../services/api'

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
  const [statusError, setStatusError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const flash = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type })
    // Errors stay until dismissed; confirmations clear themselves.
    if (type === 'success') window.setTimeout(() => setMsg(null), 6000)
  }

  // Intuit sends the browser back here with ?qbo=connected or ?qbo=error&message=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('qbo')
    if (result === 'connected') {
      flash('QuickBooks Online connected successfully.', 'success')
    } else if (result === 'error') {
      flash(params.get('message') || 'QuickBooks Online authorization did not complete. Please try again.', 'error')
    }
    if (result) window.history.replaceState({}, '', '/integrations')
  }, [])

  const fetchQBOStatus = useCallback(async () => {
    setQboLoading(true)
    setStatusError(null)
    try {
      const res = await api.get('/integrations/qbo/status')
      setQboStatus(res.data)
    } catch (e: any) {
      setQboStatus(null)
      setStatusError(e.message || 'Could not check the QuickBooks connection.')
    } finally {
      setQboLoading(false)
    }
  }, [])

  useEffect(() => { if (isAdmin) fetchQBOStatus() }, [isAdmin, fetchQBOStatus])

  // The connect endpoint needs the auth header, so it returns the Intuit URL
  // for us to navigate to instead of redirecting a bare <a href>.
  const handleQBOConnect = async () => {
    setConnecting(true)
    setMsg(null)
    try {
      const res = await getQboConnectUrlApi()
      if (!res.data?.url) throw new Error('The server did not return an authorization link.')
      window.location.assign(res.data.url)
    } catch (e: any) {
      flash(e.message || 'Could not start the QuickBooks connection.', 'error')
      setConnecting(false)
    }
  }

  const handleQBODisconnect = async () => {
    if (!confirm('Disconnect QuickBooks Online? Financial data will stop syncing until you connect again.')) return
    setDisconnecting(true)
    setMsg(null)
    try {
      await api.post('/integrations/qbo/disconnect')
      flash('QuickBooks Online disconnected.', 'success')
      setQboStatus({ connected: false })
    } catch (e: any) {
      flash(e.message || 'Disconnect failed', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  if (!isAdmin) {
    return (
      <>
        <Header title="Integrations" />
        <div className="p-4 md:p-6">
          <p className="text-slate-300">Only admins can manage integrations.</p>
        </div>
      </>
    )
  }

  const btnBase = 'px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <>
      <Header title="Integrations" />
      <div className="p-4 md:p-6 max-w-3xl space-y-5">
        {msg && (
          <div
            role={msg.type === 'error' ? 'alert' : 'status'}
            className={`px-4 py-3 rounded-lg text-sm font-medium flex items-start justify-between gap-3 ${
              msg.type === 'success'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            <span>{msg.text}</span>
            <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss" className="-m-2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <section aria-labelledby="qbo-title" className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 id="qbo-title" className="text-white font-medium">QuickBooks Online</h2>
                <p className="text-slate-400 text-sm">P&amp;L, revenue, and financial data</p>
              </div>
            </div>
            <div aria-live="polite">
              {qboLoading ? (
                <span className="text-slate-400 text-sm">Checking…</span>
              ) : statusError ? (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">Status unknown</span>
              ) : (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  qboStatus?.connected
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {qboStatus?.connected ? 'Connected' : 'Not connected'}
                </span>
              )}
            </div>
          </div>

          {statusError && (
            <div role="alert" className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
              <span>{statusError}</span>
              <button type="button" onClick={fetchQBOStatus} className="text-white bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 min-h-[44px] rounded-lg">Retry</button>
            </div>
          )}

          {qboStatus?.connected && (
            <dl className="mb-4 bg-slate-700/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Realm ID</dt>
                <dd className="text-slate-300 font-mono text-xs break-all">{qboStatus.realm_id}</dd>
              </div>
              {qboStatus.token_expiry && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Token expires</dt>
                  <dd className="text-slate-300 text-xs">{new Date(qboStatus.token_expiry).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="flex gap-3 flex-wrap">
            {!qboStatus?.connected ? (
              <button type="button" onClick={handleQBOConnect} disabled={connecting || qboLoading} className={`${btnBase} bg-green-700 hover:bg-green-600 text-white`}>
                {connecting ? 'Opening Intuit…' : 'Connect QuickBooks Online'}
              </button>
            ) : (
              <>
                <button type="button" onClick={handleQBOConnect} disabled={connecting} className={`${btnBase} bg-blue-600 hover:bg-blue-500 text-white`}>
                  {connecting ? 'Opening Intuit…' : 'Re-authorize'}
                </button>
                <button
                  type="button"
                  onClick={handleQBODisconnect}
                  disabled={disconnecting}
                  className={`${btnBase} bg-slate-700 hover:bg-red-600/40 text-slate-300 hover:text-red-400 border border-slate-600 hover:border-red-500/50`}
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </>
            )}
            <button type="button" onClick={fetchQBOStatus} disabled={qboLoading} className={`${btnBase} bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600`}>
              {qboLoading ? 'Checking…' : 'Refresh status'}
            </button>
          </div>

          {!qboStatus?.connected && !statusError && (
            <p className="mt-3 text-slate-400 text-xs">
              Connect opens Intuit in this tab for authorization, then returns you here.
            </p>
          )}
        </section>
      </div>
    </>
  )
}

export default Integrations

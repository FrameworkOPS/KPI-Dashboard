import React, { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { getSkyStatusApi, skyChatApi } from '../services/api'
import { emitDataChanged } from '../utils/dataEvents'

interface SkyMessage {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: Array<{ name: string; input: any; warning?: string }>
  timestamp: number
}

const STORAGE_KEY = 'sky_chat_history_v1'
const INTRO_PREFIX = 'sky_intro_seen_v1'

const SUGGESTIONS = [
  'What should I pay attention to today?',
  'Summarize pipeline risk by material and rep.',
  'Forecast production for the next 8 weeks.',
  'Which scorecard metrics are off track?',
]

const CONFIG_TOOLS = new Set([
  'update_forecaster_settings',
  'set_sales_rep_close_rate',
  'delete_sales_rep_close_rate',
  'update_crew_capacity',
])
const WRITE_TOOLS = new Set(['set_sales_forecast', 'add_capacity_block', 'add_pipeline_item'])
const SCENARIO_TOOLS = new Set(['simulate_production_forecast'])

function loadHistory(): SkyMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(messages: SkyMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))) } catch {}
}

function badgeFor(name: string) {
  if (CONFIG_TOOLS.has(name)) return { label: 'CONFIG', cls: 'bg-red-900/40 text-red-300 border-red-500/40' }
  if (WRITE_TOOLS.has(name)) return { label: 'WRITE', cls: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/40' }
  if (SCENARIO_TOOLS.has(name)) return { label: 'SCENARIO', cls: 'bg-purple-900/40 text-purple-300 border-purple-500/40' }
  return { label: 'READ', cls: 'bg-slate-800 text-cyan-300 border-slate-600' }
}

function inline(text: string): React.ReactNode {
  const parts: Array<{ type: 'text' | 'bold' | 'code' | 'italic'; value: string }> = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    if (match.index > lastIdx) parts.push({ type: 'text', value: text.slice(lastIdx, match.index) })
    const m = match[0]
    if (m.startsWith('**')) parts.push({ type: 'bold', value: m.slice(2, -2) })
    else if (m.startsWith('`')) parts.push({ type: 'code', value: m.slice(1, -1) })
    else parts.push({ type: 'italic', value: m.slice(1, -1) })
    lastIdx = match.index + m.length
  }
  if (lastIdx < text.length) parts.push({ type: 'text', value: text.slice(lastIdx) })
  return parts.map((p, i) => {
    if (p.type === 'bold') return <strong key={i} className="font-semibold text-white">{p.value}</strong>
    if (p.type === 'code') return <code key={i} className="px-1 py-0.5 bg-slate-700 rounded text-cyan-300 text-xs">{p.value}</code>
    if (p.type === 'italic') return <em key={i}>{p.value}</em>
    return <React.Fragment key={i}>{p.value}</React.Fragment>
  })
}

function MarkdownText({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/)
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const isTable = lines.length >= 2 && lines[0].includes('|') && /^\s*\|?\s*:?-+:?/.test(lines[1] || '')
        if (isTable) {
          const headers = lines[0].split('|').map((c) => c.trim()).filter(Boolean)
          const rows = lines.slice(2).map((r) => r.split('|').map((c) => c.trim()).filter(Boolean))
          return (
            <div key={i} className="overflow-x-auto">
              <table className="min-w-full text-xs border border-slate-700 rounded">
                <thead className="bg-slate-700/50">
                  <tr>{headers.map((h, j) => <th key={j} className="px-2 py-1.5 text-left font-medium text-slate-200">{inline(h)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {rows.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-2 py-1 text-slate-300">{inline(c)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <div key={i} className="whitespace-pre-wrap leading-relaxed">{inline(block)}</div>
      })}
    </div>
  )
}

export default function SkyChat() {
  const { token, user, isAuthenticated } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [messages, setMessages] = useState<SkyMessage[]>(() => loadHistory())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { saveHistory(messages) }, [messages])

  useEffect(() => {
    if (!isAuthenticated || !user) return
    const key = `${INTRO_PREFIX}_${user.id}`
    if (!localStorage.getItem(key)) setIntroOpen(true)
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getSkyStatusApi()
      .then((r) => { if (!cancelled) setEnabled(!!r.data?.enabled) })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [messages, sending, open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  // Escape closes whichever Sky surface is open, intro first.
  useEffect(() => {
    if (!open && !introOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (introOpen) closeIntro()
      else setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, introOpen])

  const closeIntro = () => {
    if (user) localStorage.setItem(`${INTRO_PREFIX}_${user.id}`, 'true')
    setIntroOpen(false)
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    setError(null)
    const userMsg: SkyMessage = { role: 'user', content, timestamp: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const res = await skyChatApi(next.map((m) => ({ role: m.role, content: m.content })))
      const d = res.data
      const toolCalls = d.data?.tool_calls || []
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: d.data?.reply || '(empty response)',
        tool_calls: toolCalls,
        timestamp: Date.now(),
      }])
      // Sky can create issues, to-dos, rocks and scorecard entries; tell open pages to refresh.
      if (toolCalls.length > 0) emitDataChanged('any')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      // Keep the question so it can be resent.
      setMessages(messages)
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const clearHistory = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  if (!isAuthenticated) return null

  return (
    <>
      {introOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && closeIntro()}>
          <div role="dialog" aria-modal="true" aria-labelledby="sky-intro-title"
            className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-cyan-300 uppercase tracking-widest font-semibold">Meet Sky</p>
                <h2 id="sky-intro-title" className="text-2xl font-bold text-white mt-1">Your AI operating assistant</h2>
              </div>
              <button onClick={closeIntro} autoFocus
                className="text-slate-400 hover:text-white min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>Sky can answer questions across the KPI Dashboard, Scorecard, Rocks, Issues, To-Dos, Meetings, Accountability, and Forecaster tools.</p>
              <p>Ask Sky to summarize what needs attention, explain scorecard movement, inspect the manual pipeline, forecast production, model scenarios, or turn operating data into next actions.</p>
              <p>Forecasting uses the manually maintained pipeline, crews, sales forecast, and capacity blocks. Sky will ask before changing base forecast settings.</p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={closeIntro} className="px-4 py-2 min-h-[44px] rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">Later</button>
              <button onClick={() => { closeIntro(); setOpen(true) }} className="px-4 py-2 min-h-[44px] rounded-lg bg-cyan-700 text-white hover:bg-cyan-600">Open Sky</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-2">
        {open && (
          <div role="dialog" aria-label="Sky assistant"
            className="w-[min(calc(100vw-3rem),420px)] h-[min(calc(100vh-8rem),620px)] bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-2 pr-2 border-b border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Sky</p>
                <p className="text-[11px] text-slate-400">Ask about operations, KPIs, pipeline, and forecasts</p>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearHistory} className="text-xs text-slate-400 hover:text-red-300 min-h-[44px] px-2 rounded">Clear</button>
                )}
                <button onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded" aria-label="Close Sky">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {enabled === false && (
              <div className="m-3 bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-2 text-xs text-yellow-300">
                Sky is not configured. Set ANTHROPIC_API_KEY on the server.
              </div>
            )}
            {error && (
              <div role="alert" className="m-3 bg-red-900/30 border border-red-500/50 rounded-lg p-2 text-xs text-red-300 flex justify-between gap-3">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="underline">Dismiss</button>
              </div>
            )}

            <div ref={scrollerRef} aria-live="polite" className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs bg-slate-900/50 hover:bg-slate-700/70 border border-slate-700 rounded-lg px-3 py-2 text-slate-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={`${m.timestamp}-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-cyan-700 text-white' : 'bg-slate-900 text-slate-200 border border-slate-700'
                  }`}>
                    <MarkdownText text={m.content} />
                    {m.tool_calls && m.tool_calls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.tool_calls.map((t, idx) => {
                          const b = badgeFor(t.name)
                          return <span key={`${t.name}-${idx}`} className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.label}</span>
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && <div className="text-xs text-slate-400 px-2">Sky is thinking…</div>}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); send(input) }}
              className="p-3 border-t border-slate-700"
            >
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  aria-label="Message Sky"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(input)
                    }
                  }}
                  rows={2}
                  placeholder="Ask Sky..."
                  className="flex-1 resize-none rounded-lg bg-slate-900 border border-slate-700 text-white text-sm px-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button type="submit" disabled={sending || !input.trim()}
                  className="px-4 min-h-[44px] rounded-lg bg-cyan-700 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className={`h-14 px-5 rounded-full shadow-lg flex items-center gap-2 transition-colors ${
            open ? 'bg-slate-700 text-slate-200' : 'bg-cyan-700 hover:bg-cyan-600 text-white'
          }`}
          aria-label={open ? 'Close Sky assistant' : 'Open Sky assistant'}
          aria-expanded={open}
        >
          <span className="font-bold">Sky</span>
        </button>
      </div>
    </>
  )
}

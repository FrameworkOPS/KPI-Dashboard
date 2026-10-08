import React, { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import { getForecasterAiStatusApi, forecasterAiChatApi } from '../services/api'
import { emitDataChanged } from '../utils/dataEvents'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: Array<{ name: string; input: any; warning?: string }>
  timestamp: number
}

const CONFIG_TOOLS = new Set([
  'update_forecaster_settings',
  'set_sales_rep_close_rate',
  'delete_sales_rep_close_rate',
  'update_crew_capacity',
])
const SCENARIO_TOOLS = new Set(['simulate_production_forecast'])
const WRITE_TOOLS = new Set([
  'set_sales_forecast',
  'add_capacity_block',
  'add_pipeline_item',
])

function toolBadge(name: string): { label: string; cls: string } {
  if (CONFIG_TOOLS.has(name))   return { label: 'CONFIG',   cls: 'bg-red-900/40 text-red-300 border border-red-500/40' }
  if (WRITE_TOOLS.has(name))    return { label: 'WRITE',    cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/40' }
  if (SCENARIO_TOOLS.has(name)) return { label: 'SCENARIO', cls: 'bg-purple-900/40 text-purple-300 border border-purple-500/40' }
  return                              { label: 'READ',     cls: 'bg-slate-800 text-cyan-300 border border-slate-600' }
}

const SUGGESTIONS = [
  'How does our shingle lead time look over the next 3 months?',
  'If we add a 4th shingle crew next month, what does the forecast look like?',
  'Where is our biggest pipeline risk right now?',
  'Show me a weekly breakdown of projected revenue.',
  'How much manual pipeline is waiting for production?',
  'What sales forecast do I need to hit 6-week lead time consistently?',
]

const STORAGE_KEY = 'forecaster_ai_history_v1'

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

function saveHistory(msgs: ChatMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50))) } catch {}
}

// Lightweight markdown renderer — bold, italic, inline code, line breaks, tables
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
              <table className="min-w-full text-sm border border-slate-700 rounded">
                <thead className="bg-slate-700/50">
                  <tr>{headers.map((h, j) => <th scope="col" key={j} className="px-3 py-2 text-left font-medium text-slate-200">{inline(h)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {rows.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-3 py-1.5 text-slate-300">{inline(c)}</td>)}</tr>
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

function inline(text: string): React.ReactNode {
  // Order matters: bold → code → italic
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
    if (p.type === 'bold')   return <strong key={i} className="font-semibold text-white">{p.value}</strong>
    if (p.type === 'code')   return <code key={i} className="px-1 py-0.5 bg-slate-700 rounded text-cyan-300 text-xs">{p.value}</code>
    if (p.type === 'italic') return <em key={i} className="italic">{p.value}</em>
    return <React.Fragment key={i}>{p.value}</React.Fragment>
  })
}

export default function ForecasterAI() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = still checking, 'unknown' = the status call failed
  const [enabled, setEnabled] = useState<boolean | 'unknown' | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    getForecasterAiStatusApi()
      .then((r) => { if (!cancelled) setEnabled(!!r.data?.enabled) })
      .catch(() => { if (!cancelled) setEnabled('unknown') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { saveHistory(messages) }, [messages])

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [messages, sending])

  const canChat = enabled === true

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending || !canChat) return
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content, timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setSending(true)
    try {
      const res = await forecasterAiChatApi(newMessages.map((m) => ({ role: m.role, content: m.content })))
      const d = res.data
      const toolCalls = d.data?.tool_calls || []
      const reply: ChatMessage = {
        role: 'assistant',
        content: d.data?.reply || '(empty response)',
        tool_calls: toolCalls,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, reply])
      // A tool that wrote data means other open pages are stale.
      if (toolCalls.some((tc: { name: string }) => WRITE_TOOLS.has(tc.name) || CONFIG_TOOLS.has(tc.name))) {
        emitDataChanged(['pipeline', 'crews', 'forecast'])
      }
    } catch (e: any) {
      setError(e.message || 'Request failed')
      // Put the question back so it isn't lost.
      setMessages(messages)
      setInput(content)
    } finally {
      setSending(false)
      setTimeout(() => taRef.current?.focus(), 50)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const clearHistory = () => {
    if (!confirm('Clear this conversation? The AI will not remember earlier questions.')) return
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <>
      <Header
        title="Forecaster AI"
        actions={messages.length > 0 ? (
          <button type="button" onClick={clearHistory} className="text-xs text-slate-300 hover:text-red-400 underline min-h-[44px] px-2">Clear conversation</button>
        ) : undefined}
      />
      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
        <p className="text-sm text-slate-400">
          Ask for projections, what-if scenarios, and data summaries. Answers come from the pipeline, crews, and sales forecast maintained on their own pages.
        </p>

        {enabled === false && (
          <div role="status" className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3 text-sm text-yellow-300">
            The Forecaster AI is not configured on this server. An admin needs to set the AI API key before it can answer questions.
          </div>
        )}
        {enabled === 'unknown' && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            Could not check whether the Forecaster AI is available. Reload the page to try again.
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 underline min-h-[44px] px-2">Dismiss</button>
          </div>
        )}

        <div className="bg-slate-800 border border-slate-700 rounded-2xl flex flex-col h-[calc(100vh-300px)] min-h-[400px]">
          {/* Messages */}
          <div ref={scrollerRef} role="log" aria-live="polite" aria-label="Conversation" tabIndex={0} className="flex-1 overflow-y-auto p-4 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm mb-4">Try one of these to get started:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={!canChat || sending}
                      className="text-left text-sm text-slate-300 bg-slate-700/40 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 min-h-[44px] transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700/60 text-slate-100 border border-slate-700'
                  }`}
                >
                  <span className="sr-only">{m.role === 'user' ? 'You said:' : 'Forecaster AI said:'}</span>
                  {m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-slate-600/50 space-y-1">
                      <p className="sr-only">Data used:</p>
                      <div className="flex flex-wrap gap-1">
                        {m.tool_calls.map((tc, j) => {
                          const b = toolBadge(tc.name)
                          return (
                            <span key={j} className={`px-1.5 py-0.5 text-[11px] rounded font-mono ${b.cls}`}>
                              <span className="opacity-80">[{b.label}]</span> {tc.name}
                            </span>
                          )
                        })}
                      </div>
                      {m.tool_calls.filter((tc) => tc.warning).map((tc, j) => (
                        <div key={`w${j}`} className="text-[11px] text-red-300 bg-red-900/30 border border-red-500/40 rounded px-2 py-1">
                          <strong className="font-semibold">{tc.name}</strong>: {tc.warning}
                        </div>
                      ))}
                    </div>
                  )}
                  <MarkdownText text={m.content} />
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-slate-700/60 text-slate-300 border border-slate-700 rounded-2xl px-4 py-3 text-sm">
                  <div className="flex items-center gap-2" role="status">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0.2s' }} aria-hidden="true" />
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0.4s' }} aria-hidden="true" />
                    <span className="text-xs text-slate-300 ml-2">Analyzing…</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-slate-700 p-3 flex gap-2 items-end">
            <label htmlFor="forecaster-input" className="sr-only">Ask the Forecaster AI</label>
            <textarea
              id="forecaster-input"
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={canChat ? 'Ask about the forecast… (Enter to send, Shift+Enter for a new line)' : enabled === null ? 'Checking availability…' : 'Forecaster AI is unavailable'}
              disabled={!canChat || sending}
              rows={1}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 min-h-[44px] text-sm text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              style={{ maxHeight: 120 }}
            />
            <button
              type="submit"
              disabled={!canChat || sending || !input.trim()}
              className="px-4 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Answers are generated by AI and can be wrong. Check important numbers against the Pipeline, Crews, and Sales Forecast pages.
        </p>
      </div>
    </>
  )
}

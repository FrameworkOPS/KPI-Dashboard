import React, { useEffect, useState, useCallback, useRef } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import { getTodosApi, createTodoApi, updateTodoApi, deleteTodoApi, getUsersRosterApi } from '../services/api'
import { Todo, TeamType, RosterUser } from '../types'
import { useAuthStore } from '../store/authStore'
import { formatDate, isBeforeToday } from '../utils/dates'
import { TEAMS, accessibleTeams, defaultTeamFor, isSingleTeamRole } from '../utils/teams'
import { useDataChanged } from '../utils/dataEvents'

const fmtDate = (d: string) => formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })

const isOverdue = (todo: Todo) => {
  if (!todo.due_date || todo.status === 'complete') return false
  return isBeforeToday(todo.due_date)
}

const ownerNameOf = (todo: Todo, users: RosterUser[]): string | null => {
  if (todo.owner_first_name || todo.owner_last_name) return `${todo.owner_first_name || ''} ${todo.owner_last_name || ''}`.trim()
  const u = users.find((x) => x.id === todo.owner_id)
  return u ? `${u.first_name} ${u.last_name}` : null
}

interface AddTodoFormProps {
  /** The active filter; 'all' means the person picks a team. */
  team: string
  users: RosterUser[]
  onSave: () => void
  onCancel: () => void
}

const AddTodoForm: React.FC<AddTodoFormProps> = ({ team, users, onSave, onCancel }) => {
  const { user } = useAuthStore()
  const teamOptions = accessibleTeams(user)
  const [form, setForm] = useState({ title: '', description: '', owner_id: '', due_date: '', team: defaultTeamFor(user, team) as string })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      await createTodoApi({ ...form, owner_id: form.owner_id || null, due_date: form.due_date || null, status: 'pending' })
      onSave()
    } catch (err: any) {
      setError(`The to-do was not added: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <form onSubmit={handleSubmit} className="bg-slate-700/40 border border-slate-600 rounded-xl p-4 space-y-3 mt-2" aria-label="New to-do">
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
      <input
        required
        autoFocus
        aria-label="To-do title"
        placeholder="To-do title…"
        className={inputCls}
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <div className={`grid gap-2 ${team === 'all' && teamOptions.length > 1 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
        <select aria-label="Assign to" className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
          <option value="">— Assign to me —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
          ))}
        </select>
        <input type="date" aria-label="Due date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        {team === 'all' && teamOptions.length > 1 && (
          <select aria-label="Team" className={inputCls} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
            {TEAMS.filter((t) => (teamOptions as readonly string[]).includes(t.value)).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 min-h-[44px] rounded-lg transition-colors disabled:opacity-60">
          {saving ? 'Adding…' : 'Add to-do'}
        </button>
        <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-3 py-2 min-h-[44px] rounded-lg transition-colors">Cancel</button>
      </div>
    </form>
  )
}

interface TodoCardProps {
  todo: Todo
  users: RosterUser[]
  onToggle: (id: string, status: 'pending' | 'complete') => void
  onDelete: (todo: Todo) => void
}

const TodoCard: React.FC<TodoCardProps> = ({ todo, users, onToggle, onDelete }) => {
  const overdue = isOverdue(todo)
  const ownerName = ownerNameOf(todo, users)
  const complete = todo.status === 'complete'

  return (
    <div className={`bg-slate-800 rounded-xl border ${overdue ? 'border-red-500/40' : 'border-slate-700'} p-3 pl-4 flex items-start gap-3 group`}>
      {/* The hit area is padded out to 44px; the visible box stays 20px. */}
      <button
        role="checkbox"
        aria-checked={complete}
        aria-label={`Mark "${todo.title}" ${complete ? 'pending' : 'complete'}`}
        onClick={() => onToggle(todo.id, complete ? 'pending' : 'complete')}
        className="flex-shrink-0 -m-3 p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
      <span
        aria-hidden="true"
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          todo.status === 'complete'
            ? 'bg-green-500 border-green-500'
            : overdue
            ? 'border-red-500 hover:border-red-400'
            : 'border-slate-500 hover:border-blue-400'
        }`}
      >
        {complete && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      </button>
      <div className="flex-1 min-w-0 py-1">
        <p className={`text-sm font-medium ${
          complete ? 'text-slate-400 line-through' :
          overdue ? 'text-red-400' : 'text-white'
        }`}>
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {ownerName && <span className="text-xs text-slate-400">{ownerName}</span>}
          {todo.due_date && (
            <span className={`text-xs ${overdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
              {overdue ? 'Overdue · ' : ''}{fmtDate(todo.due_date)}
            </span>
          )}
        </div>
      </div>
      {/* Always reachable: visible on touch screens and whenever focused. */}
      <button
        onClick={() => onDelete(todo)}
        aria-label={`Delete to-do ${todo.title}`}
        className="text-slate-400 hover:text-red-400 transition-colors md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 flex-shrink-0 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

const Todos: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    isSingleTeamRole(user) ? user!.team as TeamType : 'all'
  )
  const [todos, setTodos] = useState<Todo[]>([])
  const [users, setUsers] = useState<RosterUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddPending, setShowAddPending] = useState(false)
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  // Later refreshes swap data in place (no spinner flash when ticking off
  // to-dos), and a slow earlier response never overwrites the current filter.
  const requestRef = useRef(0)
  const loadTodos = useCallback(async () => {
    const requestId = ++requestRef.current
    setError(null)
    try {
      const res = await getTodosApi(team === 'all' ? undefined : team)
      if (requestId !== requestRef.current) return
      setTodos(res.data)
    } catch (e: any) {
      if (requestId !== requestRef.current) return
      setError(e.message)
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [team])

  useEffect(() => { setLoading(true); loadTodos() }, [loadTodos])
  useDataChanged(['todos'], loadTodos)
  useEffect(() => { getUsersRosterApi().then((r) => setUsers(r.data)).catch(() => {}) }, [])

  // Checking a box moves it at once; a failed save puts it back and says so.
  const handleToggle = async (id: string, status: 'pending' | 'complete') => {
    const previous = todos
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    try {
      await updateTodoApi(id, { status })
      await loadTodos()
    } catch (e: any) {
      setTodos(previous)
      setError(`The to-do was not updated: ${e.message}`)
    }
  }

  const handleDelete = async (todo: Todo) => {
    if (!confirm(`Delete the to-do "${todo.title}"? This cannot be undone.`)) return
    try {
      await deleteTodoApi(todo.id)
      await loadTodos()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const q = search.trim().toLowerCase()
  const visibleTodos = todos.filter((t) => {
    if (mineOnly && t.owner_id !== user?.id) return false
    if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false
    return true
  })
  const pending = visibleTodos.filter((t) => t.status === 'pending')
  const complete = visibleTodos.filter((t) => t.status === 'complete')

  return (
    <>
      <Header title="To-Dos" />
      <div className="p-4 md:p-6 space-y-4">
        {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <TeamFilter value={team} onChange={setTeam} />
          <input
            type="search"
            aria-label="Search to-dos"
            placeholder="Search to-dos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
          />
          <button
            onClick={() => setMineOnly((v) => !v)}
            aria-pressed={mineOnly}
            className={`text-xs font-medium px-3 py-2 min-h-[44px] rounded-lg border transition-colors ${
              mineOnly
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            Mine only
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Pending
                  <span className="ml-2 text-xs font-medium text-slate-300 bg-slate-700 rounded-full px-2 py-0.5">{pending.length}</span>
                </h2>
                <button
                  onClick={() => setShowAddPending(!showAddPending)}
                  aria-expanded={showAddPending}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors min-h-[44px] px-2 -mr-2 rounded"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              {showAddPending && (
                <AddTodoForm
                  team={team}
                  users={users}
                  onSave={() => { setShowAddPending(false); loadTodos() }}
                  onCancel={() => setShowAddPending(false)}
                />
              )}
              <div className="space-y-2 mt-2">
                {pending.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                    No pending to-dos
                  </div>
                ) : pending.map((todo) => (
                  <TodoCard key={todo.id} todo={todo} users={users} onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </div>
            </div>

            {/* Complete */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Complete
                  <span className="ml-2 text-xs font-medium text-slate-300 bg-slate-700 rounded-full px-2 py-0.5">{complete.length}</span>
                </h2>
              </div>
              <div className="space-y-2 mt-2">
                {complete.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                    Nothing completed yet
                  </div>
                ) : complete.map((todo) => (
                  <TodoCard key={todo.id} todo={todo} users={users} onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Todos

import React, { useEffect, useState, useCallback } from 'react'
import Header from '../components/Header'
import TeamFilter from '../components/TeamFilter'
import { getTodosApi, createTodoApi, updateTodoApi, deleteTodoApi, getUsersApi } from '../services/api'
import { Todo, TeamType, User } from '../types'
import { useAuthStore } from '../store/authStore'

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const isOverdue = (todo: Todo) => {
  if (!todo.due_date || todo.status === 'complete') return false
  return new Date(todo.due_date + 'T00:00:00') < new Date()
}

interface AddTodoFormProps {
  team: string
  users: User[]
  onSave: () => void
  onCancel: () => void
}

const AddTodoForm: React.FC<AddTodoFormProps> = ({ team, users, onSave, onCancel }) => {
  const [form, setForm] = useState({ title: '', description: '', owner_id: '', due_date: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createTodoApi({ ...form, team, status: 'pending' })
      onSave()
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <form onSubmit={handleSubmit} className="bg-slate-700/40 border border-slate-600 rounded-xl p-4 space-y-3 mt-2">
      <input
        required
        placeholder="To-do title…"
        className={inputCls}
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
          <option value="">— Assign to —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
          ))}
        </select>
        <input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 rounded-lg transition-colors disabled:opacity-60">
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
      </div>
    </form>
  )
}

interface TodoCardProps {
  todo: Todo
  users: User[]
  onToggle: (id: string, status: 'pending' | 'complete') => void
  onDelete: (id: string) => void
}

const TodoCard: React.FC<TodoCardProps> = ({ todo, users, onToggle, onDelete }) => {
  const overdue = isOverdue(todo)
  const ownerName = todo.owner
    ? `${todo.owner.first_name} ${todo.owner.last_name}`
    : users.find((u) => u.id === todo.owner_id)
      ? `${users.find((u) => u.id === todo.owner_id)!.first_name} ${users.find((u) => u.id === todo.owner_id)!.last_name}`
      : null

  return (
    <div className={`bg-slate-800 rounded-xl border ${overdue ? 'border-red-500/40' : 'border-slate-700'} p-4 flex items-start gap-3 group`}>
      <button
        onClick={() => onToggle(todo.id, todo.status === 'complete' ? 'pending' : 'complete')}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 mt-0.5 flex items-center justify-center transition-colors ${
          todo.status === 'complete'
            ? 'bg-green-500 border-green-500'
            : overdue
            ? 'border-red-500 hover:border-red-400'
            : 'border-slate-500 hover:border-blue-400'
        }`}
      >
        {todo.status === 'complete' && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${
          todo.status === 'complete' ? 'text-slate-500 line-through' :
          overdue ? 'text-red-400' : 'text-white'
        }`}>
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {ownerName && <span className="text-xs text-slate-500">{ownerName}</span>}
          {todo.due_date && (
            <span className={`text-xs ${overdue ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
              {overdue ? 'Overdue · ' : ''}{fmtDate(todo.due_date)}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

const Todos: React.FC = () => {
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamType | 'all'>(
    user?.role === 'manager' ? user.team as TeamType : 'all'
  )
  const [todos, setTodos] = useState<Todo[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddPending, setShowAddPending] = useState(false)
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const loadTodos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getTodosApi(team === 'all' ? undefined : team)
      setTodos(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [team])

  useEffect(() => { loadTodos() }, [loadTodos])
  useEffect(() => { getUsersApi().then((r) => setUsers(r.data)).catch(() => {}) }, [])

  const handleToggle = async (id: string, status: 'pending' | 'complete') => {
    try {
      await updateTodoApi(id, { status })
      await loadTodos()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this to-do?')) return
    try {
      await deleteTodoApi(id)
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
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <TeamFilter value={team} onChange={setTeam} />
          <input
            type="text"
            placeholder="Search to-dos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
          />
          <button
            onClick={() => setMineOnly((v) => !v)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
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
                <h3 className="text-sm font-semibold text-white">Pending
                  <span className="ml-2 text-xs font-medium text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">{pending.length}</span>
                </h3>
                <button
                  onClick={() => setShowAddPending(!showAddPending)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              {showAddPending && (
                <AddTodoForm
                  team={team === 'all' ? (user?.team || 'sales') : team}
                  users={users}
                  onSave={() => { setShowAddPending(false); loadTodos() }}
                  onCancel={() => setShowAddPending(false)}
                />
              )}
              <div className="space-y-2 mt-2">
                {pending.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-sm bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
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
                <h3 className="text-sm font-semibold text-white">Complete
                  <span className="ml-2 text-xs font-medium text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">{complete.length}</span>
                </h3>
              </div>
              <div className="space-y-2 mt-2">
                {complete.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-sm bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
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

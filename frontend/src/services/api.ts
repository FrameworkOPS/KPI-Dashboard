import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor to handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 from the login request means "wrong credentials" — let the Login
    // page show the error rather than reloading it away (session-expiry
    // redirects only make sense for already-authenticated requests).
    const isLoginRequest = (error.config?.url || '').includes('/auth/login')
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginApi = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const getMeApi = () =>
  api.get('/auth/me')

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsersApi = () =>
  api.get('/users')

export const createUserApi = (data: any) =>
  api.post('/users', data)

export const updateUserApi = (id: string, data: any) =>
  api.put(`/users/${id}`, data)

export const deleteUserApi = (id: string) =>
  api.delete(`/users/${id}`)

// ── Scorecard ─────────────────────────────────────────────────────────────────
export const getScorecardApi = (team?: string, week?: string) =>
  api.get('/scorecard', { params: { team, week_of: week } })

export const getScorecardTemplatesApi = (team?: string) =>
  api.get('/scorecard/templates', { params: { team } })

export const createScorecardEntryApi = (data: any) =>
  api.post('/scorecard', data)

export const updateScorecardEntryApi = (id: string, data: any) =>
  api.put(`/scorecard/${id}`, data)

export const deleteScorecardEntryApi = (id: string) =>
  api.delete(`/scorecard/${id}`)

export const createWeekFromTemplateApi = (team: string, week_of: string) =>
  api.post('/scorecard/new-week', { team, week_of })

export const getScorecardHistoryApi = (team?: string, weeks = 13) =>
  api.get('/scorecard/history', { params: { team, weeks } })

// ── Rocks ─────────────────────────────────────────────────────────────────────
export const getRocksApi = (team?: string, quarter?: number, year?: number) =>
  api.get('/rocks', { params: { team, quarter, year } })

export const createRockApi = (data: any) =>
  api.post('/rocks', data)

export const updateRockApi = (id: string, data: any) =>
  api.put(`/rocks/${id}`, data)

export const deleteRockApi = (id: string) =>
  api.delete(`/rocks/${id}`)

// ── Issues ────────────────────────────────────────────────────────────────────
export const getIssuesApi = (team?: string, status?: string) =>
  api.get('/issues', { params: { team, status } })

export const createIssueApi = (data: any) =>
  api.post('/issues', data)

export const updateIssueApi = (id: string, data: any) =>
  api.put(`/issues/${id}`, data)

export const deleteIssueApi = (id: string) =>
  api.delete(`/issues/${id}`)

// ── Todos ─────────────────────────────────────────────────────────────────────
export const getTodosApi = (team?: string, status?: string) =>
  api.get('/todos', { params: { team, status } })

export const createTodoApi = (data: any) =>
  api.post('/todos', data)

export const updateTodoApi = (id: string, data: any) =>
  api.put(`/todos/${id}`, data)

export const deleteTodoApi = (id: string) =>
  api.delete(`/todos/${id}`)

// ── VTO ───────────────────────────────────────────────────────────────────────
export const getVTOApi = () =>
  api.get('/vto')

export const updateVTOSectionApi = (section_key: string, content: any) =>
  api.put(`/vto/${section_key}`, { content })

// ── Accountability ────────────────────────────────────────────────────────────
export const getAccountabilityApi = () =>
  api.get('/accountability')

export const createSeatApi = (data: any) =>
  api.post('/accountability', data)

export const updateSeatApi = (id: string, data: any) =>
  api.put(`/accountability/${id}`, data)

export const deleteSeatApi = (id: string) =>
  api.delete(`/accountability/${id}`)

// ── Meetings ──────────────────────────────────────────────────────────────────
export const getMeetingsApi = (team?: string) =>
  api.get('/meetings', { params: { team } })

export const createMeetingApi = (data: any) =>
  api.post('/meetings', data)

export const updateMeetingApi = (id: string, data: any) =>
  api.put(`/meetings/${id}`, data)

export const deleteMeetingApi = (id: string) =>
  api.delete(`/meetings/${id}`)

export const sendMeetingReminderApi = (id: string, emails?: string[]) =>
  api.post(`/meetings/${id}/reminder`, emails ? { emails } : {})

// ── Integrations — QuickBooks ─────────────────────────────────────────────────
export const getQBOSummaryApi = () =>
  api.get('/integrations/qbo')

export const getQBOStatusApi = () =>
  api.get('/integrations/qbo/status')

export const disconnectQBOApi = () =>
  api.post('/integrations/qbo/disconnect')

// ── Integrations — JobNimbus ──────────────────────────────────────────────────
export const getJobNimbusStatusApi = () =>
  api.get('/integrations/jobnimbus/status')

export const getJobNimbusSummaryApi = () =>
  api.get('/integrations/jobnimbus')

export const getJobNimbusAnalyticsApi = (days = 90) =>
  api.get('/integrations/jobnimbus/analytics', { params: { days } })

export const configureJobNimbusApi = () =>
  api.post('/integrations/jobnimbus/configure')

export const regenerateJobNimbusTokenApi = () =>
  api.post('/integrations/jobnimbus/regenerate')

export const disconnectJobNimbusApi = () =>
  api.post('/integrations/jobnimbus/disconnect')

// ── Meetings — ICS export ─────────────────────────────────────────────────────
export const downloadMeetingIcsApi = (id: string) =>
  api.get(`/meetings/${id}/ics`, { responseType: 'blob' })

export default api

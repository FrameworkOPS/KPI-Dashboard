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

// Plain-language fallbacks for responses that carry no error text of their
// own. Pages show `error.message`, so this is what people read.
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Check the form and try again.',
  403: "You don't have permission to do that.",
  404: 'That item no longer exists. It may have been removed.',
  409: 'That conflicts with something that already exists.',
  413: 'That file is too large.',
  429: 'Too many requests. Wait a moment and try again.',
  500: 'Something went wrong on the server. Nothing was changed; try again.',
  502: 'The server is restarting. Try again in a moment.',
  503: 'That service is unavailable right now.',
}

// Response interceptor: redirect on session expiry and make every error
// readable before it reaches a page's catch block.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 from the login request means "wrong credentials" — let the Login
    // page show the error rather than reloading it away (session-expiry
    // redirects only make sense for already-authenticated requests).
    const isLoginRequest = (error.config?.url || '').includes('/auth/login')
    const publicPage = /^\/(login|set-password|eula|privacy)/.test(window.location.pathname)
    if (error.response?.status === 401 && !isLoginRequest && !publicPage) {
      localStorage.removeItem('token')
      // Come back to this page after signing in again.
      const next = window.location.pathname + window.location.search
      window.location.href = next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'
    }
    const status: number | undefined = error.response?.status
    const serverMessage = error.response?.data?.error
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      error.message = serverMessage
    } else if (status && STATUS_MESSAGES[status]) {
      error.message = STATUS_MESSAGES[status]
    } else if (!error.response) {
      error.message = 'Could not reach the server. Check your connection and try again.'
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginApi = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const getMeApi = () =>
  api.get('/auth/me')

// ── Invitations ───────────────────────────────────────────────────────────────
export const getInviteApi = (token: string) =>
  api.get(`/auth/invite/${token}`)

export const acceptInviteApi = (token: string, password: string) =>
  api.post('/auth/accept-invite', { token, password })

export const resendInviteApi = (id: string) =>
  api.post(`/users/${id}/resend-invite`)

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsersApi = () =>
  api.get('/users')

// Minimal roster (id, name, team) — usable by any authenticated user, unlike
// getUsersApi() which is admin-only. Use this for "assign to" pickers.
export const getUsersRosterApi = () =>
  api.get('/users/roster')

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

// Metric templates define which rows a team's scorecard has. Writes are
// leadership/admin only, enforced server-side.
export const getScorecardTemplatesAdminApi = (team: string) =>
  api.get('/scorecard/templates', { params: { team, include_inactive: true } })

export const createScorecardTemplateApi = (data: any) =>
  api.post('/scorecard/templates', data)

export const updateScorecardTemplateApi = (id: string, data: any) =>
  api.put(`/scorecard/templates/${id}`, data)

export const deleteScorecardTemplateApi = (id: string) =>
  api.delete(`/scorecard/templates/${id}`)

export const reorderScorecardTemplatesApi = (team: string, ordered_ids: string[]) =>
  api.put('/scorecard/templates/reorder', { team, ordered_ids })

// Sets a metric's goal on its template and on recorded weeks from
// effective_from (default: this week) on, re-scoring those weeks.
export const updateScorecardGoalApi = (data: {
  team: string
  metric_name: string
  goal: number | null
  effective_from?: string
}) => api.put('/scorecard/goal', data)

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

export const voteIssueApi = (id: string) =>
  api.post(`/issues/${id}/vote`)

export const unvoteIssueApi = (id: string) =>
  api.delete(`/issues/${id}/vote`)

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

export const listSeatDocumentsApi = (seatId: string) =>
  api.get(`/accountability/${seatId}/documents`)

export const uploadSeatDocumentApi = (seatId: string, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/accountability/${seatId}/documents`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Inline-stored docs go through our auth-gated endpoint; fetch as blob so we
// can attach the bearer token, then return an object URL the browser can open.
export const downloadSeatDocumentBlobApi = async (docId: string): Promise<string> => {
  const res = await api.get(`/accountability/documents/${docId}/download`, { responseType: 'blob' })
  return URL.createObjectURL(res.data as Blob)
}

export const deleteSeatDocumentApi = (docId: string) =>
  api.delete(`/accountability/documents/${docId}`)

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

// Meeting runner
export const startMeetingApi = (id: string) =>
  api.post(`/meetings/${id}/start`)

export const getMeetingStagesApi = (id: string) =>
  api.get(`/meetings/${id}/stages`)

export const advanceMeetingStageApi = (id: string, stage_key?: string) =>
  api.post(`/meetings/${id}/advance`, stage_key ? { stage_key } : {})

export const completeMeetingApi = (
  id: string,
  attendance: { user_id: string; status: 'present' | 'absent'; rating?: number | null; comments?: string | null }[],
) => api.post(`/meetings/${id}/complete`, { attendance })

// ── People Analyzer (admin) ───────────────────────────────────────────────────
export const listCoreValuesApi = () =>
  api.get('/people-analyzer/core-values')

export const createCoreValueApi = (data: { name: string; description?: string; sort_order?: number }) =>
  api.post('/people-analyzer/core-values', data)

export const updateCoreValueApi = (
  id: string,
  data: { name?: string; description?: string; sort_order?: number; is_active?: boolean },
) => api.put(`/people-analyzer/core-values/${id}`, data)

export const deleteCoreValueApi = (id: string) =>
  api.delete(`/people-analyzer/core-values/${id}`)

export const listAnalyzerEntriesApi = (quarter: number, year: number) =>
  api.get('/people-analyzer/entries', { params: { quarter, year } })

export const upsertAnalyzerEntryApi = (data: {
  subject_user_id: string;
  quarter: number;
  year: number;
  value_scores: Record<string, string>;
  gwc_get: boolean | null;
  gwc_want: boolean | null;
  gwc_capacity: boolean | null;
  notes?: string;
}) => api.post('/people-analyzer/entries', data)

// ── Integrations — QuickBooks ─────────────────────────────────────────────────
export const getQBOSummaryApi = () =>
  api.get('/integrations/qbo')

export const getQBOStatusApi = () =>
  api.get('/integrations/qbo/status')

export const disconnectQBOApi = () =>
  api.post('/integrations/qbo/disconnect')

// ── Meetings — ICS export ─────────────────────────────────────────────────────
export const downloadMeetingIcsApi = (id: string) =>
  api.get(`/meetings/${id}/ics`, { responseType: 'blob' })

export default api

// ── Forecaster: crews, pipeline, sales forecast, capacity blocks, metrics ────
// These wrap the shared client so an expired session goes to sign-in and
// failures carry readable messages, instead of pages showing empty data.
export const getCrewsApi = (activeOnly = true) =>
  api.get('/crews', { params: activeOnly ? { active: 'true' } : {} })

export const createCrewApi = (data: any) =>
  api.post('/crews', data)

export const updateCrewApi = (id: string, data: any) =>
  api.put(`/crews/${id}`, data)

export const deleteCrewApi = (id: string) =>
  api.delete(`/crews/${id}`)

export const getCrewStaffApi = (crewId: string) =>
  api.get(`/crew-staff/crew/${crewId}`)

export const setCrewStaffApi = (data: { crewId: string; leadCount: number; superCount: number; addedDate: string }) =>
  api.post('/crew-staff', data)

export const getPipelineApi = () =>
  api.get('/pipeline')

export const getPipelineSummaryApi = () =>
  api.get('/pipeline/summary')

export const createPipelineItemApi = (data: any) =>
  api.post('/pipeline', data)

export const updatePipelineItemApi = (id: string, data: any) =>
  api.put(`/pipeline/${id}`, data)

export const deletePipelineItemApi = (id: string) =>
  api.delete(`/pipeline/${id}`)

export const getSalesForecastApi = (startWeek: string, endWeek: string) =>
  api.get('/sales-forecast', { params: { startWeek, endWeek } })

export const setSalesForecastApi = (data: { forecastWeek: string; jobType: string; projectedSquareFootage: number; projectedJobCount?: number }) =>
  api.post('/sales-forecast', data)

export const getCustomProjectsApi = () =>
  api.get('/custom-projects')

export const createCustomProjectApi = (data: any) =>
  api.post('/custom-projects', data)

export const updateCustomProjectApi = (id: string, data: any) =>
  api.put(`/custom-projects/${id}`, data)

export const deleteCustomProjectApi = (id: string) =>
  api.delete(`/custom-projects/${id}`)

export const getProductionForecastApi = (weeks: number) =>
  api.get('/forecasts/six-month', { params: { weeks } })

export const getMetricsDashboardApi = () =>
  api.get('/metrics/dashboard')

// ── AI assistants ─────────────────────────────────────────────────────────────
export const getSkyStatusApi = () =>
  api.get('/sky/status')

export const skyChatApi = (messages: { role: 'user' | 'assistant'; content: string }[]) =>
  api.post('/sky/chat', { messages })

export const getForecasterAiStatusApi = () =>
  api.get('/forecaster-ai/status')

export const forecasterAiChatApi = (messages: { role: 'user' | 'assistant'; content: string }[]) =>
  api.post('/forecaster-ai/chat', { messages })

// ── Integrations ──────────────────────────────────────────────────────────────
export const getQboConnectUrlApi = () =>
  api.get<{ url: string }>('/integrations/qbo/connect')

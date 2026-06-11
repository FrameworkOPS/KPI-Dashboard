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

export interface JobNimbusAnalyticsParams {
  from?: string         // ISO date
  to?: string           // ISO date
  compare_from?: string
  compare_to?: string
  rep?: string | null
  source?: string | null
  record_type?: string | null
  days?: number         // back-compat fallback
}

export const getJobNimbusAnalyticsApi = (params: JobNimbusAnalyticsParams = {}) =>
  api.get('/integrations/jobnimbus/analytics', { params })

export const syncJobNimbusApi = () =>
  api.post('/integrations/jobnimbus/sync')

export interface JobNimbusJobsParams {
  dimension: string
  key?: string
  from?: string
  to?: string
  rep?: string | null
  source?: string | null
  record_type?: string | null
  days?: number
  limit?: number
}

export const getJobNimbusJobsApi = (params: JobNimbusJobsParams) =>
  api.get('/integrations/jobnimbus/jobs', { params })

// Build a URL string (with auth) for downloading the drill-down as CSV.
// Returns { url, headers } so the caller can fetch with the right Authorization.
export const buildJobNimbusJobsCsvUrl = (params: JobNimbusJobsParams) => {
  const qs = new URLSearchParams({ ...params, format: 'csv' } as any).toString()
  return `/api/integrations/jobnimbus/jobs?${qs}`
}

export const getJobNimbusTargetsApi = () =>
  api.get('/integrations/jobnimbus/targets')

export const setJobNimbusTargetsApi = (targets: {
  weekly_sold?: number | null; monthly_sold?: number | null
  weekly_billed?: number | null; monthly_billed?: number | null
}) => api.put('/integrations/jobnimbus/targets', targets)

// ── Meetings — ICS export ─────────────────────────────────────────────────────
export const downloadMeetingIcsApi = (id: string) =>
  api.get(`/meetings/${id}/ics`, { responseType: 'blob' })

export default api

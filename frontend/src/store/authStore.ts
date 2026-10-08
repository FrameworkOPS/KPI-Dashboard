import { create } from 'zustand'
import { User } from '../types'
import { loginApi, getMeApi } from '../services/api'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadUser: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  // Start in loading state when a token exists so ProtectedRoute shows a
  // spinner instead of immediately redirecting to /login on page refresh.
  loading: !!localStorage.getItem('token'),
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const response = await loginApi(email, password)
      const { token, user } = response.data
      localStorage.setItem('token', token)
      set({ token, user, isAuthenticated: true, loading: false })
    } catch (err: any) {
      const message = !err.response
        ? 'Could not reach the server. Check your connection and try again.'
        : err.response.status === 429
          ? err.response.data?.error || 'Too many sign-in attempts. Wait a few minutes and try again.'
          : err.response.data?.error || 'Invalid email or password'
      set({ loading: false, error: message, isAuthenticated: false })
      throw new Error(message)
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    // Nothing from this session should greet the next person on a shared device.
    for (const key of ['sky_chat_history_v1', 'forecaster_ai_history_v1']) localStorage.removeItem(key)
    if ('caches' in window) caches.keys().then((keys) => keys.forEach((k) => { if (k.includes('api')) caches.delete(k) })).catch(() => {})
    set({ user: null, token: null, isAuthenticated: false, error: null })
  },

  loadUser: async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      set({ isAuthenticated: false, loading: false })
      return
    }
    set({ loading: true })

    // Safety timeout: a cold-started server can take a while, so give it
    // 20s before showing the sign-in form. The token is kept; if /auth/me
    // answers later the Login page sends the person straight back in.
    const timeout = setTimeout(() => {
      set({ loading: false, isAuthenticated: false })
    }, 20000)

    try {
      const response = await getMeApi()
      clearTimeout(timeout)
      set({ user: response.data, isAuthenticated: true, loading: false })
    } catch (err: any) {
      clearTimeout(timeout)
      // Only a rejected token ends the session. A network blip or a 5xx
      // keeps the token so a retry can succeed.
      const status = err?.response?.status
      if (status === 401 || status === 403) {
        localStorage.removeItem('token')
        set({ user: null, token: null, isAuthenticated: false, loading: false })
      } else {
        set({ isAuthenticated: false, loading: false })
      }
    }
  },

  clearError: () => set({ error: null }),
}))

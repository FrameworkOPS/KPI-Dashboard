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
      const message =
        err.response?.data?.message || 'Invalid email or password'
      set({ loading: false, error: message, isAuthenticated: false })
      throw new Error(message)
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, isAuthenticated: false, error: null })
  },

  loadUser: async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      set({ isAuthenticated: false, loading: false })
      return
    }
    set({ loading: true })

    // Safety timeout — if the API doesn't respond in 8s, stop the spinner
    const timeout = setTimeout(() => {
      set({ loading: false, isAuthenticated: false })
    }, 8000)

    try {
      const response = await getMeApi()
      clearTimeout(timeout)
      set({ user: response.data, isAuthenticated: true, loading: false })
    } catch {
      clearTimeout(timeout)
      localStorage.removeItem('token')
      set({ user: null, token: null, isAuthenticated: false, loading: false })
    }
  },

  clearError: () => set({ error: null }),
}))

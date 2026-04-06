import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Login from './pages/Login'
import EULA from './pages/EULA'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Dashboard from './pages/Dashboard'
import Scorecard from './pages/Scorecard'
import Rocks from './pages/Rocks'
import Issues from './pages/Issues'
import Todos from './pages/Todos'
import VTO from './pages/VTO'
import Accountability from './pages/Accountability'
import Meetings from './pages/Meetings'
import UserManagement from './pages/UserManagement'
import Integrations from './pages/Integrations'

const App: React.FC = () => {
  const { loadUser } = useAuthStore()

  useEffect(() => {
    loadUser()
  }, [loadUser])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected — wrapped in Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scorecard"
          element={
            <ProtectedRoute>
              <Layout>
                <Scorecard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rocks"
          element={
            <ProtectedRoute>
              <Layout>
                <Rocks />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/issues"
          element={
            <ProtectedRoute>
              <Layout>
                <Issues />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/todos"
          element={
            <ProtectedRoute>
              <Layout>
                <Todos />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/vto"
          element={
            <ProtectedRoute roles={['admin', 'leadership']}>
              <Layout>
                <VTO />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accountability"
          element={
            <ProtectedRoute>
              <Layout>
                <Accountability />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings"
          element={
            <ProtectedRoute>
              <Layout>
                <Meetings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Layout>
                <UserManagement />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/integrations"
          element={
            <ProtectedRoute roles={['admin']}>
              <Layout>
                <Integrations />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Public legal pages */}
        <Route path="/eula" element={<EULA />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

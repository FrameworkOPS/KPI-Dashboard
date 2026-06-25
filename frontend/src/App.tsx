import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'

import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import EULA from './pages/EULA'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Dashboard from './pages/Dashboard'
import Scorecard from './pages/Scorecard'
import Rocks from './pages/Rocks'
import Issues from './pages/Issues'
import Todos from './pages/Todos'
import VTO from './pages/VTO'
import Accountability from './pages/Accountability'
import LearningDen from './pages/LearningDen'
import Meetings from './pages/Meetings'
import UserManagement from './pages/UserManagement'
import Integrations from './pages/Integrations'
import JobNimbusDashboard from './pages/JobNimbusDashboard'
import PeopleAnalyzer from './pages/PeopleAnalyzer'
import Pipeline from './pages/Pipeline'
import Crews from './pages/Crews'
import SalesForecast from './pages/SalesForecast'
import ProductionForecast from './pages/ProductionForecast'
import Metrics from './pages/Metrics'
import CustomProjects from './pages/CustomProjects'
import ForecasterAI from './pages/ForecasterAI'

const App: React.FC = () => {
  const { loadUser } = useAuthStore()

  useEffect(() => {
    loadUser()
  }, [loadUser])

  return (
    <ErrorBoundary>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/set-password" element={<SetPassword />} />

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
          path="/learning-den"
          element={
            <ProtectedRoute>
              <Layout>
                <LearningDen />
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
          path="/jobnimbus"
          element={
            <ProtectedRoute roles={['admin', 'leadership']}>
              <Layout>
                <JobNimbusDashboard />
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

        <Route
          path="/people-analyzer"
          element={
            <ProtectedRoute roles={['admin']}>
              <Layout>
                <PeopleAnalyzer />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Forecaster */}
        <Route path="/pipeline" element={<ProtectedRoute><Layout><Pipeline /></Layout></ProtectedRoute>} />
        <Route path="/crews" element={<ProtectedRoute><Layout><Crews /></Layout></ProtectedRoute>} />
        <Route path="/sales-forecast" element={<ProtectedRoute><Layout><SalesForecast /></Layout></ProtectedRoute>} />
        <Route path="/production-forecast" element={<ProtectedRoute><Layout><ProductionForecast /></Layout></ProtectedRoute>} />
        <Route path="/metrics" element={<ProtectedRoute><Layout><Metrics /></Layout></ProtectedRoute>} />
        <Route path="/capacity-blocks" element={<ProtectedRoute><Layout><CustomProjects /></Layout></ProtectedRoute>} />
        <Route path="/forecaster-ai" element={<ProtectedRoute><Layout><ForecasterAI /></Layout></ProtectedRoute>} />

        {/* Public legal pages */}
        <Route path="/eula" element={<EULA />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App

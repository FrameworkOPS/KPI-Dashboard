import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import QuickAdd from './QuickAdd'
import SkyChat from './SkyChat'
import ErrorBoundary from './ErrorBoundary'

interface LayoutProps {
  children: React.ReactNode
}

const pageTitles: Record<string, string> = {
  '/':               'Dashboard',
  '/scorecard':      'Scorecard',
  '/rocks':          'Rocks',
  '/issues':         'Issues',
  '/todos':          'To-Dos',
  '/vto':            'V/TO',
  '/accountability': 'Accountability',
  '/learning-den':   'Learning Den',
  '/meetings':       'Meetings',
  '/users':          'Users',
  '/integrations':   'Integrations',
  '/people-analyzer': 'People Analyzer',
  '/pipeline':       'Pipeline',
  '/crews':          'Crews',
  '/sales-forecast': 'Sales Forecast',
  '/production-forecast': 'Production',
  '/metrics':        'Metrics',
  '/capacity-blocks': 'Capacity Blocks',
  '/forecaster-ai':  'Forecaster AI',
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const pageTitle = pageTitles[location.pathname] ?? 'KPI Dashboard'
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  // The drawer is a modal: Escape closes it, focus moves into it on open and
  // back to the menu button on close.
  useEffect(() => {
    if (!drawerOpen) return
    const first = drawerRef.current?.querySelector<HTMLElement>('button, a[href]')
    first?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      menuButtonRef.current?.focus()
    }
  }, [drawerOpen])

  // Each route change scrolls the content pane back to the top.
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
        Skip to content
      </a>

      {/* ── Desktop sidebar (always visible md+) ── */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      {/* `inert` keeps the off-screen links out of the tab order while closed. */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!drawerOpen}
        {...({ inert: drawerOpen ? undefined : '' } as Record<string, unknown>)}
        className={`
          fixed inset-y-0 left-0 z-50 md:hidden
          transform transition-transform duration-250 ease-in-out motion-reduce:transition-none
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar onClose={() => setDrawerOpen(false)} />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Mobile top bar ── */}
        <header className="md:hidden h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
          <button
            ref={menuButtonRef}
            onClick={() => setDrawerOpen(true)}
            className="p-2.5 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            {/* Hamburger */}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <img src="/skyright-web_logotype-color.jpg" alt="Skyright" className="h-7 w-auto object-contain flex-shrink-0" />
            <span className="text-white font-semibold text-sm truncate" aria-hidden="true">{pageTitle}</span>
          </div>

          {/* Right spacer to keep title centered */}
          <div className="w-9" />
        </header>

        {/* Bottom padding keeps the last row clear of the floating buttons. */}
        <main id="main" className="flex-1 overflow-y-auto pb-24 md:pb-8" tabIndex={-1}>
          {/* A crash on one page stays on that page; navigating away resets it. */}
          <ErrorBoundary key={location.pathname} inline>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global quick-add FAB — accessible from every page */}
      <QuickAdd />
      <SkyChat />
    </div>
  )
}

export default Layout

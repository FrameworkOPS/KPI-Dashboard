import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register the PWA service worker and auto-reload the page as soon as a new
// build takes control. Without this the user keeps seeing the cached bundle
// until they manually hard-refresh — which made the "Invalid Date" / cache
// staleness bugs feel like they hadn't been fixed.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Whether a worker already controlled this page: on the very first visit
    // there is none, and claiming the page then must not reload a form someone
    // is in the middle of filling.
    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })

    // Fires when a new SW (with skipWaiting + clientsClaim) takes over the
    // page. Reload once to pull the new index.html + JS bundles, but only
    // when nothing is being edited — a half-written note is worth more than
    // picking up a deploy a few minutes sooner.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return
      const el = document.activeElement
      const editing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
      const dialogOpen = !!document.querySelector('[role="dialog"]')
      if (editing || dialogOpen) return
      reloaded = true
      window.location.reload()
    })

    // Poll for new versions every 15 minutes so long-lived tabs (e.g. a
    // dashboard left open on a wallboard) pick up new deploys automatically.
    const HALF_HOUR = 15 * 60 * 1000
    setInterval(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      reg?.update().catch(() => { /* ignore */ })
    }, HALF_HOUR)
  })
}


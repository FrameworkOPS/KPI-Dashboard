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
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })

    // Fires when a new SW (with skipWaiting + clientsClaim) takes over the
    // page. Reload once to pull the new index.html + JS bundles.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
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


import { useEffect } from 'react'

const APP_NAME = 'KPI Dashboard'

// Keeps the browser tab, history, and screen-reader page announcement in step
// with the page a person is on. Every routed page has a unique title.
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title && title !== APP_NAME ? `${title} · ${APP_NAME}` : APP_NAME
    return () => { document.title = APP_NAME }
  }, [title])
}

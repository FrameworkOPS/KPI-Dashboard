import { useEffect } from 'react'

// Something outside a page (the quick-add button, the Sky assistant) changed
// records the page may be showing. Pages subscribe and reload in place.
export type DataKind = 'issues' | 'todos' | 'rocks' | 'meetings' | 'scorecard' | 'pipeline' | 'crews' | 'forecast' | 'any'

const EVENT = 'kpi:data-changed'

export function emitDataChanged(kinds: DataKind | DataKind[]) {
  const list = Array.isArray(kinds) ? kinds : [kinds]
  window.dispatchEvent(new CustomEvent(EVENT, { detail: list }))
}

export function useDataChanged(kinds: DataKind[], onChange: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const changed = (e as CustomEvent<DataKind[]>).detail || []
      if (changed.includes('any') || changed.some((k) => kinds.includes(k))) onChange()
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [kinds.join(','), onChange])
}

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Open dialogs, outermost first; only the top one answers Escape.
const openDialogs: symbol[] = []

/**
 * Keyboard and focus behaviour for a modal panel: focus moves into the panel
 * on open, Tab stays inside it, Escape closes it, and focus returns to the
 * element that opened it on close. Attach the returned ref to the panel and
 * give the panel role="dialog" aria-modal="true" and an accessible name.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose?: () => void) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const id = Symbol('dialog')
    openDialogs.push(id)
    const opener = document.activeElement as HTMLElement | null
    const panel = ref.current

    const first =
      panel?.querySelector<HTMLElement>('[autofocus]') ||
      panel?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') ||
      panel?.querySelector<HTMLElement>(FOCUSABLE)
    if (first) first.focus()
    else if (panel) { panel.tabIndex = -1; panel.focus() }

    const onKey = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id) return
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        if (items.length === 0) return
        const firstItem = items[0]
        const lastItem = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === firstItem || !panel.contains(document.activeElement))) {
          e.preventDefault(); lastItem.focus()
        } else if (!e.shiftKey && (document.activeElement === lastItem || !panel.contains(document.activeElement))) {
          e.preventDefault(); firstItem.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = openDialogs.indexOf(id)
      if (i >= 0) openDialogs.splice(i, 1)
      opener?.focus?.()
    }
  }, [])

  return ref
}

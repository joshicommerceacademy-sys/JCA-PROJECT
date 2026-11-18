import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Logs interaction metadata only; never records typed characters, passwords, or form values. */
export default function ActivityAuditTracker() {
  const location = useLocation()

  const send = (payload: Record<string, string | null>) => {
    const body = JSON.stringify({ ...payload, page: location.pathname, occurredAt: new Date().toISOString() })
    const token = localStorage.getItem('jca_admin_token') || localStorage.getItem('jca_student_token')
    void fetch('/api/audit/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
      keepalive: true,
    }).catch(() => undefined)
  }

  useEffect(() => {
    const labelFor = (el: Element) => {
      const aria = el.getAttribute('aria-label')
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
      return (aria || text || el.tagName.toLowerCase()).slice(0, 180)
    }
    const onClick = (event: MouseEvent) => {
      const origin = event.target
      if (!(origin instanceof Element)) return
      const interactive = origin.closest('button, a, [role="button"], input[type="button"], input[type="submit"], [data-audit-action]')
      if (interactive) send({ eventType: 'click', target: labelFor(interactive), keyAction: null })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const origin = event.target
      // Do not capture text entry or any keys typed in form fields.
      if (origin instanceof Element && (origin.matches('input, textarea, select') || origin.closest('[contenteditable="true"]'))) return
      const allowed = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', ' '])
      if (allowed.has(event.key)) send({ eventType: 'key_action', target: origin instanceof Element ? labelFor(origin) : 'document', keyAction: event.key })
    }
    const onSubmit = (event: Event) => {
      const form = event.target
      send({ eventType: 'form_submit', target: form instanceof HTMLFormElement ? (form.getAttribute('aria-label') || form.id || 'form') : 'form', keyAction: null })
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [location.pathname])

  useEffect(() => {
    send({ eventType: 'navigation', target: location.pathname, keyAction: null })
  }, [location.pathname])

  return null
}

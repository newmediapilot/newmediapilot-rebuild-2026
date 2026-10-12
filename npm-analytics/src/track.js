/**
 * GA4 auto-tracking for newmediapilot.com.
 *
 * Consent-gated twice over: `track()` reads consent and no-ops unless it is
 * 'granted', and `initAutoTracking()` is only wired up after that same decision,
 * so a visitor who declined never even gets the listeners attached.
 *
 * Almost everything is derived from the DOM by delegation, because every
 * interactive element on the page already carries a data-ident. Only outcomes
 * that cannot be read back off the DOM -- whether the contact form post
 * succeeded or failed -- are emitted directly by their component.
 */

import { readConsent } from './consent.js'

const INTERACTIVE = 'a, button, [role="button"], [data-chip], [data-share]'

const MAX_TEXT = 100

const MILESTONES = [25, 50, 75, 90, 100]

const DOWNLOAD_RE = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|txt|rtf)$/i

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)

const identOf = (el) => el?.getAttribute?.('data-ident') || ''

const sectionOf = (el) => {
  const section = el?.closest?.('section[data-ident]')
  if (section) return section.getAttribute('data-ident')
  return identOf(el?.closest?.('[data-ident]'))
}

const describe = (el) => ({
  content_type: el.tagName.toLowerCase(),
  content_id: identOf(el),
  section: sectionOf(el),
  text: clean(el.textContent),
})

/** Sends one GA4 event. Returns false when it was suppressed. */
export function track(name, params = {}) {
  if (typeof window === 'undefined') return false
  if (readConsent() !== 'granted') return false
  if (typeof window.gtag !== 'function') return false
  window.gtag('event', name, params)
  return true
}

const onceKeys = new Set()

/** Sends at most once per page view, and only records the key if it was sent. */
export function trackOnce(key, name, params = {}) {
  if (onceKeys.has(key)) return
  if (track(name, params)) onceKeys.add(key)
}

const onClick = (event) => {
  const el = event.target.closest?.(INTERACTIVE)
  if (!el) return

  const params = describe(el)
  track('select_content', params)

  const anchor = el.closest('a')
  const galleryName = anchor?.getAttribute('data-gallery-name')
  if (galleryName) track('gallery_view', { project: galleryName, section: params.section })

  const rawHref = anchor?.getAttribute('href')
  if (!rawHref) return

  if (rawHref.startsWith('mailto:')) {
    track('contact_click', { method: 'email', section: params.section })
    return
  }
  if (rawHref.startsWith('tel:')) {
    track('contact_click', { method: 'phone', section: params.section })
    return
  }

  let url
  try {
    url = new URL(anchor.href, location.href)
  } catch {
    return
  }

  if (url.origin !== location.origin) {
    track('outbound_click', { link_url: url.href, link_domain: url.host, section: params.section })
  }

  if (DOWNLOAD_RE.test(url.pathname)) {
    const file = decodeURIComponent(url.pathname.split('/').pop() || '')
    track('file_download', {
      file_name: file,
      file_extension: file.includes('.') ? file.split('.').pop() : '',
      link_url: url.href,
    })
  }
}

const hovered = new WeakSet()

// pointerenter does not bubble, so this only works in the capture phase.
const onPointerEnter = (event) => {
  const el = event.target.closest?.(INTERACTIVE)
  if (!el || hovered.has(el)) return
  hovered.add(el)
  track('hover', describe(el))
}

const reached = new Set()

const measureScroll = () => {
  const root = document.documentElement
  const max = root.scrollHeight - window.innerHeight
  const percent = max <= 0 ? 100 : Math.round((window.scrollY / max) * 100)
  for (const mark of MILESTONES) {
    if (percent >= mark && !reached.has(mark) && track('scroll_depth', { percent: mark })) {
      reached.add(mark)
    }
  }
}

let ticking = false

const onScroll = () => {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    measureScroll()
  })
}

const onFocusIn = (event) => {
  if (event.target.closest?.('[data-contact-form] input, [data-contact-form] textarea')) {
    trackOnce('form-start', 'form_start', { form: 'contact' })
  }
}

const onSubmit = (event) => {
  if (event.target.matches?.('[data-contact-form]')) track('form_submit', { form: 'contact' })
}

let attached = false

/** Attaches the delegated listeners. Safe to call more than once. */
export function initAutoTracking() {
  if (attached || typeof window === 'undefined') return
  attached = true

  document.addEventListener('click', onClick)
  document.addEventListener('pointerenter', onPointerEnter, true)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('submit', onSubmit, true)
  window.addEventListener('scroll', onScroll, { passive: true })

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('toggle', (event) => {
      track(event.newState === 'open' ? 'modal_open' : 'modal_close', { modal: dialog.id })
    })
  }

  measureScroll()
}

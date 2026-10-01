/**
 * GA4 consent state, shared by Analytics.astro and ConsentBanner.astro.
 *
 * The two components talk through this module rather than through each other:
 * ConsentBanner writes a decision and dispatches, Analytics listens and loads
 * gtag.js. That way accepting takes effect without a page reload, and the
 * banner does not have to know whether analytics is already running.
 */

const CONSENT_KEY = 'nmp-ga-consent'
const CONSENT_EVENT = 'nmp:consent-change'

/** @returns {'granted' | 'denied' | null} null means the visitor has not been asked yet. */
export function readConsent() {
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    // Private mode and blocked storage both throw here. Treating that as "not
    // decided" means the banner stays available instead of the site silently
    // picking a decision on the visitor's behalf.
    return null
  }
}

export function writeConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // Nothing to do: the in-memory decision below still applies for this page
    // view, we just cannot remember it for the next one.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
}

/**
 * Fires immediately with the stored decision, then again on every change.
 * @param {(value: 'granted' | 'denied') => void} handler
 */
export function onConsentChange(handler) {
  const listener = (event) => handler(event.detail)
  window.addEventListener(CONSENT_EVENT, listener)
  const current = readConsent()
  if (current) handler(current)
  return () => window.removeEventListener(CONSENT_EVENT, listener)
}

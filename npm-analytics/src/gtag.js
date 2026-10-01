/**
 * Injects gtag.js and sends the initial page_view.
 *
 * Called only after consent is granted, so nothing here runs on a page view the
 * visitor declined. Kept out of the component so the "already loaded" guard
 * survives Astro's client-side navigation between pages, where the script tag
 * from the previous page is still in the document.
 */

const SRC = 'https://www.googletagmanager.com/gtag/js?id='

export function loadGtag(measurementId) {
  if (!measurementId) return
  if (document.querySelector(`script[src^="${SRC}"]`)) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function () {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId)

  const script = document.createElement('script')
  script.async = true
  script.src = SRC + encodeURIComponent(measurementId)
  document.head.appendChild(script)
}

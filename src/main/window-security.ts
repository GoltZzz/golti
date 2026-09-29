import { randomUUID } from 'crypto'
import { app, protocol, shell, type WebContents } from 'electron'
import { PREVIEW_CSP, PREVIEW_SCHEME } from '../shared/content-security-policy'

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Links the OS browser or mail client may open; everything else is dropped. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * Whether `url` is the app's own page: the dev server origin in development,
 * or the bundled index.html in production.
 */
export function isAppUrl(url: string, appEntryUrl: string): boolean {
  try {
    const target = new URL(url)
    const entry = new URL(appEntryUrl)
    if (entry.protocol === 'file:') {
      return target.protocol === 'file:' && target.pathname === entry.pathname
    }
    return target.origin === entry.origin
  } catch {
    return false
  }
}

function openExternally(url: string): void {
  if (isSafeExternalUrl(url)) {
    shell.openExternal(url).catch((err) => console.warn('[security] openExternal failed:', err))
  }
}

/**
 * Keeps every window on the app's own page. Links that would open a new window
 * or navigate away (citations, markdown links) go to the system browser, so a
 * remote page never loads with the preload bridge attached.
 */
export function installNavigationGuards(getAppEntryUrl: () => string): void {
  app.on('web-contents-created', (_, contents: WebContents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternally(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (isAppUrl(url, getAppEntryUrl())) return
      event.preventDefault()
      openExternally(url)
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })
}

// Canvas previews -----------------------------------------------------------

const MAX_PREVIEWS = 32
const previews = new Map<string, string>()

/** Must run before `app.whenReady()` resolves. */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true } }
  ])
}

export function handlePreviewScheme(): void {
  protocol.handle(PREVIEW_SCHEME, (request) => {
    const html = previews.get(new URL(request.url).hostname)
    if (html === undefined) return new Response('Preview expired', { status: 404 })
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': PREVIEW_CSP
      }
    })
  })
}

/** Stores a canvas document and returns the URL its iframe should load. */
export function registerPreview(html: string): string {
  const id = randomUUID()
  previews.set(id, html)
  // Only the most recent canvases can be on screen; drop the oldest.
  while (previews.size > MAX_PREVIEWS) {
    previews.delete(previews.keys().next().value!)
  }
  return `${PREVIEW_SCHEME}://${id}/`
}

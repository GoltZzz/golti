/** Custom scheme that serves model-written HTML canvases outside the app's own CSP. */
export const PREVIEW_SCHEME = 'golti-preview'

function serialize(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ')
}

/**
 * Policy for the app window. Scripts only load from the app bundle, so markup
 * injected from model output (SVG, mermaid) can't run inline handlers, and
 * nothing is fetched from the network except fonts and remote images.
 *
 * Vite's dev server needs an inline React Refresh preamble and an HMR
 * websocket, so dev builds relax exactly those two things.
 */
export function buildRendererCsp({ dev }: { dev: boolean }): string {
  return serialize({
    'default-src': ["'self'"],
    'script-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'connect-src': dev ? ["'self'", 'ws://localhost:*', 'ws://127.0.0.1:*'] : ["'self'"],
    'frame-src': [`${PREVIEW_SCHEME}:`],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"]
  })
}

/**
 * Policy for canvas previews. They run in a sandboxed iframe with an opaque
 * origin, so they may use inline scripts and CDN libraries but can never reach
 * the app or its API.
 */
export const PREVIEW_CSP = serialize({
  'default-src': ["'none'"],
  'script-src': ["'unsafe-inline'", 'https:'],
  'style-src': ["'unsafe-inline'", 'https:'],
  'font-src': ['data:', 'https:'],
  'img-src': ['data:', 'blob:', 'https:'],
  'media-src': ['data:', 'blob:', 'https:'],
  'connect-src': ['https:'],
  'base-uri': ["'none'"],
  'form-action': ["'none'"]
})

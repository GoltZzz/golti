import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { on: vi.fn() }, protocol: {}, shell: {} }))

import { isAppUrl, isSafeExternalUrl, registerPreview } from './window-security'
import { buildRendererCsp, PREVIEW_SCHEME } from '../shared/content-security-policy'

describe('window security', () => {
  it('only hands web and mail links to the OS', () => {
    expect(isSafeExternalUrl('https://example.com/a')).toBe(true)
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('recognises the app page in dev and production', () => {
    expect(isAppUrl('http://localhost:5173/#/chat', 'http://localhost:5173')).toBe(true)
    expect(isAppUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isAppUrl('https://evil.example/', 'http://localhost:5173')).toBe(false)

    const entry = 'file:///opt/golti/resources/app/out/renderer/index.html'
    expect(isAppUrl(`${entry}#settings`, entry)).toBe(true)
    expect(isAppUrl('file:///home/user/other.html', entry)).toBe(false)
  })

  it('serves previews from their own scheme', () => {
    expect(registerPreview('<p>hi</p>')).toMatch(new RegExp(`^${PREVIEW_SCHEME}://[0-9a-f-]+/$`))
  })

  it('keeps inline scripts out of production builds', () => {
    const prod = buildRendererCsp({ dev: false })
    expect(prod).toContain("script-src 'self';")
    expect(prod).toContain(`frame-src ${PREVIEW_SCHEME}:`)
    expect(buildRendererCsp({ dev: true })).toContain("script-src 'self' 'unsafe-inline'")
  })
})

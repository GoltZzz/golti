import { describe, expect, it } from 'vitest'
import { cancelOllamaDownload, getBinaryDownloadUrl, getPlatformBinaryKey, getBinaryPath, isBinaryInstalled, getSystemBinaryPath } from './ollama-binary-manager'

describe('ollama binary manager', () => {
  it('returns a valid platform binary key', () => {
    const key = getPlatformBinaryKey()
    expect(['darwin', 'windows-amd64', 'windows-arm64', 'linux-amd64', 'linux-arm64']).toContain(key)
  })

  it('generates correct release download URLs with asset extensions', () => {
    const url = getBinaryDownloadUrl('v0.5.12')
    expect(url).toMatch(/^https:\/\/github\.com\/ollama\/ollama\/releases\/download\/v0\.5\.12\/.+/)
    expect(url).toMatch(/\.(zip|tgz)$/)
  })

  it('handles cancellation status gracefully when no active download exists', () => {
    expect(cancelOllamaDownload()).toBe(false)
  })

  it('resolves binary path or returns default/system path', () => {
    const binaryPath = getBinaryPath()
    expect(binaryPath).toBeTruthy()
    if (process.platform === 'darwin' && binaryPath.includes('.app')) {
      expect(binaryPath).not.toContain('.app/Contents/MacOS/')
      expect(binaryPath).toContain('.app/Contents/Resources/ollama')
    }
  })

  it('checks system binary path without crashing', () => {
    const sysPath = getSystemBinaryPath()
    if (sysPath) {
      expect(sysPath).toMatch(/ollama(\.exe)?$/)
    }
  })
})

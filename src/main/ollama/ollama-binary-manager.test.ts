import { describe, expect, it } from 'vitest'
import { cancelOllamaDownload, getBinaryDownloadUrl, getPlatformBinaryKey, getBinaryPath, isBinaryInstalled, getSystemBinaryPath, stopSystemdOllama, supportsRocmVariant, usesZstdAssets } from './ollama-binary-manager'

describe('ollama binary manager', () => {
  it('returns a valid platform binary key', () => {
    const key = getPlatformBinaryKey()
    expect(['darwin', 'windows-amd64', 'windows-arm64', 'linux-amd64', 'linux-arm64']).toContain(key)
  })

  it('generates correct release download URLs with asset extensions', () => {
    const url = getBinaryDownloadUrl('v0.5.12')
    expect(url).toMatch(/^https:\/\/github\.com\/ollama\/ollama\/releases\/download\/v0\.5\.12\/.+/)
    expect(url).toMatch(/\.(zip|tgz|tar\.zst)$/)
  })

  it('knows which releases publish zstd tarballs', () => {
    expect(usesZstdAssets('v0.13.0')).toBe(false)
    expect(usesZstdAssets('v0.5.12')).toBe(false)
    expect(usesZstdAssets('v0.14.0')).toBe(true)
    expect(usesZstdAssets('v0.32.4')).toBe(true)
    expect(usesZstdAssets('v1.0.0')).toBe(true)
  })

  it('uses the gzip tarball for pre-0.14 Linux releases and zstd after', () => {
    if (!getPlatformBinaryKey().startsWith('linux')) return
    expect(getBinaryDownloadUrl('v0.13.0')).toMatch(/\.tgz$/)
    expect(getBinaryDownloadUrl('v0.14.0')).toMatch(/\.tar\.zst$/)
  })

  it('requests the rocm overlay asset only where upstream publishes one', () => {
    if (supportsRocmVariant()) {
      expect(getBinaryDownloadUrl('v0.32.4', 'rocm')).toContain('-rocm.')
    } else {
      expect(() => getBinaryDownloadUrl('v0.32.4', 'rocm')).toThrow(/ROCm/i)
    }
  })

  it('keeps the base asset free of the rocm suffix', () => {
    expect(getBinaryDownloadUrl('v0.32.4')).not.toContain('-rocm')
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

  describe('stopSystemdOllama', () => {
    it('refuses to stop a non-systemd process', () => {
      const result = stopSystemdOllama({})
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/not a systemd/i)
    })

    it('does not attempt to stop a privileged system unit, surfacing the manual command', () => {
      const result = stopSystemdOllama({ serviceUnit: 'ollama.service', needsPrivilegedStop: true })
      expect(result.ok).toBe(false)
      expect(result.message).toContain('sudo systemctl stop ollama.service')
    })
  })
})

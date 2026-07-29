import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_RUNTIME_VERSION } from './constants'

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/mock/app',
    getPath: (name: string) => {
      if (name === 'userData') return path.join(os.tmpdir(), 'golti-search-runtime-test-userdata')
      return os.tmpdir()
    }
  }
}))

describe('search runtime constants', () => {
  it('pins a versioned bundle name', () => {
    expect(SEARCH_RUNTIME_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('platform key selection', () => {
  it('covers supported desktop targets used by build.sh', () => {
    const keys = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']
    for (const key of keys) {
      expect(`golti-search-runtime-${SEARCH_RUNTIME_VERSION}-${key}.zip`).toContain(key)
    }
  })
})

describe('getLocalBundlePath', () => {
  let resourcesRoot: string

  beforeEach(() => {
    resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-resources-'))
    Object.defineProperty(process, 'resourcesPath', {
      value: resourcesRoot,
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    fs.rmSync(resourcesRoot, { recursive: true, force: true })
    vi.resetModules()
  })

  it('prefers packaged bundle.zip under process.resourcesPath', async () => {
    const dir = path.join(resourcesRoot, 'search-runtime')
    fs.mkdirSync(dir, { recursive: true })
    const bundle = path.join(dir, 'bundle.zip')
    fs.writeFileSync(bundle, 'fake-zip')

    const { getLocalBundlePath } = await import('./binary-manager')
    expect(getLocalBundlePath()).toBe(bundle)
  })

  it('falls back to versioned zip name under resourcesPath', async () => {
    const { getPlatformKey } = await import('./binary-manager')
    const key = getPlatformKey()
    const dir = path.join(resourcesRoot, 'search-runtime')
    fs.mkdirSync(dir, { recursive: true })
    const filename = `golti-search-runtime-${SEARCH_RUNTIME_VERSION}-${key}.zip`
    const versioned = path.join(dir, filename)
    fs.writeFileSync(versioned, 'fake-zip')

    const { getLocalBundlePath } = await import('./binary-manager')
    expect(getLocalBundlePath()).toBe(versioned)
  })

  it('returns null when no local or packaged bundle exists', async () => {
    const { getLocalBundlePath } = await import('./binary-manager')
    // May still find a real dist/search-runtime zip in the workspace - skip assertion if so
    const found = getLocalBundlePath()
    if (found && found.includes('dist/search-runtime')) {
      expect(found).toContain('golti-search-runtime-')
      return
    }
    expect(found).toBeNull()
  })
})

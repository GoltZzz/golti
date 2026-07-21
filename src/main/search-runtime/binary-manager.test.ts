import { describe, expect, it } from 'vitest'
import { SEARCH_RUNTIME_VERSION } from './constants'

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

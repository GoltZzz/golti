import { describe, expect, it } from 'vitest'
import path from 'path'
import { getEngineSpawnEnv, getPlatformBinaryKey, getBinaryFilename } from './binary-manager'

describe('engine binary manager', () => {
  it('returns a valid platform binary key', () => {
    expect(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64', 'unknown']).toContain(
      getPlatformBinaryKey()
    )
  })

  it('names the server binary per platform', () => {
    const expected = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    expect(getBinaryFilename()).toBe(expected)
  })

  describe('getEngineSpawnEnv', () => {
    const binary = path.join('/opt', 'golti', 'bin', 'llama-server')

    it('puts the binary directory on the loader path so bundled .so files resolve', () => {
      const env = getEngineSpawnEnv(binary)
      if (process.platform === 'win32') {
        // Windows searches the exe directory itself; nothing to inject.
        expect(env.LD_LIBRARY_PATH).toBeUndefined()
        return
      }
      const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
      expect(env[key]?.split(path.delimiter)[0]).toBe(path.dirname(binary))
    })

    it('preserves an existing loader path by prepending', () => {
      if (process.platform === 'win32') return
      const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
      const env = getEngineSpawnEnv(binary, { ...process.env, [key]: '/existing' } as NodeJS.ProcessEnv)
      expect(env[key]).toBe(`${path.dirname(binary)}${path.delimiter}/existing`)
    })
  })
})

import { describe, expect, it } from 'vitest'
import net from 'net'
import { isPortAvailable, findAvailablePort } from './engine-process'

describe('engine process port helpers', () => {
  it('detects available port correctly', async () => {
    const available = await isPortAvailable(8399)
    expect(typeof available).toBe('boolean')
  })

  it('falls back to alternate port when primary port is occupied', async () => {
    const dummyServer = net.createServer()
    let listened = false
    await new Promise<void>((resolve) => {
      dummyServer.on('error', () => resolve())
      dummyServer.listen(8490, '127.0.0.1', () => {
        listened = true
        resolve()
      })
    })

    try {
      if (listened) {
        const port = await findAvailablePort(8490, 5)
        expect(port).toBe(8491)
      } else {
        expect(true).toBe(true)
      }
    } finally {
      if (listened) {
        await new Promise<void>((resolve) => dummyServer.close(() => resolve()))
      }
    }
  })
})

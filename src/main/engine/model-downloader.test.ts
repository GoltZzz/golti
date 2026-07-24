import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Stream that waits on `releaseFirst` before the first chunk, then
 * waits on `releaseRest` before subsequent chunks — so tests can
 * pause/cancel after partial progress.
 *
 * When `throwOnAbort` is false, abort never rejects `read()` — the
 * downloader must exit via its own paused/cancelled loop checks.
 */
function createTwoPhaseBody(
  chunks: Uint8Array[],
  signal?: AbortSignal | null,
  options?: { throwOnAbort?: boolean }
) {
  const throwOnAbort = options?.throwOnAbort !== false
  let index = 0
  let cancelled = false
  let releaseFirst!: () => void
  let releaseRest!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const restGate = new Promise<void>((resolve) => {
    releaseRest = resolve
  })

  const maybeAbort = () => {
    if (throwOnAbort && (signal?.aborted || cancelled)) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
  }

  return {
    releaseFirst: () => releaseFirst(),
    releaseRest: () => releaseRest(),
    body: {
      getReader() {
        return {
          async read() {
            maybeAbort()
            if (index === 0) await firstGate
            else if (index === 1) await restGate

            maybeAbort()
            if (index >= chunks.length) {
              return { done: true, value: undefined }
            }
            const value = chunks[index++]
            return { done: false, value }
          },
          async cancel() {
            cancelled = true
            releaseFirst()
            releaseRest()
          },
          releaseLock() {}
        }
      }
    }
  }
}

describe('model-downloader pause/resume/cancel', () => {
  let modelsDir: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    modelsDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-model-dl-'))
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('./model-downloader')
    mod._setModelDirForTests(modelsDir)
    mod._resetActiveDownloadsForTests()
  })

  afterEach(async () => {
    const mod = await import('./model-downloader')
    mod._setModelDirForTests(null)
    mod._resetActiveDownloadsForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    try {
      fs.rmSync(modelsDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('cancels an in-flight download and deletes the .tmp file', async () => {
    const { downloadModel, cancelModelDownload, getPartialDownloadBytes } =
      await import('./model-downloader')

    const chunk = new Uint8Array(1024).fill(1)
    let phase: ReturnType<typeof createTwoPhaseBody> | null = null
    let completed = 0

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      phase = createTwoPhaseBody([chunk, chunk, chunk], init?.signal)
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-length' ? '3072' : null)
        },
        body: phase.body
      })
    })

    const downloadPromise = downloadModel(
      'https://example.com/model.gguf',
      'test-model.gguf',
      (p) => {
        completed = p.completed
      }
    )

    await vi.waitFor(() => expect(phase).not.toBeNull())
    phase!.releaseFirst()

    await vi.waitFor(() => expect(completed).toBeGreaterThan(0))

    expect(cancelModelDownload('test-model.gguf')).toBe(true)
    phase!.releaseRest()

    const result = await downloadPromise
    expect(result.status).toBe('cancelled')
    expect(getPartialDownloadBytes('test-model.gguf')).toBe(0)
    expect(fs.existsSync(path.join(modelsDir, 'test-model.gguf.tmp'))).toBe(false)
  })

  it('pauses an in-flight download and keeps the .tmp file', async () => {
    const { downloadModel, pauseModelDownload, getPartialDownloadBytes } =
      await import('./model-downloader')

    const chunk = new Uint8Array(2048).fill(2)
    let phase: ReturnType<typeof createTwoPhaseBody> | null = null
    let completed = 0

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      phase = createTwoPhaseBody([chunk, chunk, chunk, chunk], init?.signal)
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-length' ? '8192' : null)
        },
        body: phase.body
      })
    })

    const downloadPromise = downloadModel(
      'https://example.com/model.gguf',
      'pause-model.gguf',
      (p) => {
        completed = p.completed
      }
    )

    await vi.waitFor(() => expect(phase).not.toBeNull())
    phase!.releaseFirst()

    await vi.waitFor(() => expect(completed).toBeGreaterThan(0))
    const beforePause = completed

    expect(pauseModelDownload('pause-model.gguf')).toBe(true)
    phase!.releaseRest()

    const result = await downloadPromise
    expect(result.status).toBe('paused')
    expect(getPartialDownloadBytes('pause-model.gguf')).toBeGreaterThanOrEqual(beforePause)
    expect(fs.existsSync(path.join(modelsDir, 'pause-model.gguf.tmp'))).toBe(true)
    expect(fs.existsSync(path.join(modelsDir, 'pause-model.gguf'))).toBe(false)
  })

  it('applies pending cancel when cancel runs before download registers', async () => {
    const { downloadModel, cancelModelDownload, getPartialDownloadBytes } =
      await import('./model-downloader')

    expect(cancelModelDownload('pending-model.gguf')).toBe(true)

    fetchMock.mockImplementation(() => {
      throw new Error('fetch should not be called after pending cancel')
    })

    const result = await downloadModel(
      'https://example.com/model.gguf',
      'pending-model.gguf'
    )
    expect(result.status).toBe('cancelled')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPartialDownloadBytes('pending-model.gguf')).toBe(0)
  })

  it('pauses via loop flag without relying on AbortError', async () => {
    const { downloadModel, pauseModelDownload, getPartialDownloadBytes } =
      await import('./model-downloader')

    const chunk = new Uint8Array(1024).fill(3)
    let phase: ReturnType<typeof createTwoPhaseBody> | null = null
    let completed = 0

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      // Reader never throws AbortError — downloader must break on active.paused
      phase = createTwoPhaseBody([chunk, chunk, chunk, chunk], init?.signal, {
        throwOnAbort: false
      })
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-length' ? '4096' : null)
        },
        body: phase.body
      })
    })

    const downloadPromise = downloadModel(
      'https://example.com/model.gguf',
      'flag-pause.gguf',
      (p) => {
        completed = p.completed
      }
    )

    await vi.waitFor(() => expect(phase).not.toBeNull())
    phase!.releaseFirst()
    await vi.waitFor(() => expect(completed).toBeGreaterThan(0))

    expect(pauseModelDownload('flag-pause.gguf')).toBe(true)
    phase!.releaseRest()

    const result = await downloadPromise
    expect(result.status).toBe('paused')
    expect(fs.existsSync(path.join(modelsDir, 'flag-pause.gguf.tmp'))).toBe(true)
    expect(getPartialDownloadBytes('flag-pause.gguf')).toBeGreaterThan(0)
  })

  it('resumes from .tmp using HTTP Range and appends bytes', async () => {
    const { downloadModel, getPartialDownloadBytes, deletePartialModel } =
      await import('./model-downloader')

    const tempPath = path.join(modelsDir, 'resume-model.gguf.tmp')
    fs.writeFileSync(tempPath, Buffer.alloc(100, 7))
    expect(getPartialDownloadBytes('resume-model.gguf')).toBe(100)

    const remaining = new Uint8Array(50).fill(9)
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const headers = (init?.headers || {}) as Record<string, string>
      expect(headers.Range || (headers as any).range).toBe('bytes=100-')

      return Promise.resolve({
        ok: true,
        status: 206,
        headers: {
          get: (name: string) => {
            const key = name.toLowerCase()
            if (key === 'content-length') return '50'
            if (key === 'content-range') return 'bytes 100-149/150'
            return null
          }
        },
        body: {
          getReader() {
            let done = false
            return {
              async read() {
                if (done) return { done: true, value: undefined }
                done = true
                return { done: false, value: remaining }
              },
              async cancel() {},
              releaseLock() {}
            }
          }
        }
      })
    })

    const result = await downloadModel('https://example.com/model.gguf', 'resume-model.gguf')
    expect(result.status).toBe('complete')
    if (result.status === 'complete') {
      expect(fs.existsSync(result.path)).toBe(true)
      expect(fs.statSync(result.path).size).toBe(150)
    }
    expect(fs.existsSync(tempPath)).toBe(false)
    expect(deletePartialModel('resume-model.gguf')).toBe(false)
  })

  it('deletePartialModel removes only the .tmp file', async () => {
    const { deletePartialModel, deleteLocalModel } = await import('./model-downloader')

    const gguf = path.join(modelsDir, 'keep-model.gguf')
    const tmp = path.join(modelsDir, 'keep-model.gguf.tmp')
    fs.writeFileSync(gguf, Buffer.alloc(10))
    fs.writeFileSync(tmp, Buffer.alloc(5))

    expect(deletePartialModel('keep-model.gguf')).toBe(true)
    expect(fs.existsSync(tmp)).toBe(false)
    expect(fs.existsSync(gguf)).toBe(true)

    expect(deleteLocalModel('keep-model.gguf')).toBe(true)
    expect(fs.existsSync(gguf)).toBe(false)
  })

  it('records pending pause/cancel when no active download exists', async () => {
    const { pauseModelDownload, cancelModelDownload, downloadModel } =
      await import('./model-downloader')

    expect(pauseModelDownload('soon.gguf')).toBe(true)

    fetchMock.mockImplementation(() => {
      throw new Error('fetch should not run after pending pause')
    })

    const paused = await downloadModel('https://example.com/model.gguf', 'soon.gguf')
    expect(paused.status).toBe('paused')

    expect(cancelModelDownload('soon2.gguf')).toBe(true)
    const cancelled = await downloadModel('https://example.com/model.gguf', 'soon2.gguf')
    expect(cancelled.status).toBe('cancelled')
  })
})

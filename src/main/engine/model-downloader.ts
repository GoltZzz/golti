import fs from 'fs'
import path from 'path'
import os from 'os'
import { EngineDownloadProgress, ModelDownloadResult } from '../../shared/types'

let modelDirOverride: string | null = null

/** Test-only: force model directory (avoids relying on os.homedir mocks). */
export function _setModelDirForTests(dir: string | null): void {
  modelDirOverride = dir
}

export function getModelDir(): string {
  if (modelDirOverride) {
    if (!fs.existsSync(modelDirOverride)) {
      fs.mkdirSync(modelDirOverride, { recursive: true })
    }
    return modelDirOverride
  }

  const homeDir = os.homedir()
  const modelDir = path.join(homeDir, 'Golti', 'models')
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true })
  }
  return modelDir
}

export interface LocalModelFile {
  filename: string
  filepath: string
  sizeBytes: number
  sizeGB: number
}

type ActiveDownload = {
  controller: AbortController
  paused: boolean
  cancelled: boolean
  lastProgress: EngineDownloadProgress | null
  reader: ReadableStreamDefaultReader<Uint8Array> | null
  fileStream: fs.WriteStream | null
}

type PendingAction = 'pause' | 'cancel'

const activeDownloads = new Map<string, ActiveDownload>()
const pendingEngineActions = new Map<string, PendingAction>()

function assertSafeGgufBasename(filename: string): string {
  const base = path.basename(filename)
  if (base !== filename || !base.toLowerCase().endsWith('.gguf') || base.includes('..')) {
    throw new Error('Invalid model filename')
  }
  return base
}

function resolveModelPath(filename: string): { dir: string; filepath: string; tempPath: string } {
  const base = assertSafeGgufBasename(filename)
  const dir = getModelDir()
  const filepath = path.join(dir, base)
  const resolved = path.resolve(filepath)
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error('Invalid model path')
  }
  return { dir, filepath, tempPath: path.join(dir, `${base}.tmp`) }
}

function unlinkQuiet(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

function endStream(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (stream.closed || stream.destroyed) {
      resolve()
      return
    }
    stream.end(() => resolve())
  })
}

function stopActiveTransfer(active: ActiveDownload, reason: 'user-pause' | 'user-cancel'): void {
  active.controller.abort()
  try {
    void active.reader?.cancel(reason)
  } catch {
    // ignore
  }
  if (reason === 'user-cancel' && active.fileStream && !active.fileStream.destroyed) {
    try {
      active.fileStream.destroy()
    } catch {
      // ignore
    }
  }
}

function applyPendingAction(base: string, active: ActiveDownload): void {
  const pending = pendingEngineActions.get(base)
  if (!pending) return
  pendingEngineActions.delete(base)

  if (pending === 'cancel') {
    active.cancelled = true
    active.paused = false
    stopActiveTransfer(active, 'user-cancel')
  } else if (pending === 'pause') {
    active.paused = true
    active.cancelled = false
    stopActiveTransfer(active, 'user-pause')
  }
}

export function listLocalModels(): LocalModelFile[] {
  const dir = getModelDir()
  if (!fs.existsSync(dir)) return []

  try {
    const files = fs.readdirSync(dir)
    return files
      .filter((f) => f.endsWith('.gguf'))
      .map((f) => {
        const filepath = path.join(dir, f)
        const stats = fs.statSync(filepath)
        return {
          filename: f,
          filepath,
          sizeBytes: stats.size,
          sizeGB: Number((stats.size / (1024 * 1024 * 1024)).toFixed(2))
        }
      })
  } catch {
    return []
  }
}

export function deleteLocalModel(filename: string): boolean {
  const { filepath, tempPath } = resolveModelPath(filename)
  let deleted = false

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath)
    deleted = true
  }
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath)
    deleted = true
  }
  return deleted
}

/** Remove only the in-progress `.tmp` file (keeps a completed `.gguf` if present). */
export function deletePartialModel(filename: string): boolean {
  const { tempPath } = resolveModelPath(filename)
  if (!fs.existsSync(tempPath)) return false
  fs.unlinkSync(tempPath)
  return true
}

export function getPartialDownloadBytes(filename: string): number {
  const { tempPath } = resolveModelPath(filename)
  if (!fs.existsSync(tempPath)) return 0
  try {
    return fs.statSync(tempPath).size
  } catch {
    return 0
  }
}

export function pauseModelDownload(filename: string): boolean {
  const base = assertSafeGgufBasename(filename)
  const active = activeDownloads.get(base)
  if (active) {
    if (active.paused || active.cancelled) return false
    active.paused = true
    stopActiveTransfer(active, 'user-pause')
    return true
  }

  // Race: UI shows downloading before main registers the transfer
  pendingEngineActions.set(base, 'pause')
  return true
}

export function cancelModelDownload(filename: string): boolean {
  const base = assertSafeGgufBasename(filename)
  const { tempPath } = resolveModelPath(base)
  const active = activeDownloads.get(base)

  if (active) {
    active.cancelled = true
    active.paused = false
    stopActiveTransfer(active, 'user-cancel')
    return true
  }

  // Pending intent if download hasn't started yet
  pendingEngineActions.set(base, 'cancel')

  // Also clear any leftover partial
  if (fs.existsSync(tempPath)) {
    unlinkQuiet(tempPath)
  }
  return true
}

export async function downloadModel(
  url: string,
  filename: string,
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<ModelDownloadResult> {
  const base = assertSafeGgufBasename(filename)
  const { filepath: targetPath, tempPath } = resolveModelPath(base)

  if (fs.existsSync(targetPath)) {
    pendingEngineActions.delete(base)
    return { status: 'complete', path: targetPath }
  }

  if (activeDownloads.has(base)) {
    throw new Error(`Download already in progress for ${base}`)
  }

  const controller = new AbortController()
  const active: ActiveDownload = {
    controller,
    paused: false,
    cancelled: false,
    lastProgress: null,
    reader: null,
    fileStream: null
  }
  activeDownloads.set(base, active)
  applyPendingAction(base, active)

  const emit = (progress: EngineDownloadProgress) => {
    active.lastProgress = progress
    onProgress?.(progress)
  }

  let existingBytes = getPartialDownloadBytes(base)

  // Immediate cancel from pending intent before any network work
  if (active.cancelled) {
    unlinkQuiet(tempPath)
    emit({
      type: 'model',
      name: base,
      completed: 0,
      total: 0,
      percent: 0,
      speed: 'Cancelled',
      status: 'cancelled'
    })
    activeDownloads.delete(base)
    return { status: 'cancelled' }
  }

  if (active.paused) {
    const completed = existingBytes
    emit({
      type: 'model',
      name: base,
      completed,
      total: Math.max(completed, 1),
      percent: 0,
      speed: 'Paused',
      status: 'paused'
    })
    activeDownloads.delete(base)
    return { status: 'paused' }
  }

  emit({
    type: 'model',
    name: base,
    completed: existingBytes,
    total: existingBytes > 0 ? Math.max(existingBytes, 1) : 100,
    percent: 0,
    speed: existingBytes > 0 ? 'Resuming...' : 'Connecting...',
    status: 'downloading'
  })

  try {
    const headers: Record<string, string> = {}
    if (existingBytes > 0) {
      headers.Range = `bytes=${existingBytes}-`
    }

    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers
    })

    // Re-check after await (pause/cancel during connect)
    if (active.cancelled) {
      unlinkQuiet(tempPath)
      emit({
        type: 'model',
        name: base,
        completed: 0,
        total: 0,
        percent: 0,
        speed: 'Cancelled',
        status: 'cancelled'
      })
      return { status: 'cancelled' }
    }
    if (active.paused) {
      const completed = getPartialDownloadBytes(base)
      const total = active.lastProgress?.total || completed
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0
      emit({
        type: 'model',
        name: base,
        completed,
        total,
        percent,
        speed: 'Paused',
        status: 'paused'
      })
      return { status: 'paused' }
    }

    // Server ignored Range - restart from scratch
    if (existingBytes > 0 && res.status === 200) {
      unlinkQuiet(tempPath)
      existingBytes = 0
    }

    const isPartial = res.status === 206
    if (!res.ok && res.status !== 206) {
      throw new Error(`Failed to download model ${base}: HTTP ${res.status} ${res.statusText}`)
    }
    if (!res.body) {
      throw new Error(`Failed to download model ${base}: empty response body`)
    }

    const contentLength = Number(res.headers.get('content-length') || 0)
    const contentRange = res.headers.get('content-range')
    let totalBytes = 0
    if (contentRange) {
      const match = /\/(\d+)$/.exec(contentRange)
      if (match) totalBytes = Number(match[1])
    }
    if (!totalBytes) {
      totalBytes = isPartial ? existingBytes + contentLength : contentLength
    }

    let downloadedBytes = existingBytes
    let lastTime = Date.now()
    let lastBytes = existingBytes

    const fileStream = fs.createWriteStream(tempPath, {
      flags: existingBytes > 0 ? 'a' : 'w'
    })
    const reader = res.body.getReader()
    active.fileStream = fileStream
    active.reader = reader

    try {
      while (true) {
        if (active.cancelled || active.paused) break

        const { done, value } = await reader.read()
        if (done) break
        if (active.cancelled || active.paused) break

        const canContinue = fileStream.write(value)
        downloadedBytes += value.length

        if (!canContinue) {
          await new Promise<void>((resolve) => fileStream.once('drain', resolve))
        }

        const now = Date.now()
        const isFirstChunk = lastBytes === existingBytes && downloadedBytes > existingBytes
        if (
          isFirstChunk ||
          now - lastTime > 400 ||
          (totalBytes > 0 && downloadedBytes === totalBytes)
        ) {
          const timeDiff = (now - lastTime) / 1000
          const bytesDiff = downloadedBytes - lastBytes
          const bytesPerSec = timeDiff > 0 ? bytesDiff / timeDiff : 0
          const speedMBs = (bytesPerSec / (1024 * 1024)).toFixed(1)
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 50

          emit({
            type: 'model',
            name: base,
            completed: downloadedBytes,
            total: totalBytes,
            percent,
            speed: `${speedMBs} MB/s`,
            status: 'downloading'
          })

          lastTime = now
          lastBytes = downloadedBytes
        }
      }
    } finally {
      active.reader = null
      active.fileStream = null
      if (!fileStream.destroyed) {
        await endStream(fileStream)
      }
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }

    if (active.cancelled) {
      unlinkQuiet(tempPath)
      emit({
        type: 'model',
        name: base,
        completed: 0,
        total: totalBytes || 0,
        percent: 0,
        speed: 'Cancelled',
        status: 'cancelled'
      })
      return { status: 'cancelled' }
    }

    if (active.paused) {
      const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
      emit({
        type: 'model',
        name: base,
        completed: downloadedBytes,
        total: totalBytes || downloadedBytes,
        percent,
        speed: 'Paused',
        status: 'paused'
      })
      return { status: 'paused' }
    }

    fs.renameSync(tempPath, targetPath)

    emit({
      type: 'model',
      name: base,
      completed: downloadedBytes,
      total: downloadedBytes,
      percent: 100,
      speed: 'Complete',
      status: 'complete'
    })

    return { status: 'complete', path: targetPath }
  } catch (err: any) {
    if (active.cancelled) {
      unlinkQuiet(tempPath)
      emit({
        type: 'model',
        name: base,
        completed: 0,
        total: active.lastProgress?.total || 0,
        percent: 0,
        speed: 'Cancelled',
        status: 'cancelled'
      })
      return { status: 'cancelled' }
    }

    if (active.paused || err?.name === 'AbortError') {
      const completed = getPartialDownloadBytes(base)
      const total = active.lastProgress?.total || completed
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0
      emit({
        type: 'model',
        name: base,
        completed,
        total,
        percent,
        speed: 'Paused',
        status: 'paused'
      })
      return { status: 'paused' }
    }

    const message = err?.message || String(err)
    const completed = getPartialDownloadBytes(base)
    const total = active.lastProgress?.total || completed
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    emit({
      type: 'model',
      name: base,
      completed,
      total,
      percent,
      speed: 'Error',
      status: 'error',
      error: message
    })
    // Keep .tmp so the user can Resume
    throw err
  } finally {
    activeDownloads.delete(base)
  }
}

/** Test helpers */
export function _resetActiveDownloadsForTests(): void {
  activeDownloads.clear()
  pendingEngineActions.clear()
}

import fs from 'fs'
import path from 'path'
import os from 'os'
import { EngineDownloadProgress } from '../../shared/types'

export function getModelDir(): string {
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
  // Only allow simple basenames ending in .gguf (no path traversal)
  const base = path.basename(filename)
  if (base !== filename || !base.toLowerCase().endsWith('.gguf') || base.includes('..')) {
    throw new Error('Invalid model filename')
  }

  const dir = getModelDir()
  const filepath = path.join(dir, base)
  const resolved = path.resolve(filepath)
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error('Invalid model path')
  }

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath)
    return true
  }
  return false
}

export async function downloadModel(
  url: string,
  filename: string,
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<string> {
  const dir = getModelDir()
  const targetPath = path.join(dir, filename)
  const tempPath = path.join(dir, `${filename}.tmp`)

  if (fs.existsSync(targetPath)) {
    return targetPath
  }

  onProgress?.({
    type: 'model',
    name: filename,
    completed: 0,
    total: 100,
    percent: 0,
    speed: 'Connecting...'
  })

  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download model ${filename}: HTTP ${res.status} ${res.statusText}`)
    }

    const totalBytes = Number(res.headers.get('content-length') || 0)
    let downloadedBytes = 0
    let lastTime = Date.now()
    let lastBytes = 0

    const fileStream = fs.createWriteStream(tempPath)
    const reader = res.body.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      fileStream.write(value)
      downloadedBytes += value.length

      const now = Date.now()
      if (now - lastTime > 400 || downloadedBytes === totalBytes) {
        const timeDiff = (now - lastTime) / 1000
        const bytesDiff = downloadedBytes - lastBytes
        const bytesPerSec = timeDiff > 0 ? bytesDiff / timeDiff : 0
        const speedMBs = (bytesPerSec / (1024 * 1024)).toFixed(1)
        const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 50

        onProgress?.({
          type: 'model',
          name: filename,
          completed: downloadedBytes,
          total: totalBytes,
          percent,
          speed: `${speedMBs} MB/s`
        })

        lastTime = now
        lastBytes = downloadedBytes
      }
    }

    fileStream.end()
    await new Promise<void>((resolve) => fileStream.on('finish', () => resolve()))

    fs.renameSync(tempPath, targetPath)

    onProgress?.({
      type: 'model',
      name: filename,
      completed: downloadedBytes,
      total: downloadedBytes,
      percent: 100,
      speed: 'Complete'
    })

    return targetPath
  } catch (err: any) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch {}
    }
    throw err
  }
}

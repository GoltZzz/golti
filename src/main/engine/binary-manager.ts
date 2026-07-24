import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { EngineDownloadProgress } from '../../shared/types'

const GITHUB_RELEASE_BASE = 'https://github.com/ggerganov/llama.cpp/releases/download'
const LLAMA_VERSION = 'b4567'

export function getPlatformBinaryKey(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  } else if (platform === 'win32') {
    return 'win32-x64'
  } else if (platform === 'linux') {
    return 'linux-x64'
  }
  return 'unknown'
}

export function getBinaryFilename(): string {
  return process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
}

/**
 * Environment for spawning llama-server.
 *
 * The upstream Linux release binaries carry a RUNPATH baked from the machine that
 * built them (`/home/runner/work/llama.cpp/...`), so the .so files sitting right
 * next to the executable are never found. Point the loader at the binary's own
 * directory. macOS builds resolve via @loader_path and Windows searches the exe
 * directory automatically, so neither strictly needs this.
 */
export function getEngineSpawnEnv(
  binaryPath: string,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env = { ...baseEnv }
  if (process.platform === 'win32') return env

  const libDir = path.dirname(binaryPath)
  const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
  env[key] = env[key] ? `${libDir}${path.delimiter}${env[key]}` : libDir
  return env
}

export function getEngineDir(): string {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'golti-engine')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getVersionDir(): string {
  return path.join(getEngineDir(), LLAMA_VERSION)
}

function findExecutable(dir: string): string | null {
  if (!fs.existsSync(dir)) return null
  const filename = getBinaryFilename()
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = findExecutable(fullPath)
        if (found) return found
      } else if (entry.isFile() && entry.name === filename) {
        return fullPath
      }
    }
  } catch {}
  return null
}

export function getBinaryPath(): string {
  const versionDir = getVersionDir()
  const foundPath = findExecutable(versionDir)
  if (foundPath) return foundPath
  return path.join(versionDir, 'build', 'bin', getBinaryFilename())
}

export function isBinaryInstalled(): boolean {
  const binaryPath = getBinaryPath()
  if (!fs.existsSync(binaryPath)) return false
  try {
    const stats = fs.statSync(binaryPath)
    return stats.size > 100000
  } catch {
    return false
  }
}

export function getBinaryDownloadUrl(): string {
  const key = getPlatformBinaryKey()
  switch (key) {
    case 'darwin-arm64':
      return `${GITHUB_RELEASE_BASE}/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-macos-arm64.zip`
    case 'darwin-x64':
      return `${GITHUB_RELEASE_BASE}/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-macos-x64.zip`
    case 'win32-x64':
      return `${GITHUB_RELEASE_BASE}/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-win-cuda-cu12.4-x64.zip`
    case 'linux-x64':
      return `${GITHUB_RELEASE_BASE}/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-ubuntu-x64.zip`
    default:
      throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
  }
}

export async function downloadEngineBinary(
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<string> {
  const engineDir = getEngineDir()
  const downloadUrl = getBinaryDownloadUrl()
  const tempFile = path.join(engineDir, 'binary_download.tmp')

  onProgress?.({
    type: 'binary',
    name: 'Golti Engine (llama-server)',
    completed: 0,
    total: 100,
    percent: 0,
    speed: 'Starting...'
  })

  try {
    const res = await fetch(downloadUrl)
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download engine binary: HTTP ${res.status} ${res.statusText}`)
    }

    const totalBytes = Number(res.headers.get('content-length') || 0)
    let downloadedBytes = 0
    let lastTime = Date.now()
    let lastBytes = 0

    const fileStream = fs.createWriteStream(tempFile)
    const reader = res.body.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      fileStream.write(value)
      downloadedBytes += value.length

      const now = Date.now()
      if (now - lastTime > 300 || downloadedBytes === totalBytes) {
        const timeDiff = (now - lastTime) / 1000
        const bytesDiff = downloadedBytes - lastBytes
        const bytesPerSec = timeDiff > 0 ? bytesDiff / timeDiff : 0
        const speedMBs = (bytesPerSec / (1024 * 1024)).toFixed(1)
        const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 90) : 45

        onProgress?.({
          type: 'binary',
          name: 'Golti Engine (llama-server)',
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

    onProgress?.({
      type: 'binary',
      name: 'Golti Engine (llama-server)',
      completed: downloadedBytes,
      total: downloadedBytes,
      percent: 95,
      speed: 'Extracting...'
    })

    const versionDir = getVersionDir()
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true })
    }
    fs.mkdirSync(versionDir, { recursive: true })

    const zip = new AdmZip(tempFile)
    zip.extractAllTo(versionDir, true)

    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile)
    }

    const targetPath = getBinaryPath()
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Executable ${getBinaryFilename()} not found in extracted archive`)
    }

    if (process.platform !== 'win32') {
      const makeExecutable = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            makeExecutable(fullPath)
          } else if (entry.isFile()) {
            fs.chmodSync(fullPath, 0o755)
          }
        }
      }
      makeExecutable(versionDir)
    }

    onProgress?.({
      type: 'binary',
      name: 'Golti Engine (llama-server)',
      completed: downloadedBytes,
      total: downloadedBytes,
      percent: 100,
      speed: 'Done'
    })

    return targetPath
  } catch (err: any) {
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile) } catch {}
    }
    throw err
  }
}

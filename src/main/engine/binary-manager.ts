import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { EngineDownloadProgress } from '../../shared/types'
import { detectGpu } from './gpu-detect'

const execAsync = promisify(exec)

const GITHUB_RELEASE_BASE = 'https://github.com/ggml-org/llama.cpp/releases/download'
export const LLAMA_VERSION = 'b10099'

/**
 * Compute backend for the engine. `metal` is macOS's built-in GPU backend
 * (shipped in the standard build); `vulkan` is the cross-vendor GPU backend we
 * use for NVIDIA/AMD/Intel on Windows and Linux; `cpu` is the portable
 * fallback. CUDA is intentionally not a Phase-1 default - Vulkan covers every
 * vendor in a single self-contained binary.
 */
export type EngineBackend = 'metal' | 'vulkan' | 'cpu'

export type ArchiveFormat = 'zip' | 'tar.gz'

/** Resolves the backend to download for the current machine's GPU. */
export async function resolveBackend(): Promise<EngineBackend> {
  if (process.platform === 'darwin') return 'metal'
  const gpu = await detectGpu()
  // Any discrete/integrated GPU → Vulkan. Falls back to CPU when none is found.
  return gpu.vendor === 'none' ? 'cpu' : 'vulkan'
}

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

  const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
  const suffix = process.platform === 'darwin' ? '.dylib' : '.so'

  // The binary's own directory first (matches most layouts), then any other
  // directory under the version dir that holds shared libraries - the Vulkan
  // build ships its backend .so files in a sibling `lib/` in some releases.
  const dirs = new Set<string>([path.dirname(binaryPath)])
  try {
    const versionDir = getVersionDir()
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile() && entry.name.includes(suffix)) dirs.add(dir)
      }
    }
    if (fs.existsSync(versionDir)) walk(versionDir)
  } catch {}

  const libPath = Array.from(dirs).join(path.delimiter)
  env[key] = env[key] ? `${libPath}${path.delimiter}${env[key]}` : libPath
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

function getBackendMarkerPath(): string {
  return path.join(getVersionDir(), 'backend.txt')
}

/** Backend of the currently installed engine binary, or null when unknown. */
export function getInstalledBackend(): EngineBackend | null {
  try {
    const value = fs.readFileSync(getBackendMarkerPath(), 'utf8').trim()
    if (value === 'metal' || value === 'vulkan' || value === 'cpu') return value
  } catch {}
  return null
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
    // Guard against a truncated/partial download. Note the threshold is small:
    // modern llama.cpp ships `llama-server` as a thin (~18 KB) launcher that
    // links the heavy code from `libllama-server-impl.so`, so the old ">100 KB"
    // check wrongly reported these installs as missing.
    const stats = fs.statSync(binaryPath)
    return stats.size > 4096
  } catch {
    return false
  }
}

export interface BinaryAsset {
  url: string
  format: ArchiveFormat
}

/**
 * Maps (platform, arch, backend) to the matching llama.cpp release asset.
 *
 * Asset naming and archive format vary by platform in current releases:
 * macOS and Linux ship `.tar.gz`, Windows ships `.zip`.
 */
export function getBinaryAsset(backend: EngineBackend): BinaryAsset {
  const base = `${GITHUB_RELEASE_BASE}/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin`
  const key = getPlatformBinaryKey()

  switch (key) {
    case 'darwin-arm64':
      return { url: `${base}-macos-arm64.tar.gz`, format: 'tar.gz' }
    case 'darwin-x64':
      return { url: `${base}-macos-x64.tar.gz`, format: 'tar.gz' }
    case 'win32-x64':
      return backend === 'vulkan'
        ? { url: `${base}-win-vulkan-x64.zip`, format: 'zip' }
        : { url: `${base}-win-cpu-x64.zip`, format: 'zip' }
    case 'linux-x64':
      return backend === 'vulkan'
        ? { url: `${base}-ubuntu-vulkan-x64.tar.gz`, format: 'tar.gz' }
        : { url: `${base}-ubuntu-x64.tar.gz`, format: 'tar.gz' }
    default:
      throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
  }
}

async function extractArchive(archivePath: string, destDir: string, format: ArchiveFormat): Promise<void> {
  if (format === 'zip') {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(destDir, true)
    return
  }
  // tar.gz - rely on the system `tar`, present on macOS and Linux. It preserves
  // the executable bit and symlinks that llama.cpp's shared libraries use.
  await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`)
}

export async function downloadEngineBinary(
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<string> {
  const engineDir = getEngineDir()
  const backend = await resolveBackend()
  const asset = getBinaryAsset(backend)
  const downloadUrl = asset.url
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

    await extractArchive(tempFile, versionDir, asset.format)

    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile)
    }

    const targetPath = getBinaryPath()
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Executable ${getBinaryFilename()} not found in extracted archive`)
    }

    // Record which backend this install is, so the engine can report it and size
    // GPU offload without re-probing the hardware on every start.
    try {
      fs.writeFileSync(getBackendMarkerPath(), backend, 'utf8')
    } catch {}

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

export function deleteEngineBinary(): boolean {
  try {
    const versionDir = getVersionDir()
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true })
    }
    const engineDir = getEngineDir()
    const tempFile = path.join(engineDir, 'binary_download.tmp')
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile)
    }
    return true
  } catch (err) {
    console.error('[GoltiEngine] Failed to delete engine binary:', err)
    return false
  }
}


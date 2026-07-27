import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import zlib from 'zlib'
import { pipeline } from 'stream/promises'
import { EngineDownloadProgress } from '../../shared/types'
import { detectGpu } from '../engine/gpu-detect'

import { execSync } from 'child_process'

const GITHUB_RELEASE_BASE = 'https://github.com/ollama/ollama/releases/download'
const DEFAULT_OLLAMA_VERSION = 'v0.32.4'

/**
 * Upstream switched the Linux tarballs from gzip to zstd in v0.14.0, so the
 * asset extension depends on which release we end up pulling.
 */
const ZSTD_ASSETS_SINCE = [0, 14, 0] as const

function parseVersion(version: string): [number, number, number] {
  const m = version.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return [0, 0, 0]
  return [+m[1], +m[2], +m[3]]
}

export function usesZstdAssets(version: string): boolean {
  const [major, minor, patch] = parseVersion(version)
  const [zMajor, zMinor, zPatch] = ZSTD_ASSETS_SINCE
  if (major !== zMajor) return major > zMajor
  if (minor !== zMinor) return minor > zMinor
  return patch >= zPatch
}

export async function fetchLatestOllamaTag(): Promise<string> {
  try {
    const res = await fetch('https://api.github.com/repos/ollama/ollama/releases/latest', {
      headers: { 'User-Agent': 'Golti-App' }
    })
    if (res.ok) {
      const data = (await res.json()) as { tag_name?: string }
      if (data.tag_name) {
        return data.tag_name
      }
    }
  } catch (err) {
    console.warn('Failed to fetch latest Ollama tag from GitHub, using default:', err)
  }
  return DEFAULT_OLLAMA_VERSION
}

export function getPlatformBinaryKey(): string {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin') return 'darwin'
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : 'windows-amd64'
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-amd64'
  return 'unknown'
}

export function getBinaryFilename(): string {
  return process.platform === 'win32' ? 'ollama.exe' : 'ollama'
}

/** Mirrors Electron's own userData resolution, for the rare call before `app` is ready. */
function fallbackUserDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) return '.'
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'golti')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'golti')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'golti')
}

export function getOllamaDir(): string {
  const userData = app?.getPath ? app.getPath('userData') : fallbackUserDataDir()
  const dir = path.join(userData, 'ollama-bin')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getVersionDir(version: string = DEFAULT_OLLAMA_VERSION): string {
  return path.join(getOllamaDir(), version)
}

function findExecutable(dir: string): string | null {
  if (!fs.existsSync(dir)) return null
  const targetName = getBinaryFilename().toLowerCase()
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (process.platform === 'darwin' && entry.name.endsWith('.app')) {
          const resPath = path.join(fullPath, 'Contents', 'Resources', getBinaryFilename())
          if (fs.existsSync(resPath)) {
            return resPath
          }
        }
        const found = findExecutable(fullPath)
        if (found) return found
      } else if (entry.isFile() && entry.name.toLowerCase() === targetName) {
        if (process.platform === 'darwin' && fullPath.includes('.app/Contents/MacOS/')) {
          continue
        }
        return fullPath
      }
    }
  } catch {}
  return null
}

export function getSystemBinaryPath(): string | null {
  const targetName = getBinaryFilename()
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  const commonPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    path.join(process.env.HOME || '', '.ollama', 'bin')
  ]

  if (process.platform === 'darwin') {
    const macAppPaths = [
      '/Applications/Ollama.app/Contents/Resources/ollama',
      '/Applications/Ollama.app/Contents/MacOS/Ollama',
      path.join(process.env.HOME || '', 'Applications', 'Ollama.app', 'Contents', 'Resources', 'ollama'),
      path.join(process.env.HOME || '', 'Applications', 'Ollama.app', 'Contents', 'MacOS', 'Ollama')
    ]
    for (const macPath of macAppPaths) {
      try {
        if (fs.existsSync(macPath) && fs.statSync(macPath).isFile()) {
          return macPath
        }
      } catch {}
    }
  }

  const allDirs = Array.from(new Set([...pathDirs, ...commonPaths]))
  for (const dir of allDirs) {
    if (!dir) continue
    const fullPath = path.join(dir, targetName)
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath
      }
    } catch {}
  }
  return null
}

export interface RunningOllamaInfo {
  pid?: number
  binaryPath?: string
  /** systemd unit owning the process, when it is managed as a Linux service. */
  serviceUnit?: string
  /** True when the unit lives in the system scope, so stopping it needs privileges. */
  needsPrivilegedStop?: boolean
}

const SYSTEMD_UNIT_CANDIDATES = ['ollama.service', 'ollama-user.service']

function run(command: string): string {
  return execSync(command, {
    encoding: 'utf8',
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
}

/**
 * Resolve the executable behind a PID.
 *
 * On Linux `ps -o comm=` only yields a bare process name, so /proc is the only way
 * to get a real path — but the readlink needs ptrace access, which we lack for a
 * daemon running under its own service user. macOS `ps -o comm=` does return a
 * full path, so it stays the fallback.
 */
function resolveBinaryPathFromPid(pid: number): string | undefined {
  if (process.platform === 'linux') {
    try {
      const exe = fs.readlinkSync(`/proc/${pid}/exe`)
      if (exe && fs.existsSync(exe)) return exe
    } catch {}
  }
  try {
    const comm = run(`ps -p ${pid} -o comm=`)
    if (comm.includes(path.sep) && fs.existsSync(comm)) return comm
  } catch {}
  return undefined
}

/**
 * Ask systemd directly. This is the only detection path that works when Ollama was
 * installed as a service: the listening socket belongs to another user, so `lsof`
 * and `ss` report nothing back to us.
 */
function findSystemdOllama(): RunningOllamaInfo | null {
  if (process.platform !== 'linux') return null

  for (const scope of ['--system', '--user'] as const) {
    for (const unit of SYSTEMD_UNIT_CANDIDATES) {
      try {
        const output = run(`systemctl ${scope} show -p MainPID -p ExecStart -p ActiveState ${unit}`)
        const read = (key: string) =>
          output.split('\n').find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1) ?? ''

        if (read('ActiveState') !== 'active') continue
        const pid = parseInt(read('MainPID'), 10)
        if (!Number.isFinite(pid) || pid <= 0) continue

        // ExecStart looks like: { path=/usr/local/bin/ollama ; argv[]=... ; ... }
        const execPath = read('ExecStart').match(/path=([^;]+)/)?.[1]?.trim()
        const binaryPath =
          execPath && fs.existsSync(execPath) ? execPath : resolveBinaryPathFromPid(pid)

        return { pid, binaryPath, serviceUnit: unit, needsPrivilegedStop: scope === '--system' }
      } catch {}
    }
  }
  return null
}

export function findRunningOllamaProcessInfo(port: number = 11434): RunningOllamaInfo {
  const fromSystemd = findSystemdOllama()
  if (fromSystemd) return fromSystemd

  try {
    if (process.platform === 'win32') {
      const output = run(`netstat -ano | findstr :${port}`)
      const match = output.split('\n').find(line => line.includes('LISTENING'))
      if (match) {
        const parts = match.trim().split(/\s+/)
        const pid = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(pid)) {
          return { pid }
        }
      }
    } else {
      const output = run(`lsof -i :${port} -sTCP:LISTEN -Fp`)
      const match = output.split('\n').find(line => line.startsWith('p'))
      if (match) {
        const pid = parseInt(match.substring(1), 10)
        if (!isNaN(pid)) {
          return { pid, binaryPath: resolveBinaryPathFromPid(pid) }
        }
      }
    }
  } catch {}
  return {}
}

/**
 * Stop a systemd-managed Ollama. System-scope units need root, which we will not
 * escalate to on the user's behalf — the caller surfaces the manual command instead.
 */
export function stopSystemdOllama(
  info: Pick<RunningOllamaInfo, 'serviceUnit' | 'needsPrivilegedStop'>
): { ok: boolean; message: string } {
  if (!info.serviceUnit) return { ok: false, message: 'Not a systemd-managed process' }

  if (info.needsPrivilegedStop) {
    return {
      ok: false,
      message: `Ollama runs as the system service ${info.serviceUnit}. Stop it with: sudo systemctl stop ${info.serviceUnit}`
    }
  }

  try {
    run(`systemctl --user stop ${info.serviceUnit}`)
    return { ok: true, message: `Stopped ${info.serviceUnit}` }
  } catch (err: any) {
    return { ok: false, message: `Failed to stop ${info.serviceUnit}: ${err?.message || 'unknown error'}` }
  }
}

export function getBinaryPath(): string {
  const baseDir = getOllamaDir()
  if (fs.existsSync(baseDir)) {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findExecutable(path.join(baseDir, entry.name))
        if (found) return found
      }
    }
  }

  const systemBinary = getSystemBinaryPath()
  if (systemBinary) return systemBinary

  return path.join(getVersionDir(), getBinaryFilename())
}

export function isBinaryInstalled(): boolean {
  const binaryPath = getBinaryPath()
  if (!fs.existsSync(binaryPath)) return false
  try {
    const stats = fs.statSync(binaryPath)
    return stats.size > 100
  } catch {
    return false
  }
}

/**
 * Which archive to fetch. `base` carries the executable (and, on the platforms
 * that have them, the bundled CUDA runtime libraries). `rocm` is an *overlay*:
 * it ships only the AMD runtime and has to be extracted on top of `base`,
 * exactly like upstream's install.sh does.
 */
export type OllamaAssetVariant = 'base' | 'rocm'

/** Platforms for which upstream publishes a separate ROCm overlay archive. */
export function supportsRocmVariant(key: string = getPlatformBinaryKey()): boolean {
  return key === 'linux-amd64' || key === 'windows-amd64'
}

export function getBinaryDownloadUrl(
  version: string = DEFAULT_OLLAMA_VERSION,
  variant: OllamaAssetVariant = 'base'
): string {
  const key = getPlatformBinaryKey()
  const suffix = variant === 'rocm' ? '-rocm' : ''

  if (variant === 'rocm' && !supportsRocmVariant(key)) {
    throw new Error(`No ROCm build of Ollama is published for ${key}`)
  }

  // Linux tarballs only; the Windows/macOS assets stayed .zip throughout.
  const tarExt = usesZstdAssets(version) ? 'tar.zst' : 'tgz'

  switch (key) {
    case 'darwin':
      return `${GITHUB_RELEASE_BASE}/${version}/Ollama-darwin.zip`
    case 'windows-amd64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-windows-amd64${suffix}.zip`
    case 'windows-arm64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-windows-arm64.zip`
    case 'linux-amd64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-linux-amd64${suffix}.${tarExt}`
    case 'linux-arm64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-linux-arm64.${tarExt}`
    default:
      throw new Error(`Unsupported platform/architecture: ${process.platform} ${process.arch}`)
  }
}

let currentAbortController: AbortController | null = null

export function cancelOllamaDownload(): boolean {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
    return true
  }
  return false
}

/**
 * Picks the release to install: the newest tag when it actually has assets for
 * this platform, otherwise the version we ship against. Probing with HEAD keeps
 * us from streaming a whole archive only to discover upstream renamed it.
 */
async function resolveDownloadVersion(signal: AbortSignal): Promise<string> {
  const latest = await fetchLatestOllamaTag()
  if (latest === DEFAULT_OLLAMA_VERSION) return latest

  try {
    const res = await fetch(getBinaryDownloadUrl(latest), { method: 'HEAD', signal })
    if (res.ok) return latest
    console.warn(
      `Ollama release ${latest} has no asset for this platform (HTTP ${res.status}), falling back to ${DEFAULT_OLLAMA_VERSION}`
    )
  } catch (err) {
    if (signal.aborted) throw err
    console.warn(`Could not probe Ollama release ${latest}, falling back to ${DEFAULT_OLLAMA_VERSION}:`, err)
  }
  return DEFAULT_OLLAMA_VERSION
}

/** Streams `url` to `tempFile`, reporting progress into the [from, to] percent slice. */
async function downloadArchive(
  url: string,
  tempFile: string,
  label: string,
  slice: { from: number; to: number },
  signal: AbortSignal,
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<{ ok: boolean; status: number; bytes: number }> {
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) {
    return { ok: false, status: res.status, bytes: 0 }
  }

  const totalBytes = Number(res.headers.get('content-length') || 0)
  let downloadedBytes = 0
  let lastTime = Date.now()
  let lastBytes = 0

  const fileStream = fs.createWriteStream(tempFile)
  const reader = res.body.getReader()

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error('Download cancelled by user')
      }
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
        const fraction = totalBytes > 0 ? downloadedBytes / totalBytes : 0.5
        const percent = Math.round(slice.from + fraction * (slice.to - slice.from))

        onProgress?.({
          type: 'binary',
          name: label,
          completed: downloadedBytes,
          total: totalBytes,
          percent,
          speed: `${speedMBs} MB/s`
        })

        lastTime = now
        lastBytes = downloadedBytes
      }
    }
  } finally {
    fileStream.end()
  }

  await new Promise<void>((resolve) => fileStream.on('finish', () => resolve()))
  return { ok: true, status: res.status, bytes: downloadedBytes }
}

/** Decompresses a .tar.zst into a sibling .tar, preferring Node's built-in zstd. */
async function decompressZstd(archive: string): Promise<string> {
  const tarFile = archive.replace(/\.zst$/, '')
  const createZstdDecompress = (zlib as any).createZstdDecompress

  if (typeof createZstdDecompress === 'function') {
    await pipeline(fs.createReadStream(archive), createZstdDecompress(), fs.createWriteStream(tarFile))
    return tarFile
  }

  try {
    execSync(`zstd -d -f "${archive}" -o "${tarFile}"`, { stdio: 'ignore' })
  } catch {
    throw new Error(
      'This Ollama release ships zstd-compressed archives and no zstd decompressor is available. ' +
        'Install zstd (Debian/Ubuntu: sudo apt-get install zstd, Fedora: sudo dnf install zstd, Arch: sudo pacman -S zstd) and retry.'
    )
  }
  return tarFile
}

/** Extracts one downloaded archive into `destDir`, which may already hold earlier parts. */
async function extractArchive(archive: string, destDir: string): Promise<void> {
  if (archive.endsWith('.zip')) {
    new AdmZip(archive).extractAllTo(destDir, true)
    return
  }
  if (archive.endsWith('.tar.zst')) {
    const tarFile = await decompressZstd(archive)
    try {
      execSync(`tar -xf "${tarFile}" -C "${destDir}"`)
    } finally {
      try { fs.unlinkSync(tarFile) } catch {}
    }
    return
  }
  if (archive.endsWith('.tgz') || archive.endsWith('.tar.gz')) {
    execSync(`tar -xzf "${archive}" -C "${destDir}"`)
    return
  }
  fs.copyFileSync(archive, path.join(destDir, getBinaryFilename()))
}

export async function downloadOllamaBinary(
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<string> {
  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  const engineDir = getOllamaDir()
  const tempFiles: string[] = []

  onProgress?.({
    type: 'binary',
    name: 'Ollama Backend',
    completed: 0,
    total: 100,
    percent: 0,
    speed: 'Starting...'
  })

  try {
    const targetVersion = await resolveDownloadVersion(signal)

    // AMD cards need the ROCm overlay on top of the base archive; the base one
    // only carries the CPU and (where published) CUDA runtimes.
    const gpu = await detectGpu()
    const wantsRocm = gpu.vendor === 'amd' && supportsRocmVariant()
    const parts: Array<{ variant: OllamaAssetVariant; label: string; required: boolean }> = [
      { variant: 'base', label: 'Ollama Backend', required: true }
    ]
    if (wantsRocm) {
      parts.push({ variant: 'rocm', label: 'Ollama ROCm runtime', required: false })
    }

    const versionDir = getVersionDir(targetVersion)
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true })
    }
    fs.mkdirSync(versionDir, { recursive: true })

    // Reserve the last 10% for extraction, and split the rest across the parts.
    const span = 90 / parts.length
    let downloadedBytes = 0

    for (const [index, part] of parts.entries()) {
      const url = getBinaryDownloadUrl(targetVersion, part.variant)
      const ext = url.endsWith('.zip')
        ? 'zip'
        : url.endsWith('.tar.zst')
          ? 'tar.zst'
          : url.endsWith('.tgz') || url.endsWith('.tar.gz')
            ? 'tgz'
            : 'bin'
      const tempFile = path.join(engineDir, `ollama_download.tmp.${part.variant}.${ext}`)
      tempFiles.push(tempFile)

      const result = await downloadArchive(
        url,
        tempFile,
        part.label,
        { from: index * span, to: (index + 1) * span },
        signal,
        onProgress
      )

      if (!result.ok) {
        if (part.required) {
          throw new Error(`Failed to download Ollama binary: HTTP ${result.status}`)
        }
        // A missing overlay is not fatal — Ollama still runs, just on CPU.
        console.warn(
          `Ollama ${part.variant} runtime unavailable for ${targetVersion} (HTTP ${result.status}); continuing without GPU acceleration for AMD.`
        )
        continue
      }

      downloadedBytes += result.bytes

      onProgress?.({
        type: 'binary',
        name: part.label,
        completed: result.bytes,
        total: result.bytes,
        percent: Math.round((index + 1) * span),
        speed: `Extracting ${part.label}...`
      })

      await extractArchive(tempFile, versionDir)
    }

    for (const tempFile of tempFiles) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    }

    const targetPath = getBinaryPath()
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Executable ${getBinaryFilename()} not found after extraction`)
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

      if (process.platform === 'darwin') {
        try {
          execSync(`xattr -dr com.apple.quarantine "${versionDir}"`)
        } catch {}
      }
    }

    onProgress?.({
      type: 'binary',
      name: 'Ollama Backend',
      completed: downloadedBytes,
      total: downloadedBytes,
      percent: 100,
      speed: 'Done'
    })

    return targetPath
  } catch (err: any) {
    for (const tempFile of tempFiles) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile) } catch {}
      }
    }
    throw err
  } finally {
    currentAbortController = null
  }
}

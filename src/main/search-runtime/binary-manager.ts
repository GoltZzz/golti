import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import type { SearchRuntimeProgress } from '../../shared/types'
import { SEARCH_RUNTIME_RELEASE_BASE, SEARCH_RUNTIME_VERSION } from './constants'

export function getPlatformKey(): string {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin') return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (platform === 'win32') return 'win32-x64'
  if (platform === 'linux') return 'linux-x64'
  throw new Error(`Unsupported platform: ${platform} ${arch}`)
}

export function getSearchRuntimeDir(): string {
  const dir = path.join(app.getPath('userData'), 'golti-search-runtime')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getVersionDir(): string {
  return path.join(getSearchRuntimeDir(), SEARCH_RUNTIME_VERSION)
}

export function getApiBinaryName(): string {
  return process.platform === 'win32' ? 'golti-search-api.exe' : 'golti-search-api'
}

function walkFind(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = walkFind(full, filename)
      if (found) return found
    } else if (entry.isFile() && entry.name === filename) {
      return full
    }
  }
  return null
}

export function getApiBinaryPath(): string {
  const found = walkFind(getVersionDir(), getApiBinaryName())
  if (found) return found
  return path.join(getVersionDir(), 'bin', getApiBinaryName())
}

export function getSearxLauncherPath(): string | null {
  const names =
    process.platform === 'win32'
      ? ['searxng.exe', 'run-searxng.bat', 'searxng.bat']
      : ['searxng', 'run-searxng', 'searxng.sh']
  for (const name of names) {
    const found = walkFind(path.join(getVersionDir(), 'bin'), name)
    if (found) return found
  }
  return null
}

/**
 * The settings file shipped in the bundle, which is what pins SearXNG to
 * 127.0.0.1. Without it a sidecar would start on upstream defaults.
 */
export function getSearxSettingsPath(): string | null {
  return walkFind(path.join(getVersionDir(), 'config'), 'searxng.settings.yml')
}

export function isSearchRuntimeInstalled(): boolean {
  const p = getApiBinaryPath()
  if (!fs.existsSync(p)) return false
  try {
    return fs.statSync(p).size > 100000
  } catch {
    return false
  }
}

export function getLocalBundlePath(): string | null {
  const key = getPlatformKey()
  const filename = `golti-search-runtime-${SEARCH_RUNTIME_VERSION}-${key}.zip`
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath
      ? process.resourcesPath
      : null
  const candidates = [
    // Packaged app: electron-builder extraResources → Resources/search-runtime/
    ...(resourcesPath
      ? [
          path.join(resourcesPath, 'search-runtime', 'bundle.zip'),
          path.join(resourcesPath, 'search-runtime', filename)
        ]
      : []),
    // Dev / local builds
    path.join(process.cwd(), 'dist', 'search-runtime', filename),
    path.join(app.getAppPath(), 'dist', 'search-runtime', filename),
    path.join(path.dirname(app.getAppPath()), 'dist', 'search-runtime', filename)
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

export function getRemoteBundleUrl(): string {
  const key = getPlatformKey()
  return `${SEARCH_RUNTIME_RELEASE_BASE}/golti-search-runtime-${SEARCH_RUNTIME_VERSION}-${key}.zip`
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function verifyChecksum(zipPath: string, shaPath: string | null): void {
  if (!shaPath || !fs.existsSync(shaPath)) return
  const expected = fs.readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0]
  if (!expected) return
  const actual = sha256File(zipPath)
  if (actual !== expected) {
    throw new Error('Search runtime download checksum mismatch. Please retry.')
  }
}

function extractBundle(zipPath: string): string {
  const versionDir = getVersionDir()
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true, force: true })
  }
  fs.mkdirSync(versionDir, { recursive: true })
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(versionDir, true)

  if (process.platform !== 'win32') {
    const chmodWalk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) chmodWalk(full)
        else fs.chmodSync(full, 0o755)
      }
    }
    chmodWalk(versionDir)
  }

  const binary = getApiBinaryPath()
  if (!fs.existsSync(binary)) {
    throw new Error('Search runtime binary missing from archive')
  }
  return binary
}

async function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (p: SearchRuntimeProgress) => void
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download search runtime (${res.status})`)
  }
  const total = Number(res.headers.get('content-length') || 0)
  let downloaded = 0
  let lastTime = Date.now()
  let lastBytes = 0
  const stream = fs.createWriteStream(dest)
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    stream.write(value)
    downloaded += value.length
    const now = Date.now()
    if (now - lastTime > 300 || downloaded === total) {
      const secs = (now - lastTime) / 1000
      const speed = secs > 0 ? (downloaded - lastBytes) / secs / (1024 * 1024) : 0
      onProgress?.({
        name: 'Web Search',
        completed: downloaded,
        total,
        percent: total > 0 ? Math.round((downloaded / total) * 90) : 45,
        speed: `${speed.toFixed(1)} MB/s`
      })
      lastTime = now
      lastBytes = downloaded
    }
  }
  stream.end()
  await new Promise<void>((resolve) => stream.on('finish', () => resolve()))
}

export async function installSearchRuntime(
  onProgress?: (p: SearchRuntimeProgress) => void
): Promise<string> {
  const runtimeDir = getSearchRuntimeDir()
  const tempZip = path.join(runtimeDir, 'bundle.tmp.zip')
  const local = getLocalBundlePath()

  onProgress?.({
    name: 'Web Search',
    completed: 0,
    total: 100,
    percent: 5,
    speed: local ? 'Installing…' : 'Downloading…'
  })

  try {
    if (local) {
      fs.copyFileSync(local, tempZip)
      const shaLocal = `${local}.sha256`
      verifyChecksum(tempZip, fs.existsSync(shaLocal) ? shaLocal : null)
    } else {
      await downloadToFile(getRemoteBundleUrl(), tempZip, onProgress)
      // Best-effort checksum download
      try {
        const shaUrl = `${getRemoteBundleUrl()}.sha256`
        const shaRes = await fetch(shaUrl)
        if (shaRes.ok) {
          const shaPath = `${tempZip}.sha256`
          fs.writeFileSync(shaPath, await shaRes.text())
          verifyChecksum(tempZip, shaPath)
          fs.unlinkSync(shaPath)
        }
      } catch {
        // checksum optional when release assets incomplete
      }
    }

    onProgress?.({
      name: 'Web Search',
      completed: 95,
      total: 100,
      percent: 95,
      speed: 'Extracting…'
    })
    const binary = extractBundle(tempZip)
    if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip)
    onProgress?.({
      name: 'Web Search',
      completed: 100,
      total: 100,
      percent: 100,
      speed: 'Done'
    })
    return binary
  } catch (err) {
    if (fs.existsSync(tempZip)) {
      try {
        fs.unlinkSync(tempZip)
      } catch {
        /* ignore */
      }
    }
    throw err
  }
}

export async function reinstallSearchRuntime(
  onProgress?: (p: SearchRuntimeProgress) => void
): Promise<string> {
  const versionDir = getVersionDir()
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true, force: true })
  }
  return installSearchRuntime(onProgress)
}

export function getInstalledVersion(): string | undefined {
  return isSearchRuntimeInstalled() ? SEARCH_RUNTIME_VERSION : undefined
}

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { EngineDownloadProgress } from '../../shared/types'

import { execSync } from 'child_process'

const GITHUB_RELEASE_BASE = 'https://github.com/ollama/ollama/releases/download'
const DEFAULT_OLLAMA_VERSION = 'v0.5.12'

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

export function getOllamaDir(): string {
  const userData = app?.getPath ? app.getPath('userData') : (process.env.HOME ? path.join(process.env.HOME, 'Library', 'Application Support', 'golti') : '.')
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

export function findRunningOllamaProcessInfo(port: number = 11434): { pid?: number; binaryPath?: string } {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      const match = output.split('\n').find(line => line.includes('LISTENING'))
      if (match) {
        const parts = match.trim().split(/\s+/)
        const pid = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(pid)) {
          return { pid }
        }
      }
    } else {
      const output = execSync(`lsof -i :${port} -sTCP:LISTEN -Fp`, { encoding: 'utf8' })
      const match = output.split('\n').find(line => line.startsWith('p'))
      if (match) {
        const pid = parseInt(match.substring(1), 10)
        if (!isNaN(pid)) {
          let binaryPath: string | undefined
          try {
            const procPath = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim()
            if (procPath && fs.existsSync(procPath)) {
              binaryPath = procPath
            }
          } catch {}
          return { pid, binaryPath }
        }
      }
    }
  } catch {}
  return {}
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

export function getBinaryDownloadUrl(version: string = DEFAULT_OLLAMA_VERSION): string {
  const key = getPlatformBinaryKey()
  switch (key) {
    case 'darwin':
      return `${GITHUB_RELEASE_BASE}/${version}/Ollama-darwin.zip`
    case 'windows-amd64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-windows-amd64.zip`
    case 'windows-arm64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-windows-arm64.zip`
    case 'linux-amd64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-linux-amd64.tgz`
    case 'linux-arm64':
      return `${GITHUB_RELEASE_BASE}/${version}/ollama-linux-arm64.tgz`
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

export async function downloadOllamaBinary(
  onProgress?: (progress: EngineDownloadProgress) => void
): Promise<string> {
  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  let targetVersion = await fetchLatestOllamaTag()
  const engineDir = getOllamaDir()
  let downloadUrl = getBinaryDownloadUrl(targetVersion)
  let isZip = downloadUrl.endsWith('.zip')
  let isTgz = downloadUrl.endsWith('.tgz') || downloadUrl.endsWith('.tar.gz')
  const tempFile = path.join(engineDir, isZip ? 'ollama_download.tmp.zip' : isTgz ? 'ollama_download.tmp.tgz' : 'ollama_download.tmp')

  onProgress?.({
    type: 'binary',
    name: 'Ollama Backend',
    completed: 0,
    total: 100,
    percent: 0,
    speed: 'Starting...'
  })

  try {
    let res = await fetch(downloadUrl, { signal })
    
    // Automatic fallback if latest release tag download returns 404
    if (res.status === 404 && targetVersion !== DEFAULT_OLLAMA_VERSION) {
      console.warn(`Ollama release ${targetVersion} download returned 404, falling back to default ${DEFAULT_OLLAMA_VERSION}`)
      targetVersion = DEFAULT_OLLAMA_VERSION
      downloadUrl = getBinaryDownloadUrl(targetVersion)
      isZip = downloadUrl.endsWith('.zip')
      isTgz = downloadUrl.endsWith('.tgz') || downloadUrl.endsWith('.tar.gz')
      res = await fetch(downloadUrl, { signal })
    }

    if (!res.ok || !res.body) {
      throw new Error(`Failed to download Ollama binary: HTTP ${res.status} ${res.statusText}`)
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
          const isArchive = isZip || isTgz
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * (isArchive ? 90 : 100)) : (isArchive ? 45 : 90)

          onProgress?.({
            type: 'binary',
            name: 'Ollama Backend',
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

    const versionDir = getVersionDir(targetVersion)
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true })
    }
    fs.mkdirSync(versionDir, { recursive: true })

    if (isZip) {
      onProgress?.({
        type: 'binary',
        name: 'Ollama Backend',
        completed: downloadedBytes,
        total: downloadedBytes,
        percent: 95,
        speed: 'Extracting zip archive...'
      })

      const zip = new AdmZip(tempFile)
      zip.extractAllTo(versionDir, true)
    } else if (isTgz) {
      onProgress?.({
        type: 'binary',
        name: 'Ollama Backend',
        completed: downloadedBytes,
        total: downloadedBytes,
        percent: 95,
        speed: 'Extracting tgz archive...'
      })

      execSync(`tar -xzf "${tempFile}" -C "${versionDir}"`)
    } else {
      const finalDest = path.join(versionDir, getBinaryFilename())
      fs.copyFileSync(tempFile, finalDest)
    }

    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile)
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
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile) } catch {}
    }
    throw err
  } finally {
    currentAbortController = null
  }
}

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { EngineDownloadProgress } from '../../shared/types'

import { execSync, spawn, ChildProcess } from 'child_process'

const GITHUB_RELEASE_BASE = 'https://github.com/ollama/ollama/releases/download'
const DEFAULT_OLLAMA_VERSION = 'v0.5.12'
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))

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

function resolveBinaryPathFromPid(pid: number): string | undefined {
  try {
    if (process.platform === 'linux') {
      const target = fs.readlinkSync(`/proc/${pid}/exe`)
      if (target && fs.existsSync(target)) return target
    } else if (process.platform === 'darwin') {
      const output = run(`lsof -p ${pid} -F n`)
      const match = output.split('\n').find((line) => line.startsWith('n') && line.endsWith('/ollama'))
      if (match) {
        const p = match.substring(1)
        if (fs.existsSync(p)) return p
      }
    } else if (process.platform === 'win32') {
      const output = run(`wmic process where "ProcessId=${pid}" get ExecutablePath`)
      const lines = output.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length >= 2 && fs.existsSync(lines[1])) {
        return lines[1]
      }
    }
  } catch {}
  return undefined
}

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

export function getBinaryPath(customModelPath?: string): string {
  if (customModelPath && customModelPath.trim()) {
    const trimmed = customModelPath.trim()
    if (fs.existsSync(trimmed)) {
      const foundInCustom = findExecutable(trimmed)
      if (foundInCustom) return foundInCustom
    }
  }

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

export function isBinaryInstalled(customModelPath?: string): boolean {
  const binaryPath = getBinaryPath(customModelPath)
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
let currentChildProcess: ChildProcess | null = null

function createInstallLogger(targetDir: string) {
  const logPath = path.join(targetDir, 'ollama-install.log')
  return (msg: string, err?: any) => {
    const timestamp = new Date().toISOString()
    const errStr = err ? `\n  Error Details: ${err.stack || err.message || String(err)}` : ''
    const logLine = `[${timestamp}] ${msg}${errStr}\n`
    console.log(`[OllamaInstall] ${msg}`)
    try {
      fs.appendFileSync(logPath, logLine, 'utf8')
    } catch (e) {
      console.error('Failed writing to ollama-install.log:', e)
    }
  }
}

export function cancelOllamaDownload(): boolean {
  let cancelled = false
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
    cancelled = true
  }
  if (currentChildProcess) {
    try {
      currentChildProcess.kill('SIGTERM')
    } catch {}
    currentChildProcess = null
    cancelled = true
  }
  return cancelled
}

async function extractZipNative(
  zipFilePath: string,
  destDir: string,
  logInstall: (msg: string, err?: any) => void
): Promise<void> {
  logInstall(`Initiating native zip extraction of "${zipFilePath}" into "${destDir}".`)

  // 1. On Windows, try native tar.exe first (built-in C++ stream extractor for .zip on Windows 10/11)
  if (process.platform === 'win32') {
    try {
      logInstall('Attempting extraction using native Windows tar...')
      await new Promise<void>((resolve, reject) => {
        const child = spawn('tar', ['-xf', zipFilePath, '-C', destDir], {
          stdio: ['ignore', 'pipe', 'pipe']
        })
        currentChildProcess = child
        let stderr = ''
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL') } catch {}
          currentChildProcess = null
          reject(new Error('Native tar extraction timed out after 180 seconds'))
        }, 180000)

        child.stderr?.on('data', (d) => { stderr += d.toString() })
        child.on('close', (code) => {
          clearTimeout(timer)
          currentChildProcess = null
          if (code === 0) resolve()
          else reject(new Error(`Tar extraction exited with code ${code}: ${stderr.trim()}`))
        })
        child.on('error', (err) => {
          clearTimeout(timer)
          currentChildProcess = null
          reject(err)
        })
      })
      logInstall('Native Windows tar extraction completed successfully.')
      return
    } catch (tarErr: any) {
      logInstall('Native tar extraction failed or unavailable, trying PowerShell Expand-Archive...', tarErr)
    }

    // 2. PowerShell Expand-Archive fallback on Windows
    try {
      logInstall('Attempting extraction using PowerShell Expand-Archive...')
      await new Promise<void>((resolve, reject) => {
        const psCmd = `Expand-Archive -Force -Path '${zipFilePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}'`
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
          stdio: ['ignore', 'pipe', 'pipe']
        })
        currentChildProcess = child
        let stderr = ''
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL') } catch {}
          currentChildProcess = null
          reject(new Error('PowerShell Expand-Archive timed out after 180 seconds'))
        }, 180000)

        child.stderr?.on('data', (d) => { stderr += d.toString() })
        child.on('close', (code) => {
          clearTimeout(timer)
          currentChildProcess = null
          if (code === 0) resolve()
          else reject(new Error(`PowerShell Expand-Archive exited with code ${code}: ${stderr.trim()}`))
        })
        child.on('error', (err) => {
          clearTimeout(timer)
          currentChildProcess = null
          reject(err)
        })
      })
      logInstall('PowerShell Expand-Archive extraction completed successfully.')
      return
    } catch (psErr: any) {
      logInstall('PowerShell Expand-Archive failed, falling back to AdmZip async...', psErr)
    }
  } else {
    // macOS / Linux native unzip
    try {
      logInstall('Attempting extraction using native unzip command...')
      await new Promise<void>((resolve, reject) => {
        const child = spawn('unzip', ['-o', zipFilePath, '-d', destDir], {
          stdio: ['ignore', 'pipe', 'pipe']
        })
        currentChildProcess = child
        let stderr = ''
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL') } catch {}
          currentChildProcess = null
          reject(new Error('Native unzip timed out after 180 seconds'))
        }, 180000)

        child.stderr?.on('data', (d) => { stderr += d.toString() })
        child.on('close', (code) => {
          clearTimeout(timer)
          currentChildProcess = null
          if (code === 0) resolve()
          else reject(new Error(`Unzip exited with code ${code}: ${stderr.trim()}`))
        })
        child.on('error', (err) => {
          clearTimeout(timer)
          currentChildProcess = null
          reject(err)
        })
      })
      logInstall('Native unzip extraction completed successfully.')
      return
    } catch (unzipErr: any) {
      logInstall('Native unzip failed, falling back to AdmZip async...', unzipErr)
    }
  }

  // 3. AdmZip async fallback
  logInstall('Extracting zip using AdmZip async fallback...')
  const zip = new AdmZip(zipFilePath)
  await new Promise<void>((resolve, reject) => {
    zip.extractAllToAsync(destDir, true, false, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  logInstall('AdmZip extraction completed successfully.')
}

export async function downloadOllamaBinary(
  onProgress?: (progress: EngineDownloadProgress) => void,
  customModelPath?: string
): Promise<string> {
  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  let targetVersion = await fetchLatestOllamaTag()
  const targetBaseDir = customModelPath && customModelPath.trim() ? customModelPath.trim() : getOllamaDir()
  if (!fs.existsSync(targetBaseDir)) {
    fs.mkdirSync(targetBaseDir, { recursive: true })
  }

  const logInstall = createInstallLogger(targetBaseDir)
  logInstall(`Installation process initiated. Target directory: "${targetBaseDir}", version: "${targetVersion}".`)

  // Requirement 1: Check for existing Ollama models/binaries first!
  const versionDir = path.join(targetBaseDir, targetVersion)
  const existingBinary = findExecutable(versionDir) || findExecutable(targetBaseDir) || getBinaryPath()
  if (existingBinary && fs.existsSync(existingBinary)) {
    try {
      const stats = fs.statSync(existingBinary)
      if (stats.isFile() && stats.size > 100 * 1024) {
        logInstall(`Valid existing Ollama binary detected at "${existingBinary}" (${(stats.size / (1024 * 1024)).toFixed(2)} MB). Skipping download & extraction.`)
        onProgress?.({
          type: 'binary',
          name: 'Ollama Backend',
          completed: 100,
          total: 100,
          percent: 100,
          speed: 'Binary already present, skipping download'
        })
        return existingBinary
      }
    } catch {}
  }

  const tempDir = path.join(targetBaseDir, '.download_tmp')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  let downloadUrl = getBinaryDownloadUrl(targetVersion)
  let isZip = downloadUrl.endsWith('.zip')
  let isTgz = downloadUrl.endsWith('.tgz') || downloadUrl.endsWith('.tar.gz')
  const tempFile = path.join(tempDir, isZip ? 'ollama_download.tmp.zip' : isTgz ? 'ollama_download.tmp.tgz' : 'ollama_download.tmp')

  logInstall(`Download URL resolved: "${downloadUrl}". Downloading temporary file to "${tempFile}".`)

  onProgress?.({
    type: 'binary',
    name: 'Ollama Backend',
    completed: 0,
    total: 100,
    percent: 0,
    speed: 'Starting...'
  })

  let lastCheckpointLogged = 0

  try {
    let res = await fetch(downloadUrl, { signal })
    
    // Automatic fallback if latest release tag download returns 404
    if (res.status === 404 && targetVersion !== DEFAULT_OLLAMA_VERSION) {
      logInstall(`Release tag ${targetVersion} download returned HTTP 404. Falling back to default ${DEFAULT_OLLAMA_VERSION}.`)
      targetVersion = DEFAULT_OLLAMA_VERSION
      downloadUrl = getBinaryDownloadUrl(targetVersion)
      isZip = downloadUrl.endsWith('.zip')
      isTgz = downloadUrl.endsWith('.tgz') || downloadUrl.endsWith('.tar.gz')
      res = await fetch(downloadUrl, { signal })
    }

    if (!res.ok || !res.body) {
      const errMessage = `Failed to download Ollama binary: HTTP ${res.status} ${res.statusText}`
      logInstall(errMessage)
      throw new Error(errMessage)
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
          logInstall('Download process was cancelled by user signal.')
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

          if (percent >= 25 && lastCheckpointLogged < 25) {
            logInstall(`Progress checkpoint: 25% completed (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`)
            lastCheckpointLogged = 25
          } else if (percent >= 50 && lastCheckpointLogged < 50) {
            logInstall(`Progress checkpoint: 50% completed (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`)
            lastCheckpointLogged = 50
          } else if (percent >= 75 && lastCheckpointLogged < 75) {
            logInstall(`Progress checkpoint: 75% completed (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`)
            lastCheckpointLogged = 75
          }

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
    logInstall(`Download completed (${downloadedBytes} bytes downloaded). Finalizing target folder setup.`)

    if (fs.existsSync(versionDir)) {
      try { fs.rmSync(versionDir, { recursive: true, force: true }) } catch {}
    }
    fs.mkdirSync(versionDir, { recursive: true })

    if (signal.aborted) {
      logInstall('Process aborted prior to extraction.')
      throw new Error('Download cancelled by user')
    }

    await yieldToEventLoop()

    logInstall(`Progress checkpoint: 95% completed - Beginning archive extraction into "${versionDir}".`)

    if (isZip) {
      onProgress?.({
        type: 'binary',
        name: 'Ollama Backend',
        completed: downloadedBytes,
        total: downloadedBytes,
        percent: 95,
        speed: 'Extracting zip archive with native tools...'
      })
      await yieldToEventLoop()

      try {
        await extractZipNative(tempFile, versionDir, logInstall)
      } catch (extractErr: any) {
        logInstall('Zip extraction error encountered.', extractErr)
        throw new Error(`Failed to extract zip archive: ${extractErr?.message || extractErr}`)
      }
    } else if (isTgz) {
      onProgress?.({
        type: 'binary',
        name: 'Ollama Backend',
        completed: downloadedBytes,
        total: downloadedBytes,
        percent: 95,
        speed: 'Extracting tgz archive...'
      })
      await yieldToEventLoop()

      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn('tar', ['-xzf', tempFile, '-C', versionDir], {
            stdio: ['ignore', 'pipe', 'pipe']
          })
          currentChildProcess = child
          let stderr = ''
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch {}
            currentChildProcess = null
            reject(new Error('Tar extraction timed out after 180 seconds'))
          }, 180000)

          child.stderr?.on('data', (d) => { stderr += d.toString() })

          child.on('close', (code) => {
            clearTimeout(timer)
            currentChildProcess = null
            if (code === 0) resolve()
            else reject(new Error(`Tar extraction failed with exit code ${code}: ${stderr.trim()}`))
          })

          child.on('error', (err) => {
            clearTimeout(timer)
            currentChildProcess = null
            reject(err)
          })
        })
        logInstall('Tgz archive extraction completed successfully.')
      } catch (extractErr: any) {
        logInstall('Tgz extraction error encountered.', extractErr)
        throw new Error(`Failed to extract tar archive: ${extractErr?.message || extractErr}`)
      }
    } else {
      const finalDest = path.join(versionDir, getBinaryFilename())
      logInstall(`Copying standalone binary to "${finalDest}".`)
      try {
        await fs.promises.copyFile(tempFile, finalDest)
        logInstall('Standalone binary copy completed.')
      } catch (copyErr: any) {
        logInstall('Binary copy error encountered.', copyErr)
        throw new Error(`Failed to copy binary file: ${copyErr?.message || copyErr}`)
      }
    }

    if (fs.existsSync(tempFile)) {
      try { await fs.promises.unlink(tempFile) } catch {}
    }

    if (fs.existsSync(tempDir)) {
      try { await fs.promises.rm(tempDir, { recursive: true, force: true }) } catch {}
    }

    if (signal.aborted) {
      logInstall('Process aborted after extraction.')
      throw new Error('Download cancelled by user')
    }

    await yieldToEventLoop()
    logInstall('Progress checkpoint: 98% completed - Verifying binary executable location.')

    onProgress?.({
      type: 'binary',
      name: 'Ollama Backend',
      completed: downloadedBytes,
      total: downloadedBytes,
      percent: 98,
      speed: 'Verifying binary installation...'
    })
    await yieldToEventLoop()

    const targetPath = findExecutable(versionDir) || getBinaryPath()
    if (!targetPath || !fs.existsSync(targetPath)) {
      const notFoundErr = `Executable ${getBinaryFilename()} not found after extraction in ${versionDir}`
      logInstall(notFoundErr)
      throw new Error(notFoundErr)
    }

    logInstall(`Binary verified at path: "${targetPath}".`)

    if (process.platform !== 'win32') {
      const makeExecutable = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              makeExecutable(fullPath)
            } else if (entry.isFile()) {
              try { fs.chmodSync(fullPath, 0o755) } catch {}
            }
          }
        } catch {}
      }
      makeExecutable(versionDir)

      if (process.platform === 'darwin') {
        try {
          execSync(`xattr -dr com.apple.quarantine "${versionDir}"`, {
            timeout: 10000,
            stdio: 'pipe'
          })
          logInstall('Cleared macOS quarantine attribute.')
        } catch {}
      }
    }

    logInstall('Progress checkpoint: 100% completed - Ollama installation finished successfully!')

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
    logInstall('Ollama installation failed.', err)
    if (fs.existsSync(tempDir)) {
      try { await fs.promises.rm(tempDir, { recursive: true, force: true }) } catch {}
    }
    const versionDir = path.join(targetBaseDir, targetVersion)
    if (fs.existsSync(versionDir)) {
      try { await fs.promises.rm(versionDir, { recursive: true, force: true }) } catch {}
    }
    throw err
  } finally {
    currentAbortController = null
    currentChildProcess = null
  }
}

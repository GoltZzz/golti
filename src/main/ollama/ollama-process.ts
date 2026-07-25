import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  getBinaryPath,
  isBinaryInstalled,
  getSystemBinaryPath,
  findRunningOllamaProcessInfo,
  stopSystemdOllama
} from './ollama-binary-manager'
import { mainWindow } from '../index'

let ollamaProcess: ChildProcess | null = null
const logBuffer: string[] = []
const MAX_LOG_LINES = 200

export interface OllamaState {
  status: 'not-installed' | 'stopped' | 'starting' | 'running' | 'error'
  error?: string
  binaryPath?: string | null
  port?: number
  pid?: number | null
  isSystemProcess?: boolean
  /** systemd unit owning the process, when Ollama is installed as a Linux service. */
  serviceUnit?: string
  /** True when stopping the owning unit requires root. */
  needsPrivilegedStop?: boolean
  host?: string
  version?: string
  logs?: string[]
}

// Resolved lazily by getOllamaState(): the disk probes below need
// `app.getPath('userData')`, which is unavailable at module import time.
let currentState: OllamaState = {
  status: 'not-installed',
  port: 11434,
  host: 'http://127.0.0.1:11434'
}

function appendLog(line: string) {
  logBuffer.push(`[${new Date().toLocaleTimeString()}] ${line}`)
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.shift()
  }
}

export function getOllamaLogs(): string[] {
  return [...logBuffer]
}

export async function checkOllamaHealth(port = 11434): Promise<{ isRunning: boolean; version?: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/version`, {
      signal: AbortSignal.timeout(1500)
    })
    if (res.ok) {
      const data = (await res.json()) as { version?: string }
      return { isRunning: true, version: data.version }
    }
  } catch {}
  return { isRunning: false }
}

export function getOllamaState(): OllamaState {
  const binaryInstalled = isBinaryInstalled()
  const currentBinPath = getSystemBinaryPath() || getBinaryPath()

  if (currentState.status === 'not-installed' && binaryInstalled) {
    currentState.status = 'stopped'
  }

  if (currentBinPath) {
    currentState.binaryPath = currentBinPath
  }

  // Probe system Ollama if not running via managed process
  if (!ollamaProcess && currentState.status !== 'starting') {
    checkOllamaHealth(currentState.port || 11434).then((health) => {
      if (health.isRunning) {
        const procInfo = findRunningOllamaProcessInfo(currentState.port || 11434)
        if (currentState.status !== 'running' || !currentState.isSystemProcess || !currentState.pid) {
          broadcastState({
            ...currentState,
            status: 'running',
            isSystemProcess: true,
            version: health.version || currentState.version,
            pid: procInfo.pid || currentState.pid,
            binaryPath: procInfo.binaryPath || currentState.binaryPath || getSystemBinaryPath() || getBinaryPath(),
            serviceUnit: procInfo.serviceUnit,
            needsPrivilegedStop: procInfo.needsPrivilegedStop,
            port: currentState.port || 11434,
            host: `http://127.0.0.1:${currentState.port || 11434}`
          })
        }
      } else if (currentState.isSystemProcess && currentState.status === 'running') {
        broadcastState({
          ...currentState,
          status: 'stopped',
          isSystemProcess: false,
          pid: undefined,
          serviceUnit: undefined,
          needsPrivilegedStop: undefined
        })
      }
    }).catch(() => {})
  }

  return {
    ...currentState,
    logs: getOllamaLogs()
  }
}

function broadcastState(state: OllamaState) {
  const procInfo = (state.isSystemProcess || !ollamaProcess) ? findRunningOllamaProcessInfo(state.port || 11434) : {}
  const resolvedBinPath = state.binaryPath || procInfo.binaryPath || getSystemBinaryPath() || getBinaryPath()
  currentState = {
    ...state,
    pid: state.pid ?? procInfo.pid ?? (ollamaProcess?.pid || undefined),
    binaryPath: resolvedBinPath
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ollama:state-changed', {
      ...currentState,
      logs: getOllamaLogs()
    })
  }
}

export async function startOllama(port = 11434, customModelPath?: string): Promise<boolean> {
  let binaryPath = getBinaryPath(customModelPath)
  let sysBinary = getSystemBinaryPath()

  // Check if system Ollama is already running on port
  const health = await checkOllamaHealth(port)
  if (health.isRunning) {
    const procInfo = findRunningOllamaProcessInfo(port)
    appendLog(
      procInfo.serviceUnit
        ? `Detected Ollama running as systemd unit ${procInfo.serviceUnit} on port ${port} (v${health.version || 'unknown'})`
        : `Detected existing Ollama service running on port ${port} (v${health.version || 'unknown'})`
    )
    broadcastState({
      status: 'running',
      port,
      host: `http://127.0.0.1:${port}`,
      isSystemProcess: true,
      version: health.version,
      pid: procInfo.pid,
      serviceUnit: procInfo.serviceUnit,
      needsPrivilegedStop: procInfo.needsPrivilegedStop,
      binaryPath: procInfo.binaryPath || sysBinary || binaryPath
    })
    return true
  }

  const effectiveBinaryPath = fs.existsSync(binaryPath) ? binaryPath : sysBinary
  if (!effectiveBinaryPath || !fs.existsSync(effectiveBinaryPath)) {
    broadcastState({ ...currentState, status: 'not-installed', binaryPath: undefined })
    return false
  }
  binaryPath = effectiveBinaryPath

  if (ollamaProcess) {
    if (currentState.status !== 'running') {
      broadcastState({ ...currentState, status: 'running' })
    }
    return true
  }

  const ollamaDir = path.dirname(binaryPath)
  broadcastState({ ...currentState, status: 'starting', port, host: `http://127.0.0.1:${port}` })
  appendLog(`Starting Ollama server binary: ${binaryPath} in cwd: ${ollamaDir} on port ${port}${customModelPath ? ` with OLLAMA_MODELS=${customModelPath}` : ''}`)

  try {
    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      OLLAMA_HOST: `127.0.0.1:${port}`,
      OLLAMA_ORIGINS: '*'
    }

    if (customModelPath && customModelPath.trim()) {
      spawnEnv.OLLAMA_MODELS = customModelPath.trim()
    }

    ollamaProcess = spawn(binaryPath, ['serve'], {
      cwd: ollamaDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv
    })

    if (!ollamaProcess.pid) {
      throw new Error('Failed to obtain PID for Ollama process')
    }

    const pid = ollamaProcess.pid
    appendLog(`Ollama process started with PID ${pid}`)

    ollamaProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim()
      console.log('[Ollama]', output)
      appendLog(output)
      if (output.includes('Listening on') || output.includes('Listening')) {
        if (currentState.status !== 'running') {
          broadcastState({
            ...currentState,
            status: 'running',
            pid,
            port,
            host: `http://127.0.0.1:${port}`,
            isSystemProcess: false
          })
        }
      }
    })

    ollamaProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim()
      console.error('[Ollama STDERR]', output)
      appendLog(output)
      if (output.includes('Listening on') || output.includes('Listening')) {
        if (currentState.status !== 'running') {
          broadcastState({
            ...currentState,
            status: 'running',
            pid,
            port,
            host: `http://127.0.0.1:${port}`,
            isSystemProcess: false
          })
        }
      }
    })

    ollamaProcess.on('close', (code) => {
      console.log('[Ollama] process exited with code', code)
      appendLog(`Ollama process exited with code ${code}`)
      ollamaProcess = null
      if (code !== 0 && code !== null) {
        broadcastState({ ...currentState, status: 'error', error: `Exited with code ${code}`, pid: undefined })
      } else {
        broadcastState({ ...currentState, status: 'stopped', pid: undefined })
      }
    })

    ollamaProcess.on('error', (err) => {
      console.error('[Ollama] process error', err)
      appendLog(`Ollama error: ${err.message}`)
      ollamaProcess = null
      broadcastState({ ...currentState, status: 'error', error: err.message, pid: undefined })
    })

    setTimeout(async () => {
      if (currentState.status === 'starting') {
        const check = await checkOllamaHealth(port)
        if (check.isRunning || ollamaProcess) {
          broadcastState({
            ...currentState,
            status: 'running',
            pid: ollamaProcess?.pid,
            port,
            host: `http://127.0.0.1:${port}`,
            isSystemProcess: !ollamaProcess
          })
        }
      }
    }, 2500)

    return true
  } catch (err: any) {
    ollamaProcess = null
    appendLog(`Failed to start Ollama: ${err.message}`)
    broadcastState({ ...currentState, status: 'error', error: err.message })
    return false
  }
}

export function stopOllama(): boolean {
  if (ollamaProcess) {
    appendLog('Sending SIGTERM to Ollama process...')
    ollamaProcess.kill('SIGTERM')
    setTimeout(() => {
      if (ollamaProcess) {
        appendLog('Sending SIGKILL to Ollama process...')
        ollamaProcess.kill('SIGKILL')
        ollamaProcess = null
      }
    }, 2000)
    return true
  }

  // We never spawned it, so there is no child to signal. A systemd-managed daemon
  // has to be stopped through systemd, and reporting success here would leave the
  // UI claiming "stopped" while Ollama keeps serving.
  if (currentState.serviceUnit) {
    const result = stopSystemdOllama(currentState)
    appendLog(result.message)
    if (!result.ok) {
      broadcastState({ ...currentState, error: result.message })
      return false
    }
    broadcastState({
      ...currentState,
      status: 'stopped',
      pid: undefined,
      isSystemProcess: false,
      serviceUnit: undefined,
      needsPrivilegedStop: undefined,
      error: undefined
    })
    return true
  }

  if (currentState.isSystemProcess) {
    const message = `Ollama is running outside Golti (PID ${currentState.pid ?? 'unknown'}); stop it where you started it.`
    appendLog(message)
    broadcastState({ ...currentState, error: message })
    return false
  }

  if (currentState.status !== 'stopped' && currentState.status !== 'not-installed') {
    broadcastState({ ...currentState, status: 'stopped', pid: undefined })
  }
  return true
}

export function setOllamaStateNotInstalled() {
  broadcastState({ status: 'not-installed' })
}

export function setOllamaStateStopped() {
  broadcastState({ status: 'stopped' })
}

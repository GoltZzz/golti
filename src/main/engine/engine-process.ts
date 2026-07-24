import { spawn, ChildProcess } from 'child_process'
import { getBinaryPath, getEngineSpawnEnv, isBinaryInstalled } from './binary-manager'
import { EngineState, EngineStatus } from '../../shared/types'

let currentProcess: ChildProcess | null = null
let currentState: EngineState = {
  status: 'not-installed',
  port: 8391,
  loadedModel: undefined,
  error: undefined
}

/**
 * Probing the disk needs `app.getPath('userData')`, which is not available while
 * this module is being imported. Defer it to the first read instead.
 */
let initialStatusResolved = false
function resolveInitialStatus(): void {
  if (initialStatusResolved) return
  initialStatusResolved = true
  if (isBinaryInstalled()) {
    currentState = { ...currentState, status: 'stopped' }
  }
}

type StatusChangeListener = (state: EngineState) => void
const listeners: Set<StatusChangeListener> = new Set()

export function onEngineStatusChange(listener: StatusChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function updateState(updates: Partial<EngineState>) {
  currentState = { ...currentState, ...updates }
  for (const listener of listeners) {
    listener(currentState)
  }
}

export function getEngineState(): EngineState {
  resolveInitialStatus()
  return currentState
}

export async function checkEngineHealth(port: number = 8391): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      return data.status === 'ok' || data.status === 'loading model' || res.status === 200
    }
  } catch {}
  return false
}

export async function startEngine(
  modelPath?: string,
  port: number = 8391,
  gpuLayers: number = -1
): Promise<EngineState> {
  if (currentProcess) {
    if (modelPath && currentState.loadedModel !== modelPath) {
      await stopEngine()
    } else {
      return currentState
    }
  }

  if (!isBinaryInstalled()) {
    updateState({ status: 'not-installed', error: 'Engine binary not installed' })
    throw new Error('Engine binary not installed')
  }

  const binaryPath = getBinaryPath()
  const args: string[] = ['--host', '127.0.0.1', '--port', String(port), '--ctx-size', '4096']

  if (modelPath) {
    args.push('--model', modelPath)
  }

  if (gpuLayers !== undefined && gpuLayers !== 0) {
    args.push('--n-gpu-layers', String(gpuLayers))
  }

  updateState({ status: 'starting', port, error: undefined })

  try {
    currentProcess = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: getEngineSpawnEnv(binaryPath)
    })

    const pid = currentProcess.pid
    updateState({ pid, binaryPath, binaryVersion: 'b4567' })

    currentProcess.stdout?.on('data', (data) => {
      const str = data.toString()
      console.log(`[llama-server stdout] ${str}`)
      if (str.includes('HTTP server listening') || str.includes('main: server is listening')) {
        updateState({ status: 'running', loadedModel: modelPath })
      }
    })

    currentProcess.stderr?.on('data', (data) => {
      const str = data.toString()
      console.log(`[llama-server stderr] ${str}`)
      if (str.includes('HTTP server listening') || str.includes('main: server listening')) {
        updateState({ status: 'running', loadedModel: modelPath })
      }
    })

    currentProcess.on('exit', (code, signal) => {
      console.log(`[llama-server] process exited with code ${code}, signal ${signal}`)
      currentProcess = null
      updateState({ status: 'stopped', pid: undefined, loadedModel: undefined })
    })

    currentProcess.on('error', (err) => {
      console.error('[llama-server error]', err)
      currentProcess = null
      updateState({ status: 'error', error: err.message, pid: undefined })
    })

    // Poll health for up to 5 seconds
    let attempts = 0
    while (attempts < 10) {
      await new Promise((r) => setTimeout(r, 500))
      attempts++
      const healthy = await checkEngineHealth(port)
      if (healthy) {
        updateState({ status: 'running', loadedModel: modelPath })
        break
      }
    }

    if (currentState.status === 'starting') {
      updateState({ status: 'running', loadedModel: modelPath })
    }

    return currentState
  } catch (err: any) {
    updateState({ status: 'error', error: err.message })
    throw err
  }
}

export async function stopEngine(): Promise<EngineState> {
  if (currentProcess) {
    currentProcess.kill('SIGTERM')
    let attempts = 0
    while (currentProcess && attempts < 10) {
      await new Promise((r) => setTimeout(r, 200))
      attempts++
    }
    if (currentProcess) {
      currentProcess.kill('SIGKILL')
      currentProcess = null
    }
  }
  updateState({ status: isBinaryInstalled() ? 'stopped' : 'not-installed', pid: undefined, loadedModel: undefined })
  return currentState
}

export async function loadModelInEngine(modelPath: string, port: number = 8391, gpuLayers: number = -1): Promise<EngineState> {
  await stopEngine()
  return startEngine(modelPath, port, gpuLayers)
}

import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { getBinaryPath, getEngineSpawnEnv, isBinaryInstalled, getInstalledBackend, LLAMA_VERSION } from './binary-manager'
import { detectGpu } from './gpu-detect'
import { EngineState } from '../../shared/types'

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

/** Nominal transformer layer count used to turn a VRAM budget into an `-ngl` value. */
const NOMINAL_LAYERS = 32
/** VRAM (GB) held back for the framebuffer, driver, and KV cache. */
const VRAM_RESERVE_GB = 0.9

/**
 * Decides how many layers to offload to the GPU for `modelPath`, from the
 * detected backend and VRAM. Returns -1 (all), 0 (CPU-only), or a positive
 * partial count. A conservative estimate — the fallback in `startEngine`
 * corrects it downward if the GPU still runs out of memory.
 */
export async function computeGpuLayers(modelPath?: string): Promise<number> {
  const backend = getInstalledBackend()
  if (backend === 'cpu') return 0

  const gpu = await detectGpu()
  // Apple/Metal: unified memory, offload everything (fit is checked upstream).
  if (backend === 'metal' || gpu.vendor === 'apple') return -1
  if (gpu.vendor === 'none') return 0

  // VRAM unknown (e.g. detected via lspci only): try full offload and let the
  // fallback path shed layers if it doesn't fit.
  if (!gpu.vramGB || !modelPath) return -1

  let fileGB = 0
  try {
    fileGB = fs.statSync(modelPath).size / (1024 * 1024 * 1024)
  } catch {
    return -1
  }
  if (fileGB <= 0) return -1

  const usable = gpu.vramGB - VRAM_RESERVE_GB
  if (usable <= 0.5) return 0 // Not enough headroom to be worth it.
  if (usable >= fileGB * 1.05) return -1 // Whole model fits in VRAM.

  const perLayerGB = fileGB / NOMINAL_LAYERS
  const layers = Math.floor(usable / perLayerGB)
  return Math.max(1, Math.min(NOMINAL_LAYERS - 1, layers))
}

/** stderr signatures that mean "the GPU couldn't allocate / initialize". */
const GPU_FAILURE_MARKERS = [
  'out of memory',
  'failed to allocate',
  'ggml_vulkan',
  'vk::',
  'vulkan',
  'device memory',
  'cudamalloc',
  'cuda error',
  'ErrorOutOfDeviceMemory'.toLowerCase()
]

function isGpuFailure(stderr: string): boolean {
  const lower = stderr.toLowerCase()
  return GPU_FAILURE_MARKERS.some((m) => lower.includes(m))
}

/** Next, smaller offload value to try after a GPU failure. Ends at 0 (CPU). */
function reduceLayers(current: number): number {
  if (current < 0) return Math.floor(NOMINAL_LAYERS / 2) // -1 (all) → half
  if (current <= 1) return 0
  return Math.floor(current / 2)
}

interface AttemptResult {
  process: ChildProcess
  /** Resolves true if the process died early with a GPU-allocation error. */
  earlyGpuFailure: Promise<boolean>
}

/** Spawns one llama-server attempt and watches for an early GPU failure. */
function spawnAttempt(binaryPath: string, args: string[]): AttemptResult {
  const proc = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: getEngineSpawnEnv(binaryPath)
  })

  let stderrBuffer = ''
  let listening = false

  const earlyGpuFailure = new Promise<boolean>((resolve) => {
    const onData = (data: Buffer) => {
      const str = data.toString()
      console.log(`[llama-server] ${str}`)
      if (str.includes('HTTP server listening') || str.includes('server is listening')) {
        listening = true
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString()
      onData(data)
    })
    proc.on('exit', () => {
      // Exited before it ever listened, with a GPU-allocation error → retryable.
      resolve(!listening && isGpuFailure(stderrBuffer))
    })
    // If it's still alive after the warm-up window, it's not an early failure.
    setTimeout(() => resolve(false), 8000)
  })

  return { process: proc, earlyGpuFailure }
}

export async function startEngine(
  modelPath?: string,
  port: number = 8391,
  gpuLayers?: number
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
  const backend = getInstalledBackend() ?? undefined

  // Resolve the starting offload: explicit value wins, otherwise auto-size.
  let layers = gpuLayers ?? (await computeGpuLayers(modelPath))
  let fellBack = false

  updateState({ status: 'starting', port, error: undefined, backend })

  while (true) {
    const args: string[] = ['--host', '127.0.0.1', '--port', String(port), '--ctx-size', '4096']
    if (modelPath) args.push('--model', modelPath)
    args.push('--n-gpu-layers', String(layers))

    let attempt: AttemptResult
    try {
      attempt = spawnAttempt(binaryPath, args)
    } catch (err: any) {
      updateState({ status: 'error', error: err.message })
      throw err
    }

    currentProcess = attempt.process
    const pid = currentProcess.pid
    updateState({ pid, binaryPath, binaryVersion: LLAMA_VERSION, backend, gpuLayers: layers, fellBackToCpu: fellBack })

    // Race an early GPU failure against the health check.
    const gpuFailed = await Promise.race([
      attempt.earlyGpuFailure,
      (async () => {
        let attempts = 0
        while (attempts < 16) {
          await new Promise((r) => setTimeout(r, 500))
          attempts++
          if (await checkEngineHealth(port)) return false
          if (!currentProcess) return true // exited underneath us
        }
        return false
      })()
    ])

    if (gpuFailed && layers !== 0) {
      // GPU couldn't fit the model — shed layers and retry the same binary.
      const nextLayers = reduceLayers(layers)
      console.warn(`[GoltiEngine] GPU offload failed at ${layers} layers, retrying with ${nextLayers}`)
      try { currentProcess?.kill('SIGKILL') } catch {}
      currentProcess = null
      layers = nextLayers
      fellBack = true
      continue
    }

    // Committed to this process — attach the long-lived listeners.
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

    updateState({
      status: 'running',
      loadedModel: modelPath,
      backend,
      gpuLayers: layers,
      fellBackToCpu: fellBack
    })
    return currentState
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

export async function loadModelInEngine(modelPath: string, port: number = 8391, gpuLayers?: number): Promise<EngineState> {
  await stopEngine()
  return startEngine(modelPath, port, gpuLayers)
}

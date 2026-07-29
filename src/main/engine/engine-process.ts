import fs from 'fs'
import net from 'net'
import { spawn, execFile, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { getBinaryPath, getEngineSpawnEnv, isBinaryInstalled, getInstalledBackend, LLAMA_VERSION } from './binary-manager'
import { detectGpu, GpuVendor } from './gpu-detect'
import { computeContextSize, reduceContextSize, MIN_CONTEXT_SIZE } from './context-size'
import { readGgufModelInfo } from './gguf'
import { getAvailableMemoryBytes } from '../system/memory'
import { detectCpuCounts } from '../system/cpu'
import { kvBytesPerToken } from '../../shared/context-budget'
import {
  buildTuningArgs,
  chooseThreadCount,
  computeOffloadLayers,
  isUnsupportedArgFailure,
  reduceOffloadLayers
} from '../../shared/engine-tuning'
import { EngineState } from '../../shared/types'
import {
  EngineFailure,
  classifyEngineFailure,
  engineFailureText,
  estimateEngineLoadBudgetMs,
  ENGINE_LOAD_IDLE_GRACE_MS,
  ENGINE_LOAD_CEILING_MS
} from '../../shared/engine-startup'

const execFileAsync = promisify(execFile)

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
    updateState({ status: 'stopped' })
  }
}

type StatusChangeListener = (state: EngineState) => void
const listeners: Set<StatusChangeListener> = new Set()

export function onEngineStatusChange(listener: StatusChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateState(updates: Partial<EngineState>) {
  currentState = { ...currentState, ...updates }
  for (const listener of listeners) {
    listener(currentState)
  }
}

export function getEngineState(): EngineState {
  resolveInitialStatus()
  return currentState
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

export async function findAvailablePort(startPort: number = 8391, maxAttempts: number = 5): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const candidate = startPort + offset
    if (await isPortAvailable(candidate)) {
      return candidate
    }
  }
  return startPort
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

export interface EngineDevice {
  /** Backend device id, e.g. "Vulkan1", used with `--device`. */
  id: string
  name: string
  totalMiB: number
  freeMiB: number
}

/** Asks the engine binary which offload devices it can see. */
export async function listEngineDevices(binaryPath: string): Promise<EngineDevice[]> {
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['--list-devices'], {
      env: getEngineSpawnEnv(binaryPath),
      timeout: 10000
    })
    const devices: EngineDevice[] = []
    for (const line of `${stdout}\n${stderr}`.split('\n')) {
      // "  Vulkan1: NVIDIA GeForce GTX 1650 (4342 MiB, 3918 MiB free)"
      const m = line.match(/^\s*(\S+):\s+(.*?)\s+\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)/)
      if (m) devices.push({ id: m[1], name: m[2], totalMiB: +m[3], freeMiB: +m[4] })
    }
    return devices
  } catch {
    return []
  }
}

/**
 * Picks the discrete GPU to offload to on multi-GPU machines. On hybrid boxes
 * the Vulkan runtime otherwise defaults to device 0, which is often the
 * integrated GPU (sharing slow system RAM) rather than the discrete card.
 */
export function pickEngineDevice(devices: EngineDevice[], vendor: GpuVendor): EngineDevice | null {
  if (devices.length === 0) return null
  const match = (re: RegExp) => devices.filter((d) => re.test(d.name))
  let candidates: EngineDevice[] = []
  if (vendor === 'nvidia') candidates = match(/nvidia|geforce|rtx|gtx|quadro|tesla/i)
  else if (vendor === 'amd') candidates = match(/radeon|amd|rx\s*\d/i)
  else if (vendor === 'intel') candidates = match(/intel|arc/i)
  if (candidates.length === 0) return null
  // Prefer the one with the most dedicated VRAM (discrete over integrated).
  return candidates.sort((a, b) => b.totalMiB - a.totalMiB)[0]
}

/**
 * Decides how many layers to offload to the GPU for `modelPath`, from the
 * detected backend and VRAM. Returns -1 (all), 0 (CPU-only), or a positive
 * partial count. A conservative estimate — the fallback in `startEngine`
 * corrects it downward if the GPU still runs out of memory.
 */
export async function computeGpuLayers(modelPath?: string, vramGBOverride?: number): Promise<number> {
  const backend = getInstalledBackend()
  if (backend === 'cpu') return 0

  const gpu = await detectGpu()
  // Apple/Metal: unified memory, offload everything (fit is checked upstream).
  if (backend === 'metal' || gpu.vendor === 'apple') return -1
  if (gpu.vendor === 'none') return 0

  const vramGB = vramGBOverride ?? gpu.vramGB
  // VRAM unknown (e.g. detected via lspci only): try full offload and let the
  // fallback path shed layers if it doesn't fit.
  if (!vramGB || !modelPath) return -1

  const modelBytes = statSizeBytes(modelPath) ?? 0
  if (modelBytes <= 0) return -1

  const info = readGgufModelInfo(modelPath)
  return computeOffloadLayers({
    modelBytes,
    vramBytes: vramGB * 1024 * 1024 * 1024,
    layerCount: info?.blockCount,
    // Any offload runs with the quantized KV cache from buildTuningArgs.
    kvBytesPerToken: kvBytesPerToken(
      {
        blockCount: info?.blockCount,
        embeddingLength: info?.embeddingLength,
        headCount: info?.headCount,
        headCountKv: info?.headCountKv
      },
      'q8_0'
    )
  })
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

export class EngineStartError extends Error {
  readonly failure: EngineFailure

  constructor(failure: EngineFailure) {
    super(engineFailureText(failure))
    this.name = 'EngineStartError'
    this.failure = failure
  }
}

interface AttemptResult {
  process: ChildProcess
  /** Resolves true if the process died early with a GPU-allocation error. */
  earlyGpuFailure: Promise<boolean>
  getStderr: () => string
  getLastOutputAt: () => number
  hasExited: () => boolean
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
  let lastOutputAt = Date.now()
  let exited = false

  const earlyGpuFailure = new Promise<boolean>((resolve) => {
    const onData = (data: Buffer) => {
      const str = data.toString()
      lastOutputAt = Date.now()
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
      exited = true
      // Exited before it ever listened, with a GPU-allocation error → retryable.
      resolve(!listening && isGpuFailure(stderrBuffer))
    })
  })

  return {
    process: proc,
    earlyGpuFailure,
    getStderr: () => stderrBuffer,
    getLastOutputAt: () => lastOutputAt,
    hasExited: () => exited
  }
}

/**
 * Polls `/health` until the server answers. The deadline scales with the model
 * file size, and extends whenever the process is still writing output, so a slow
 * load is never mistaken for a hung one.
 */
async function waitForHealthy(
  port: number,
  attempt: AttemptResult,
  budgetMs: number
): Promise<boolean> {
  const startedAt = Date.now()
  const ceiling = startedAt + ENGINE_LOAD_CEILING_MS

  while (true) {
    if (await checkEngineHealth(port)) return true
    if (attempt.hasExited()) return false

    const now = Date.now()
    const deadline = Math.min(
      Math.max(startedAt + budgetMs, attempt.getLastOutputAt() + ENGINE_LOAD_IDLE_GRACE_MS),
      ceiling
    )
    if (now >= deadline) return false

    await new Promise((r) => setTimeout(r, 500))
  }
}

function statSizeBytes(filePath?: string): number | undefined {
  if (!filePath) return undefined
  try {
    return fs.statSync(filePath).size
  } catch {
    return undefined
  }
}

export async function startEngine(
  modelPath?: string,
  port: number = 8391,
  gpuLayers?: number,
  preferredDeviceId?: string
): Promise<EngineState> {
  if (currentProcess) {
    if (modelPath && currentState.loadedModel !== modelPath) {
      await stopEngine()
    } else {
      return currentState
    }
  }

  if (!isBinaryInstalled()) {
    const failure: EngineFailure = {
      kind: 'not-installed',
      title: 'Golti Engine is not installed yet',
      detail: 'The local inference engine still needs to be downloaded. You can install it from Settings.',
      action: 'open-settings'
    }
    updateState({ status: 'not-installed', error: engineFailureText(failure), failure })
    throw new EngineStartError(failure)
  }

  if (!modelPath) {
    const failure: EngineFailure = {
      kind: 'no-model',
      title: 'No model is installed',
      detail: 'Golti Engine needs a model file before it can answer. Pick one from the Hardware Cookbook to get started.',
      action: 'choose-smaller-model'
    }
    updateState({ status: 'error', error: engineFailureText(failure), failure })
    throw new EngineStartError(failure)
  }

  const binaryPath = getBinaryPath()
  const backend = getInstalledBackend() ?? undefined

  // On a GPU backend, pick the discrete device explicitly (hybrid machines
  // otherwise default to the integrated GPU) and size offload from *its* free
  // VRAM rather than a system-wide probe.
  let device: EngineDevice | null = null
  if (backend === 'vulkan') {
    const devices = await listEngineDevices(binaryPath)
    // Honour an explicit device choice when it's still present; otherwise
    // auto-pick the discrete GPU for the detected vendor.
    if (preferredDeviceId) {
      device = devices.find((d) => d.id === preferredDeviceId) ?? null
    }
    if (!device) {
      const gpu = await detectGpu()
      device = pickEngineDevice(devices, gpu.vendor)
    }
    if (device) {
      console.log(`[GoltiEngine] Offloading to ${device.id} (${device.name}, ${device.freeMiB} MiB free)`)
    }
  }

  // Resolve the starting offload: explicit value wins, otherwise auto-size.
  let layers = gpuLayers ?? (await computeGpuLayers(modelPath, device ? device.freeMiB / 1024 : undefined))
  let fellBack = false

  const layerCount = readGgufModelInfo(modelPath)?.blockCount
  const threads = chooseThreadCount(await detectCpuCounts())
  let tuningEnabled = true
  console.log(
    `[GoltiEngine] Offload ${layers} of ${layerCount ?? 'unknown'} layers, ${threads} generation threads`
  )

  const sizing = await computeContextSize({
    modelPath,
    gpuLayers: layers,
    freeVramGB: device ? device.freeMiB / 1024 : undefined
  })
  let contextSize = sizing.contextSize
  console.log(
    `[GoltiEngine] Context size ${contextSize}` +
      (sizing.trainedContextSize ? ` (model trained for ${sizing.trainedContextSize}` : ' (model context unknown') +
      (sizing.cappedByMemory ? ', capped by available memory)' : ')')
  )

  const modelSizeBytes = statSizeBytes(modelPath)
  const freeMemoryBytes = await getAvailableMemoryBytes().catch(() => undefined)
  const loadBudgetMs = estimateEngineLoadBudgetMs(modelSizeBytes, freeMemoryBytes)
  console.log(`[GoltiEngine] Load budget ${Math.round(loadBudgetMs / 1000)}s for ${modelPath}`)

  // Find available port to prevent port binding collisions.
  const actualPort = await findAvailablePort(port)

  updateState({
    status: 'starting',
    port: actualPort,
    error: undefined,
    failure: undefined,
    lastLogs: undefined,
    backend,
    gpuDevice: device?.name
  })

  while (true) {
    const args: string[] = [
      '--host', '127.0.0.1',
      '--port', String(actualPort),
      '--ctx-size', String(contextSize),
      '--cache-reuse', '256',
      '--jinja',
      '--reasoning-format', 'deepseek'
    ]
    if (modelPath) args.push('--model', modelPath)
    if (device) args.push('--device', device.id)
    args.push('--n-gpu-layers', String(layers))
    args.push(...buildTuningArgs({ gpuLayers: layers, threads, enabled: tuningEnabled }))

    let attempt: AttemptResult
    try {
      attempt = spawnAttempt(binaryPath, args)
    } catch (err: any) {
      updateState({ status: 'error', error: err.message, lastLogs: err.stack || err.message })
      throw err
    }

    currentProcess = attempt.process
    const pid = currentProcess.pid
    updateState({ pid, binaryPath, binaryVersion: LLAMA_VERSION, backend, gpuLayers: layers, fellBackToCpu: fellBack, contextSize })

    const isHealthy = await waitForHealthy(actualPort, attempt, loadBudgetMs)

    if (!isHealthy && attempt.hasExited() && tuningEnabled && isUnsupportedArgFailure(attempt.getStderr())) {
      // This engine build rejects one of the performance flags — retry plain.
      console.warn('[GoltiEngine] Engine rejected tuning flags, retrying without them')
      try { currentProcess?.kill('SIGKILL') } catch {}
      currentProcess = null
      tuningEnabled = false
      continue
    }

    const gpuFailed = !isHealthy && attempt.hasExited() && (await attempt.earlyGpuFailure)

    if (gpuFailed && layers !== 0) {
      // GPU couldn't fit the model — shed layers and retry the same binary.
      const nextLayers = reduceOffloadLayers(layers, layerCount)
      console.warn(`[GoltiEngine] GPU offload failed at ${layers} layers, retrying with ${nextLayers}`)
      try { currentProcess?.kill('SIGKILL') } catch {}
      currentProcess = null
      layers = nextLayers
      fellBack = true
      continue
    }

    if (!isHealthy) {
      const stderr = attempt.getStderr().trim()
      if (layers !== 0) {
        console.warn(`[GoltiEngine] Health check failed at ${layers} layers, falling back to CPU`)
        try { currentProcess?.kill('SIGKILL') } catch {}
        currentProcess = null
        layers = 0
        fellBack = true
        continue
      }
      if (contextSize > MIN_CONTEXT_SIZE) {
        const nextContext = reduceContextSize(contextSize)
        console.warn(`[GoltiEngine] Health check failed at ctx-size ${contextSize}, retrying with ${nextContext}`)
        try { currentProcess?.kill('SIGKILL') } catch {}
        currentProcess = null
        contextSize = nextContext
        continue
      }
      const failure = classifyEngineFailure({
        stderr,
        timedOut: !attempt.hasExited(),
        exitCode: attempt.process.exitCode,
        modelPath,
        modelSizeBytes,
        freeMemoryBytes
      })
      console.error('[GoltiEngine] Server failed to start:', failure.kind, stderr)
      try { currentProcess?.kill('SIGKILL') } catch {}
      currentProcess = null
      updateState({
        status: 'error',
        error: engineFailureText(failure),
        failure,
        lastLogs: stderr || undefined,
        pid: undefined
      })
      throw new EngineStartError(failure)
    }

    // Committed to this process — attach the long-lived listeners.
    currentProcess.on('exit', (code, signal) => {
      console.log(`[llama-server] process exited with code ${code}, signal ${signal}`)
      const isUnexpected = code !== 0 && code !== null && signal === null
      const stderrMsg = attempt.getStderr().trim()
      currentProcess = null
      if (isUnexpected) {
        const failure = classifyEngineFailure({
          stderr: stderrMsg,
          exitCode: code,
          signal,
          modelPath,
          modelSizeBytes,
          freeMemoryBytes
        })
        updateState({
          status: 'error',
          error: engineFailureText(failure),
          failure,
          lastLogs: stderrMsg || undefined,
          pid: undefined,
          loadedModel: undefined
        })
      } else {
        updateState({ status: 'stopped', pid: undefined, loadedModel: undefined, failure: undefined })
      }
    })
    currentProcess.on('error', (err) => {
      console.error('[llama-server error]', err)
      currentProcess = null
      updateState({ status: 'error', error: err.message, lastLogs: err.stack || err.message, pid: undefined })
    })

    updateState({
      status: 'running',
      loadedModel: modelPath,
      backend,
      gpuDevice: device?.name,
      gpuLayers: layers,
      fellBackToCpu: fellBack,
      contextSize
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

export async function loadModelInEngine(
  modelPath: string,
  port: number = 8391,
  gpuLayers?: number,
  preferredDeviceId?: string
): Promise<EngineState> {
  await stopEngine()
  return startEngine(modelPath, port, gpuLayers, preferredDeviceId)
}

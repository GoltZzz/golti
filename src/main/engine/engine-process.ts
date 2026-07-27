import fs from 'fs'
import net from 'net'
import { spawn, execFile, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { getBinaryPath, getEngineSpawnEnv, isBinaryInstalled, getInstalledBackend, LLAMA_VERSION } from './binary-manager'
import { detectGpu, GpuVendor } from './gpu-detect'
import { readGgufModelInfo } from './gguf'
import { computeContextSize, reduceContextSize, MIN_CONTEXT_SIZE, kvBytesPerToken } from './context-size'
import { EngineState } from '../../shared/types'

const execFileAsync = promisify(execFile)

let currentProcess: ChildProcess | null = null
/**
 * A start already in progress. `startEngine` runs several awaits (device probe,
 * VRAM sizing, port scan) before it spawns, so without this guard two
 * overlapping callers both see `currentProcess === null`, both pick the same
 * free port, and the loser dies with "couldn't bind HTTP server socket".
 */
let startInFlight: Promise<EngineState> | null = null
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

/**
 * Fallback layer count for models whose GGUF header cannot be read. Real counts
 * come from `block_count`; this is only a last resort, and it is deliberately
 * mid-range (7B models have 28-32, 14B have 48, 70B have 80).
 */
const NOMINAL_LAYERS = 32
/**
 * VRAM (GB) that is occupied no matter how few layers we offload: llama.cpp's
 * compute buffers plus the CUDA/Vulkan context. Unlike the KV cache this does
 * not scale with layers or context, so it is the only genuinely flat reserve.
 */
const VRAM_FIXED_OVERHEAD_GB = 0.7

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
 * Decides how many layers to offload to the GPU for `modelPath`.
 *
 * A layer costs its share of the weights *plus* its share of the KV cache, and
 * the KV term is not small: a 14B model at 4k context spends ~10% of each
 * layer's VRAM on KV, and that grows linearly with context. Sizing against
 * weights alone (as this did while it assumed a flat 32 layers) both misreads
 * how much fits and hides the KV cost inside a flat reserve.
 *
 * Layers are sized against `MIN_CONTEXT_SIZE`, the smallest context we are
 * willing to run; `computeContextSize` then grows the context into whatever
 * VRAM is left. Offload wins ties because it drives generation speed.
 *
 * Returns -1 (all), 0 (CPU-only), or a positive partial count. The fallback in
 * `startEngine` still corrects downward if the GPU refuses the allocation.
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

  let fileGB = 0
  try {
    fileGB = fs.statSync(modelPath).size / (1024 * 1024 * 1024)
  } catch {
    return -1
  }
  if (fileGB <= 0) return -1

  const info = readGgufModelInfo(modelPath)
  const blockCount = info?.blockCount ?? NOMINAL_LAYERS

  // Per-layer KV at the minimum context we would accept. Zero when the header
  // is unreadable, which degrades to the old weights-only behaviour.
  const perTokenKvBytes = kvBytesPerToken(
    info?.blockCount,
    info?.embeddingLength,
    info?.headCount,
    info?.headCountKv
  )
  const kvPerLayerGB = perTokenKvBytes
    ? (perTokenKvBytes / blockCount) * MIN_CONTEXT_SIZE / (1024 * 1024 * 1024)
    : 0

  const weightsPerLayerGB = fileGB / blockCount
  const perLayerGB = weightsPerLayerGB + kvPerLayerGB

  const usable = vramGB - VRAM_FIXED_OVERHEAD_GB
  if (usable <= 0.5 || perLayerGB <= 0) return 0 // Not enough headroom to be worth it.

  const layers = Math.floor(usable / perLayerGB)
  if (layers >= blockCount) return -1 // Whole model plus its KV fits in VRAM.
  return Math.max(1, layers)
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

/**
 * Next, smaller offload value to try after a GPU failure. Ends at 0 (CPU).
 * `blockCount` is the model's real layer count, so halving "all" starts from
 * the actual number rather than a guess that can exceed it.
 */
function reduceLayers(current: number, blockCount?: number): number {
  if (current < 0) return Math.floor((blockCount ?? NOMINAL_LAYERS) / 2) // -1 (all) → half
  if (current <= 1) return 0
  // Step down by a quarter rather than halving. Now that sizing accounts for KV
  // it lands much closer to the true limit, so an overshoot is usually small —
  // halving would give up far more offload than the failure warrants.
  return Math.max(1, Math.floor(current * 0.75))
}

/**
 * Kills `proc` and waits for it to actually exit. The listening socket is only
 * released when the process is reaped, so a retry that respawns on the same
 * port immediately after `kill()` can still lose the bind to its predecessor.
 */
async function killAndWait(proc: ChildProcess | null, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const done = () => resolve()
    proc.once('exit', done)
    proc.once('error', done)
    try {
      proc.kill(signal)
    } catch {
      resolve()
      return
    }
    // Never hang the start path on an unreapable child.
    setTimeout(done, 5000)
  })
}

interface AttemptResult {
  process: ChildProcess
  /** Resolves true if the process died early with a GPU-allocation error. */
  earlyGpuFailure: Promise<boolean>
  getStderr: () => string
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

  return { process: proc, earlyGpuFailure, getStderr: () => stderrBuffer }
}

export async function startEngine(
  modelPath?: string,
  port: number = 8391,
  gpuLayers?: number,
  preferredDeviceId?: string
): Promise<EngineState> {
  // Serialize starts: a second caller joins the in-flight one instead of
  // racing it to the same port.
  if (startInFlight) {
    try {
      const state = await startInFlight
      // The in-flight start brought up the model we wanted — reuse it.
      if (!modelPath || state.loadedModel === modelPath) return state
    } catch {
      // The other start failed; fall through and try our own.
    }
  }
  const run = startEngineInner(modelPath, port, gpuLayers, preferredDeviceId)
  startInFlight = run
  try {
    return await run
  } finally {
    if (startInFlight === run) startInFlight = null
  }
}

async function startEngineInner(
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
    updateState({ status: 'not-installed', error: 'Engine binary not installed' })
    throw new Error('Engine binary not installed')
  }

  if (!modelPath) {
    const noModelMsg = 'No GGUF model found. Please download a model from the Hardware Cookbook before starting Golti Engine.'
    updateState({ status: 'error', error: noModelMsg })
    throw new Error(noModelMsg)
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
  const modelBlockCount = readGgufModelInfo(modelPath)?.blockCount
  let fellBack = false

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

  // Find available port to prevent port binding collisions.
  const actualPort = await findAvailablePort(port)

  updateState({ status: 'starting', port: actualPort, error: undefined, lastLogs: undefined, backend, gpuDevice: device?.name })

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

    // Race an early GPU failure against the health check.
    const gpuFailed = await Promise.race([
      attempt.earlyGpuFailure,
      (async () => {
        let attempts = 0
        while (attempts < 16) {
          await new Promise((r) => setTimeout(r, 500))
          attempts++
          if (await checkEngineHealth(actualPort)) return false
          if (!currentProcess) return true // exited underneath us
        }
        return false
      })()
    ])

    if (gpuFailed && layers !== 0) {
      // GPU couldn't fit the model — shed layers and retry the same binary.
      const nextLayers = reduceLayers(layers, modelBlockCount)
      console.warn(`[GoltiEngine] GPU offload failed at ${layers} layers, retrying with ${nextLayers}`)
      await killAndWait(currentProcess)
      currentProcess = null
      layers = nextLayers
      fellBack = true
      continue
    }

    // Verify health
    const isHealthy = await checkEngineHealth(actualPort)
    if (!isHealthy) {
      const stderr = attempt.getStderr().trim()
      if (layers !== 0) {
        console.warn(`[GoltiEngine] Health check failed at ${layers} layers, falling back to CPU`)
        await killAndWait(currentProcess)
        currentProcess = null
        layers = 0
        fellBack = true
        continue
      }
      if (contextSize > MIN_CONTEXT_SIZE) {
        const nextContext = reduceContextSize(contextSize)
        console.warn(`[GoltiEngine] Health check failed at ctx-size ${contextSize}, retrying with ${nextContext}`)
        await killAndWait(currentProcess)
        currentProcess = null
        contextSize = nextContext
        continue
      }
      const errorMsg = stderr || 'llama-server failed to start or health check timed out.'
      console.error('[GoltiEngine] Server failed health check:', errorMsg)
      await killAndWait(currentProcess)
      currentProcess = null
      updateState({ status: 'error', error: errorMsg, lastLogs: stderr || errorMsg, pid: undefined })
      throw new Error(errorMsg)
    }

    // Committed to this process — attach the long-lived listeners.
    currentProcess.on('exit', (code, signal) => {
      console.log(`[llama-server] process exited with code ${code}, signal ${signal}`)
      const isUnexpected = code !== 0 && code !== null && signal === null
      const stderrMsg = attempt.getStderr().trim()
      currentProcess = null
      if (isUnexpected) {
        const errStr = stderrMsg || `Engine process exited unexpectedly with code ${code}`
        updateState({ status: 'error', error: errStr, lastLogs: stderrMsg || errStr, pid: undefined, loadedModel: undefined })
      } else {
        updateState({ status: 'stopped', pid: undefined, loadedModel: undefined })
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
  // A start still in flight owns `currentProcess`; let it settle so we don't
  // leave an orphan holding the port.
  if (startInFlight) await startInFlight.catch(() => {})
  const proc = currentProcess
  if (proc) {
    // Wait on the process itself rather than on `currentProcess` being nulled:
    // the handler that nulls it is only attached once a start has fully
    // succeeded, so a still-starting engine would otherwise never clear.
    await killAndWait(proc, 'SIGTERM')
    await killAndWait(proc, 'SIGKILL')
    if (currentProcess === proc) currentProcess = null
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

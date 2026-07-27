const GB = 1024 * 1024 * 1024

export const ENGINE_LOAD_BASE_MS = 20_000
export const ENGINE_LOAD_PER_GB_MS = 15_000
export const ENGINE_LOAD_PER_GB_SWAPPING_MS = 45_000
export const ENGINE_LOAD_IDLE_GRACE_MS = 45_000
export const ENGINE_LOAD_CEILING_MS = 900_000

export function modelFitsInMemory(modelSizeBytes?: number, freeMemoryBytes?: number): boolean {
  if (!modelSizeBytes || !freeMemoryBytes) return true
  return modelSizeBytes <= freeMemoryBytes * 0.9
}

export function estimateEngineLoadBudgetMs(
  modelSizeBytes?: number,
  freeMemoryBytes?: number
): number {
  if (!modelSizeBytes) return ENGINE_LOAD_BASE_MS
  const sizeGB = modelSizeBytes / GB
  const perGB = modelFitsInMemory(modelSizeBytes, freeMemoryBytes)
    ? ENGINE_LOAD_PER_GB_MS
    : ENGINE_LOAD_PER_GB_SWAPPING_MS
  const budget = ENGINE_LOAD_BASE_MS + sizeGB * perGB
  return Math.min(Math.round(budget), ENGINE_LOAD_CEILING_MS)
}

export type EngineFailureKind =
  | 'not-installed'
  | 'no-model'
  | 'out-of-memory'
  | 'load-timeout'
  | 'gpu-memory'
  | 'port-in-use'
  | 'unknown'

export type EngineFailureAction = 'choose-smaller-model' | 'open-settings' | 'retry' | 'none'

export interface EngineFailure {
  kind: EngineFailureKind
  title: string
  detail: string
  action: EngineFailureAction
  logs?: string
}

export interface EngineFailureInput {
  stderr?: string
  timedOut?: boolean
  exitCode?: number | null
  signal?: string | null
  modelPath?: string
  modelSizeBytes?: number
  freeMemoryBytes?: number
}

const HOST_OOM_MARKERS = [
  'failed to allocate buffer',
  'unable to allocate backend buffer',
  'cannot allocate memory',
  'std::bad_alloc',
  'killed'
]

const GPU_OOM_MARKERS = [
  'ggml_vulkan',
  'vk::',
  'erroroutofdevicememory',
  'cudamalloc',
  'cuda error',
  'device memory'
]

const PORT_MARKERS = ['address already in use', 'bind: ', 'failed to bind']

function formatGB(bytes?: number): string {
  if (!bytes) return 'unknown size'
  return `${(bytes / GB).toFixed(1)} GB`
}

export function modelDisplayName(modelPath?: string): string {
  if (!modelPath) return 'the model'
  const base = modelPath.split(/[/\\]/).pop() ?? modelPath
  return base.replace(/\.gguf(\.tmp)?$/i, '')
}

export function classifyEngineFailure(input: EngineFailureInput): EngineFailure {
  const logs = input.stderr?.trim() || undefined
  const lower = (logs ?? '').toLowerCase()
  const name = modelDisplayName(input.modelPath)
  const fits = modelFitsInMemory(input.modelSizeBytes, input.freeMemoryBytes)

  if (GPU_OOM_MARKERS.some((m) => lower.includes(m))) {
    return {
      kind: 'gpu-memory',
      title: 'Not enough graphics memory',
      detail: `Your GPU could not hold ${name}, so Golti will try again using the processor instead. This works, but it is slower.`,
      action: 'retry',
      logs
    }
  }

  if (PORT_MARKERS.some((m) => lower.includes(m))) {
    return {
      kind: 'port-in-use',
      title: 'The engine port is already taken',
      detail:
        'Another program is using the port Golti needs. Closing other local AI tools, or changing the engine port in Settings, should clear it.',
      action: 'open-settings',
      logs
    }
  }

  if (HOST_OOM_MARKERS.some((m) => lower.includes(m)) || (input.timedOut && !fits)) {
    return {
      kind: 'out-of-memory',
      title: 'This model is too big for your free memory',
      detail:
        `${name} needs about ${formatGB(input.modelSizeBytes)}, but only ${formatGB(input.freeMemoryBytes)} is free right now. ` +
        'Closing some apps may help, but a smaller model will run far better on this machine.',
      action: 'choose-smaller-model',
      logs
    }
  }

  if (input.timedOut) {
    return {
      kind: 'load-timeout',
      title: 'The model took too long to start',
      detail: `Golti waited for ${name} to load but it never became ready. Trying again often works, since the file is faster to read the second time.`,
      action: 'retry',
      logs
    }
  }

  return {
    kind: 'unknown',
    title: 'Golti Engine could not start',
    detail: `Something went wrong while starting ${name}. The technical details are below.`,
    action: 'retry',
    logs
  }
}

export function engineFailureText(failure: EngineFailure): string {
  return `${failure.title}. ${failure.detail}`
}

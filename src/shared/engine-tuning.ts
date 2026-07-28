export const DEFAULT_LAYER_COUNT = 32

const GB = 1024 * 1024 * 1024

export const VRAM_RESERVE_BYTES = 0.9 * GB

export const KV_RESERVE_CONTEXT = 4096

const MIN_USEFUL_VRAM_BYTES = 0.5 * GB

export interface OffloadInput {
  modelBytes: number
  vramBytes?: number
  layerCount?: number
  kvBytesPerToken?: number
}

export function computeOffloadLayers(input: OffloadInput): number {
  const { modelBytes, vramBytes } = input
  if (!vramBytes || vramBytes <= 0 || modelBytes <= 0) return -1

  const layerCount = input.layerCount && input.layerCount > 0 ? input.layerCount : DEFAULT_LAYER_COUNT
  const kvReserve = (input.kvBytesPerToken ?? 0) * KV_RESERVE_CONTEXT

  const usable = vramBytes - VRAM_RESERVE_BYTES - kvReserve
  if (usable <= MIN_USEFUL_VRAM_BYTES) return 0
  if (usable >= modelBytes * 1.05) return -1

  const perLayer = modelBytes / layerCount
  const layers = Math.floor(usable / perLayer)
  return Math.max(1, Math.min(layerCount - 1, layers))
}

export function reduceOffloadLayers(current: number, layerCount?: number): number {
  const total = layerCount && layerCount > 0 ? layerCount : DEFAULT_LAYER_COUNT
  if (current < 0) return Math.floor(total / 2)
  if (current <= 1) return 0
  return Math.floor(current / 2)
}

export interface CpuCounts {
  logicalCores: number
  physicalCores?: number
  performanceCores?: number
}

const MAX_THREADS = 16

export function chooseThreadCount(counts: CpuCounts): number {
  const base =
    counts.performanceCores && counts.performanceCores > 0
      ? counts.performanceCores
      : counts.physicalCores && counts.physicalCores > 0
        ? counts.physicalCores
        : Math.floor(Math.max(counts.logicalCores, 1) / 2)

  return Math.max(1, Math.min(MAX_THREADS, base))
}

export interface TuningArgsInput {
  gpuLayers: number
  threads?: number
  
  enabled?: boolean
}

export function buildTuningArgs(input: TuningArgsInput): string[] {
  if (input.enabled === false) return []

  const args: string[] = []
  if (input.threads && input.threads > 0) {
    args.push('--threads', String(input.threads))
  }

  const offloadsToGpu = input.gpuLayers !== 0
  if (offloadsToGpu) {
    args.push('--flash-attn', 'on', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0')
  } else {
    args.push('--flash-attn', 'auto')
  }
  return args
}

const UNSUPPORTED_ARG_MARKERS = [
  'invalid argument',
  'unknown argument',
  'unrecognized argument',
  'error while handling argument',
  'unsupported kv cache type',
  'flash_attn'
]

export function isUnsupportedArgFailure(stderr: string): boolean {
  const lower = stderr.toLowerCase()
  return UNSUPPORTED_ARG_MARKERS.some((m) => lower.includes(m))
}

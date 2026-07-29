import type { KvCacheType } from './context-budget'

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

/**
 * Layers to offload, sized so that weights *and* KV cache fit.
 *
 * A layer costs its share of the weights plus its share of the KV cache, and
 * only the offloaded layers put their KV in VRAM. Reserving KV for the whole
 * model up front - as a flat block, before deciding how many layers go to the
 * GPU - over-charges a partial offload badly: on a 48-layer 14B with 12 layers
 * resident it reserves four times the KV that actually lands on the card.
 */
export function computeOffloadLayers(input: OffloadInput): number {
  const { modelBytes, vramBytes } = input
  if (!vramBytes || vramBytes <= 0 || modelBytes <= 0) return -1

  const layerCount = input.layerCount && input.layerCount > 0 ? input.layerCount : DEFAULT_LAYER_COUNT

  const usable = vramBytes - VRAM_RESERVE_BYTES
  if (usable <= MIN_USEFUL_VRAM_BYTES) return 0

  // Per-layer cost: weights plus the KV this layer will hold at the reserve
  // context. `kvBytesPerToken` covers every layer, so divide it down to one.
  const weightsPerLayer = modelBytes / layerCount
  const kvPerLayer = ((input.kvBytesPerToken ?? 0) / layerCount) * KV_RESERVE_CONTEXT
  const perLayer = weightsPerLayer + kvPerLayer
  if (perLayer <= 0) return -1

  // Full offload only when the KV of every layer fits alongside the weights.
  if (usable >= perLayer * layerCount) return -1

  const layers = Math.floor(usable / perLayer)
  return Math.max(1, Math.min(layerCount, layers))
}

export function reduceOffloadLayers(current: number, layerCount?: number): number {
  const total = layerCount && layerCount > 0 ? layerCount : DEFAULT_LAYER_COUNT
  if (current < 0) return Math.floor(total / 2)
  if (current <= 1) return 0
  // Step down by a quarter rather than halving. Sizing now lands close to the
  // true limit, so an overshoot is usually small and halving would surrender
  // far more offload than the failure warrants.
  return Math.max(1, Math.floor(current * 0.75))
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

/**
 * The KV cache format the engine will actually run with, given the same inputs
 * `buildTuningArgs` sees. Memory sizing must agree with this: quantized cache is
 * roughly half the size of f16, so assuming the wrong one misreserves VRAM.
 */
export function kvCacheTypeFor(gpuLayers: number, tuningEnabled = true): KvCacheType {
  if (!tuningEnabled) return 'f16'
  return gpuLayers !== 0 ? 'q8_0' : 'f16'
}

export function buildTuningArgs(input: TuningArgsInput): string[] {
  if (input.enabled === false) return []

  const args: string[] = []
  if (input.threads && input.threads > 0) {
    args.push('--threads', String(input.threads))
  }

  const offloadsToGpu = input.gpuLayers !== 0
  if (offloadsToGpu) {
    // Keep in step with kvCacheTypeFor above.
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

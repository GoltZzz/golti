export const MIN_CONTEXT_SIZE = 4096
export const MAX_CONTEXT_SIZE = 32768
export const CONTEXT_GRANULARITY = 1024
export const UNKNOWN_SHAPE_CONTEXT_CAP = 8192
/**
 * Reference context used when sizing KV against VRAM. Matches the engine's
 * KV_RESERVE_CONTEXT so the cookbook's estimate and the engine's own sizing
 * describe the same run.
 */
export const KV_RESERVE_CONTEXT_DEFAULT = 4096

/** f16 KV cache: two bytes per element. */
const KV_BYTES_PER_ELEMENT = 2
/**
 * q8_0 KV cache: 32 int8 values share one f16 scale, so 34 bytes per 32
 * elements. `buildTuningArgs` requests this whenever it offloads to a GPU, which
 * nearly halves KV memory - sizing against f16 in that case reserves roughly
 * twice the VRAM the cache actually needs.
 */
const KV_Q8_BYTES_PER_ELEMENT = 34 / 32

export type KvCacheType = 'f16' | 'q8_0'

export function kvBytesPerElement(type: KvCacheType = 'f16'): number {
  return type === 'q8_0' ? KV_Q8_BYTES_PER_ELEMENT : KV_BYTES_PER_ELEMENT
}
const GB = 1024 * 1024 * 1024
const RAM_RESERVE_BYTES = 1.5 * GB
const VRAM_RESERVE_BYTES = 0.75 * GB

export interface ModelShape {
  blockCount?: number
  embeddingLength?: number
  headCount?: number
  headCountKv?: number
}

export interface ContextBudgetInput {
  trainedContextSize?: number
  perTokenBytes?: number
  modelBytes: number
  availableBytes: number
  freeVramBytes?: number
  fullyOffloaded?: boolean
  /** Layers offloaded to the GPU: -1 all, 0 none, N partial. */
  gpuLayers?: number
  /** The model's total layer count, which turns `gpuLayers` into a fraction. */
  layerCount?: number
  parallelSlots?: number
}

export interface ContextBudgetResult {
  contextSize: number
  cappedByMemory: boolean
}

/**
 * KV cache bytes per token for the whole model.
 *
 * `cacheType` must match what the engine is actually launched with: the tuning
 * args quantize the cache to q8_0 on GPU runs, and assuming f16 there
 * over-reserves VRAM by roughly 2x.
 */
export function kvBytesPerToken(shape: ModelShape, cacheType: KvCacheType = 'f16'): number | undefined {
  const { blockCount, embeddingLength, headCount, headCountKv } = shape
  if (!blockCount || !embeddingLength) return undefined
  const gqaRatio = headCount && headCountKv ? headCountKv / headCount : 1
  const kvDim = embeddingLength * gqaRatio
  return 2 * blockCount * kvDim * kvBytesPerElement(cacheType)
}

export function roundDownToGranularity(tokens: number): number {
  return Math.floor(tokens / CONTEXT_GRANULARITY) * CONTEXT_GRANULARITY
}

/**
 * Share of the model resident on the GPU. Both the weights and the KV cache
 * split at this ratio. Defaults to the whole model when the caller cannot say,
 * which errs toward charging VRAM for more than it holds rather than less.
 */
export function gpuOffloadFraction(input: Pick<ContextBudgetInput, 'fullyOffloaded' | 'gpuLayers' | 'layerCount'>): number {
  if (input.fullyOffloaded) return 1
  const { gpuLayers, layerCount } = input
  if (gpuLayers === undefined) return 1
  if (gpuLayers === -1) return 1
  if (gpuLayers <= 0) return 0
  if (!layerCount || layerCount <= 0) return 1
  return Math.min(1, gpuLayers / layerCount)
}

export function computeContextBudget(input: ContextBudgetInput): ContextBudgetResult {
  const trained = input.trainedContextSize
  if (!trained) {
    return { contextSize: MIN_CONTEXT_SIZE, cappedByMemory: false }
  }

  const target = Math.min(trained, MAX_CONTEXT_SIZE)
  const perToken = input.perTokenBytes
  if (!perToken) {
    return {
      contextSize: Math.max(MIN_CONTEXT_SIZE, Math.min(target, UNKNOWN_SHAPE_CONTEXT_CAP)),
      cappedByMemory: true
    }
  }

  const slots = Math.max(1, input.parallelSlots ?? 1)
  const usesDiscreteVram = input.freeVramBytes !== undefined

  // Weights and KV cache both split at the offload boundary, so each side pays
  // only for the layers it actually holds. Treating a partial offload as if the
  // GPU held no weights but the whole model's KV overcommits the card.
  const gpuFraction = usesDiscreteVram ? gpuOffloadFraction(input) : 0
  const cpuFraction = 1 - gpuFraction

  let affordableTokens: number
  if (usesDiscreteVram) {
    const vramBudget =
      (input.freeVramBytes as number) - VRAM_RESERVE_BYTES - input.modelBytes * gpuFraction
    const ramBudget = input.availableBytes - RAM_RESERVE_BYTES - input.modelBytes * cpuFraction
    if (vramBudget <= 0 || ramBudget <= 0) {
      return { contextSize: MIN_CONTEXT_SIZE, cappedByMemory: true }
    }
    const vramTokens = gpuFraction > 0 ? vramBudget / (perToken * gpuFraction * slots) : Infinity
    const ramTokens = cpuFraction > 0 ? ramBudget / (perToken * cpuFraction * slots) : Infinity
    affordableTokens = Math.min(vramTokens, ramTokens)
  } else {
    const budgetBytes = input.availableBytes - RAM_RESERVE_BYTES - input.modelBytes
    if (budgetBytes <= 0) {
      return { contextSize: MIN_CONTEXT_SIZE, cappedByMemory: true }
    }
    affordableTokens = budgetBytes / (perToken * slots)
  }

  const affordable = roundDownToGranularity(affordableTokens)
  const contextSize = Math.max(MIN_CONTEXT_SIZE, Math.min(target, affordable))

  return { contextSize, cappedByMemory: contextSize < target }
}

export const MIN_CONTEXT_SIZE = 4096
export const MAX_CONTEXT_SIZE = 32768
export const CONTEXT_GRANULARITY = 1024
export const UNKNOWN_SHAPE_CONTEXT_CAP = 8192

const KV_BYTES_PER_ELEMENT = 2
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
  parallelSlots?: number
}

export interface ContextBudgetResult {
  contextSize: number
  cappedByMemory: boolean
}

export function kvBytesPerToken(shape: ModelShape): number | undefined {
  const { blockCount, embeddingLength, headCount, headCountKv } = shape
  if (!blockCount || !embeddingLength) return undefined
  const gqaRatio = headCount && headCountKv ? headCountKv / headCount : 1
  const kvDim = embeddingLength * gqaRatio
  return 2 * blockCount * kvDim * KV_BYTES_PER_ELEMENT
}

export function roundDownToGranularity(tokens: number): number {
  return Math.floor(tokens / CONTEXT_GRANULARITY) * CONTEXT_GRANULARITY
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
  const fullyOffloaded = input.fullyOffloaded === true

  let budgetBytes: number
  if (usesDiscreteVram) {
    const vramBudget =
      (input.freeVramBytes as number) - VRAM_RESERVE_BYTES - (fullyOffloaded ? input.modelBytes : 0)
    const ramBudget =
      input.availableBytes - RAM_RESERVE_BYTES - (fullyOffloaded ? 0 : input.modelBytes)
    budgetBytes = Math.min(vramBudget, Math.max(ramBudget, 0))
  } else {
    budgetBytes = input.availableBytes - RAM_RESERVE_BYTES - input.modelBytes
  }

  if (budgetBytes <= 0) {
    return { contextSize: MIN_CONTEXT_SIZE, cappedByMemory: true }
  }

  const affordable = roundDownToGranularity(budgetBytes / (perToken * slots))
  const contextSize = Math.max(MIN_CONTEXT_SIZE, Math.min(target, affordable))

  return { contextSize, cappedByMemory: contextSize < target }
}

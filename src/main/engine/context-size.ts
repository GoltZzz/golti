import fs from 'fs'
import os from 'os'
import { readGgufModelInfo } from './gguf'
import { getAvailableMemoryBytes } from '../system/memory'

export const MIN_CONTEXT_SIZE = 4096
export const MAX_CONTEXT_SIZE = 32768
const STABLE_RAM_FRACTION = 0.5
export const CONTEXT_GRANULARITY = 1024

const KV_BYTES_PER_ELEMENT = 2
const RAM_RESERVE_GB = 1.5
const VRAM_RESERVE_GB = 0.75
const GB = 1024 * 1024 * 1024

export interface ContextSizeInput {
  modelPath: string
  gpuLayers: number
  freeVramGB?: number
}

export interface ContextSizeResult {
  contextSize: number
  trainedContextSize?: number
  cappedByMemory: boolean
}

/**
 * KV cache bytes per token for the *whole* model (all layers).
 *
 * Exported because GPU layer sizing needs the same figure: on a partial offload
 * the KV cache splits between VRAM and RAM along the same layer boundary as the
 * weights, so both calculations must agree on the per-layer cost.
 */
export function kvBytesPerToken(
  blockCount?: number,
  embeddingLength?: number,
  headCount?: number,
  headCountKv?: number
): number | undefined {
  if (!blockCount || !embeddingLength) return undefined
  const gqaRatio = headCount && headCountKv ? headCountKv / headCount : 1
  const kvDim = embeddingLength * gqaRatio
  return 2 * blockCount * kvDim * KV_BYTES_PER_ELEMENT
}

/**
 * Share of the model resident on the GPU. Weights and KV cache both split at
 * this ratio, so it is the one number that turns a layer count into VRAM cost.
 */
export function gpuLayerFraction(gpuLayers: number, blockCount?: number): number {
  if (gpuLayers === -1) return 1
  if (gpuLayers <= 0) return 0
  if (!blockCount) return 1
  return Math.min(1, gpuLayers / blockCount)
}

function roundDownToGranularity(tokens: number): number {
  return Math.floor(tokens / CONTEXT_GRANULARITY) * CONTEXT_GRANULARITY
}

export async function computeContextSize(input: ContextSizeInput): Promise<ContextSizeResult> {
  const info = readGgufModelInfo(input.modelPath)
  const trained = info?.contextLength

  if (!trained) {
    return { contextSize: MIN_CONTEXT_SIZE, trainedContextSize: undefined, cappedByMemory: false }
  }

  const target = Math.min(trained, MAX_CONTEXT_SIZE)
  const perToken = kvBytesPerToken(info?.blockCount, info?.embeddingLength, info?.headCount, info?.headCountKv)
  if (!perToken) {
    return { contextSize: Math.max(MIN_CONTEXT_SIZE, Math.min(target, 8192)), trainedContextSize: trained, cappedByMemory: true }
  }

  let modelBytes = 0
  try {
    modelBytes = fs.statSync(input.modelPath).size
  } catch {
    modelBytes = 0
  }

  const availableBytes = Math.max(await getAvailableMemoryBytes(), os.totalmem() * STABLE_RAM_FRACTION)
  const usesDiscreteVram = input.freeVramGB !== undefined && input.gpuLayers !== 0

  // Weights and KV cache both split at the offload boundary. Charging VRAM for
  // the whole model's KV while ignoring the weights already sitting there (or
  // vice versa) is what previously let a partial offload overcommit the card.
  const gpuFraction = usesDiscreteVram ? gpuLayerFraction(input.gpuLayers, info?.blockCount) : 0
  const cpuFraction = 1 - gpuFraction

  let affordableTokens: number
  if (usesDiscreteVram) {
    const vramBudget =
      (input.freeVramGB as number) * GB - VRAM_RESERVE_GB * GB - modelBytes * gpuFraction
    const ramBudget = availableBytes - RAM_RESERVE_GB * GB - modelBytes * cpuFraction
    if (vramBudget <= 0 || ramBudget <= 0) {
      return { contextSize: MIN_CONTEXT_SIZE, trainedContextSize: trained, cappedByMemory: true }
    }
    // Each side only pays for the KV of the layers it actually holds.
    const vramTokens = gpuFraction > 0 ? vramBudget / (perToken * gpuFraction) : Infinity
    const ramTokens = cpuFraction > 0 ? ramBudget / (perToken * cpuFraction) : Infinity
    affordableTokens = Math.min(vramTokens, ramTokens)
  } else {
    const budgetBytes = availableBytes - RAM_RESERVE_GB * GB - modelBytes
    if (budgetBytes <= 0) {
      return { contextSize: MIN_CONTEXT_SIZE, trainedContextSize: trained, cappedByMemory: true }
    }
    affordableTokens = budgetBytes / perToken
  }

  const affordable = roundDownToGranularity(affordableTokens)
  const contextSize = Math.max(MIN_CONTEXT_SIZE, Math.min(target, affordable))

  return {
    contextSize,
    trainedContextSize: trained,
    cappedByMemory: contextSize < target
  }
}

export function reduceContextSize(current: number): number {
  return Math.max(MIN_CONTEXT_SIZE, roundDownToGranularity(current / 2))
}

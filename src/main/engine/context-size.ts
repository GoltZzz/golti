import fs from 'fs'
import os from 'os'
import { readGgufModelInfo } from './gguf'
import { getAvailableMemoryBytes } from '../system/memory'
import {
  computeContextBudget,
  kvBytesPerToken,
  roundDownToGranularity,
  MIN_CONTEXT_SIZE,
  MAX_CONTEXT_SIZE,
  CONTEXT_GRANULARITY
} from '../../shared/context-budget'

export { MIN_CONTEXT_SIZE, MAX_CONTEXT_SIZE, CONTEXT_GRANULARITY }

const STABLE_RAM_FRACTION = 0.5
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

export async function computeContextSize(input: ContextSizeInput): Promise<ContextSizeResult> {
  const info = readGgufModelInfo(input.modelPath)
  const trained = info?.contextLength

  let modelBytes = 0
  try {
    modelBytes = fs.statSync(input.modelPath).size
  } catch {
    modelBytes = 0
  }

  const availableBytes = Math.max(await getAvailableMemoryBytes(), os.totalmem() * STABLE_RAM_FRACTION)
  const usesDiscreteVram = input.freeVramGB !== undefined && input.gpuLayers !== 0

  const budget = computeContextBudget({
    trainedContextSize: trained,
    perTokenBytes: kvBytesPerToken({
      blockCount: info?.blockCount,
      embeddingLength: info?.embeddingLength,
      headCount: info?.headCount,
      headCountKv: info?.headCountKv
    }),
    modelBytes,
    availableBytes,
    freeVramBytes: usesDiscreteVram ? (input.freeVramGB as number) * GB : undefined,
    fullyOffloaded: input.gpuLayers === -1,
    // A partial offload only puts its own layers' weights and KV in VRAM.
    gpuLayers: input.gpuLayers,
    layerCount: info?.blockCount
  })

  return {
    contextSize: budget.contextSize,
    trainedContextSize: trained,
    cappedByMemory: budget.cappedByMemory
  }
}

export function reduceContextSize(current: number): number {
  return Math.max(MIN_CONTEXT_SIZE, roundDownToGranularity(current / 2))
}

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

function kvBytesPerToken(
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
  const fullyOffloaded = input.gpuLayers === -1
  const usesDiscreteVram = input.freeVramGB !== undefined && input.gpuLayers !== 0

  let budgetBytes: number
  if (usesDiscreteVram) {
    const vramBudget = (input.freeVramGB as number) * GB - VRAM_RESERVE_GB * GB - (fullyOffloaded ? modelBytes : 0)
    const ramBudget = availableBytes - RAM_RESERVE_GB * GB - (fullyOffloaded ? 0 : modelBytes)
    budgetBytes = Math.min(vramBudget, Math.max(ramBudget, 0))
  } else {
    budgetBytes = availableBytes - RAM_RESERVE_GB * GB - modelBytes
  }

  if (budgetBytes <= 0) {
    return { contextSize: MIN_CONTEXT_SIZE, trainedContextSize: trained, cappedByMemory: true }
  }

  const affordable = roundDownToGranularity(budgetBytes / perToken)
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

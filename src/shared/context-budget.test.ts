import { describe, it, expect } from 'vitest'
import {
  computeContextBudget,
  kvBytesPerToken,
  MIN_CONTEXT_SIZE,
  MAX_CONTEXT_SIZE,
  UNKNOWN_SHAPE_CONTEXT_CAP
} from './context-budget'

const GB = 1024 * 1024 * 1024

const llama32_3b = {
  blockCount: 28,
  embeddingLength: 3072,
  headCount: 24,
  headCountKv: 8
}

describe('kvBytesPerToken', () => {
  it('accounts for grouped-query attention', () => {
    expect(kvBytesPerToken(llama32_3b)).toBe(2 * 28 * (3072 * (8 / 24)) * 2)
  })

  it('assumes no GQA when head counts are missing', () => {
    expect(kvBytesPerToken({ blockCount: 28, embeddingLength: 3072 })).toBe(2 * 28 * 3072 * 2)
  })

  it('returns undefined when the shape is unknown', () => {
    expect(kvBytesPerToken({})).toBeUndefined()
    expect(kvBytesPerToken({ blockCount: 28 })).toBeUndefined()
  })
})

describe('computeContextBudget', () => {
  const perTokenBytes = kvBytesPerToken(llama32_3b) as number

  it('grants the full target when memory is plentiful', () => {
    const result = computeContextBudget({
      trainedContextSize: 131072,
      perTokenBytes,
      modelBytes: 2 * GB,
      availableBytes: 64 * GB
    })
    expect(result.contextSize).toBe(MAX_CONTEXT_SIZE)
    expect(result.cappedByMemory).toBe(false)
  })

  it('shrinks the context on a tight machine instead of taking the full target', () => {
    const result = computeContextBudget({
      trainedContextSize: 131072,
      perTokenBytes,
      modelBytes: 2 * GB,
      availableBytes: 5 * GB
    })
    expect(result.contextSize).toBeLessThan(MAX_CONTEXT_SIZE)
    expect(result.contextSize).toBeGreaterThanOrEqual(MIN_CONTEXT_SIZE)
    expect(result.cappedByMemory).toBe(true)
  })

  it('never returns less than the floor even with no memory left', () => {
    const result = computeContextBudget({
      trainedContextSize: 131072,
      perTokenBytes,
      modelBytes: 30 * GB,
      availableBytes: 4 * GB
    })
    expect(result.contextSize).toBe(MIN_CONTEXT_SIZE)
    expect(result.cappedByMemory).toBe(true)
  })

  it('never exceeds what the model was trained for', () => {
    const result = computeContextBudget({
      trainedContextSize: 8192,
      perTokenBytes,
      modelBytes: 2 * GB,
      availableBytes: 64 * GB
    })
    expect(result.contextSize).toBe(8192)
  })

  it('halves the affordable context when two parallel slots are reserved', () => {
    const base = {
      trainedContextSize: 131072,
      perTokenBytes,
      modelBytes: 2 * GB,
      availableBytes: 6 * GB
    }
    const one = computeContextBudget({ ...base, parallelSlots: 1 })
    const two = computeContextBudget({ ...base, parallelSlots: 2 })
    expect(two.contextSize).toBeLessThan(one.contextSize)
  })

  it('falls back to a conservative cap when the shape is unknown', () => {
    const result = computeContextBudget({
      trainedContextSize: 131072,
      perTokenBytes: undefined,
      modelBytes: 2 * GB,
      availableBytes: 64 * GB
    })
    expect(result.contextSize).toBe(UNKNOWN_SHAPE_CONTEXT_CAP)
    expect(result.cappedByMemory).toBe(true)
  })

  it('returns the floor when the trained context is unknown', () => {
    const result = computeContextBudget({
      trainedContextSize: undefined,
      perTokenBytes,
      modelBytes: 2 * GB,
      availableBytes: 64 * GB
    })
    expect(result.contextSize).toBe(MIN_CONTEXT_SIZE)
    expect(result.cappedByMemory).toBe(false)
  })

  it('is limited by VRAM when the model is fully offloaded to a discrete GPU', () => {
    const result = computeContextBudget({
      trainedContextSize: 131072,
      perTokenBytes,
      modelBytes: 2 * GB,
      availableBytes: 64 * GB,
      freeVramBytes: 6 * GB,
      fullyOffloaded: true
    })
    expect(result.contextSize).toBeLessThan(MAX_CONTEXT_SIZE)
  })
})

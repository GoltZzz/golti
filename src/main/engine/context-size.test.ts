import { describe, expect, it } from 'vitest'
import { gpuLayerFraction, kvBytesPerToken } from './context-size'

describe('kvBytesPerToken', () => {
  it('accounts for grouped-query attention shrinking the KV dimension', () => {
    // DeepSeek-R1-Distill-Qwen-14B: 48 blocks, 5120 embedding, 40 heads, 8 KV heads.
    // kvDim = 5120 * 8/40 = 1024 → 2 * 48 * 1024 * 2 bytes = 192 KiB per token.
    expect(kvBytesPerToken(48, 5120, 40, 8)).toBe(196608)
  })

  it('falls back to full attention when head counts are unknown', () => {
    expect(kvBytesPerToken(48, 5120)).toBe(2 * 48 * 5120 * 2)
  })

  it('returns undefined when the geometry is unreadable', () => {
    expect(kvBytesPerToken(undefined, 5120, 40, 8)).toBeUndefined()
    expect(kvBytesPerToken(48, undefined, 40, 8)).toBeUndefined()
  })
})

describe('gpuLayerFraction', () => {
  it('treats -1 as the whole model', () => {
    expect(gpuLayerFraction(-1, 48)).toBe(1)
  })

  it('treats 0 as nothing on the GPU', () => {
    expect(gpuLayerFraction(0, 48)).toBe(0)
  })

  it('reports the real share for a partial offload', () => {
    expect(gpuLayerFraction(16, 48)).toBeCloseTo(1 / 3, 5)
  })

  it('never exceeds the whole model, even if asked for more layers than exist', () => {
    expect(gpuLayerFraction(99, 48)).toBe(1)
  })

  it('assumes a full offload when the layer count is unknown', () => {
    expect(gpuLayerFraction(16, undefined)).toBe(1)
  })
})

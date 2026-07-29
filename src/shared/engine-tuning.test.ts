import { describe, expect, it } from 'vitest'
import {
  buildTuningArgs,
  chooseThreadCount,
  computeOffloadLayers,
  isUnsupportedArgFailure,
  reduceOffloadLayers
} from './engine-tuning'

const GB = 1024 * 1024 * 1024

describe('computeOffloadLayers', () => {
  it('offloads everything when the model fits with headroom', () => {
    expect(computeOffloadLayers({ modelBytes: 4 * GB, vramBytes: 12 * GB, layerCount: 32 })).toBe(-1)
  })

  it('stays on the CPU when there is no usable VRAM left', () => {
    expect(computeOffloadLayers({ modelBytes: 8 * GB, vramBytes: 1 * GB, layerCount: 32 })).toBe(0)
  })

  it('scales the partial count with the real layer count', () => {
    const input = { modelBytes: 16 * GB, vramBytes: 8 * GB }
    const wide = computeOffloadLayers({ ...input, layerCount: 80 })
    const narrow = computeOffloadLayers({ ...input, layerCount: 32 })
    expect(wide).toBeGreaterThan(narrow)
    expect(wide).toBeLessThan(80)
    expect(narrow).toBeLessThan(32)
  })

  it('reserves room for the KV cache', () => {
    const base = { modelBytes: 16 * GB, vramBytes: 8 * GB, layerCount: 32 }
    expect(computeOffloadLayers({ ...base, kvBytesPerToken: 262144 })).toBeLessThan(
      computeOffloadLayers(base)
    )
  })

  it('falls back to full offload when VRAM is unknown', () => {
    expect(computeOffloadLayers({ modelBytes: 4 * GB })).toBe(-1)
  })
})

describe('reduceOffloadLayers', () => {
  it('halves a full offload against the real layer count', () => {
    expect(reduceOffloadLayers(-1, 80)).toBe(40)
    expect(reduceOffloadLayers(-1)).toBe(16)
  })

  it('steps down by a quarter, since sizing now lands near the real limit', () => {
    expect(reduceOffloadLayers(20, 80)).toBe(15)
    expect(reduceOffloadLayers(1, 80)).toBe(0)
  })

  it('always reaches CPU rather than stalling above zero', () => {
    let layers = 48
    for (let i = 0; i < 100 && layers > 0; i++) {
      const next = reduceOffloadLayers(layers, 48)
      expect(next).toBeLessThan(layers)
      layers = next
    }
    expect(layers).toBe(0)
  })
})

describe('chooseThreadCount', () => {
  it('prefers performance cores over efficiency cores', () => {
    expect(chooseThreadCount({ logicalCores: 10, physicalCores: 10, performanceCores: 4 })).toBe(4)
  })

  it('prefers physical cores over hyperthreads', () => {
    expect(chooseThreadCount({ logicalCores: 16, physicalCores: 8 })).toBe(8)
  })

  it('halves the logical count when topology is unknown', () => {
    expect(chooseThreadCount({ logicalCores: 12 })).toBe(6)
  })

  it('never returns less than one', () => {
    expect(chooseThreadCount({ logicalCores: 1 })).toBe(1)
  })

  it('caps very wide machines', () => {
    expect(chooseThreadCount({ logicalCores: 128, physicalCores: 64 })).toBe(16)
  })
})

describe('buildTuningArgs', () => {
  it('quantizes the KV cache when offloading to a GPU', () => {
    const args = buildTuningArgs({ gpuLayers: -1, threads: 8 })
    expect(args).toEqual([
      '--threads', '8',
      '--flash-attn', 'on',
      '--cache-type-k', 'q8_0',
      '--cache-type-v', 'q8_0'
    ])
  })

  it('leaves the CPU cache unquantized', () => {
    expect(buildTuningArgs({ gpuLayers: 0, threads: 4 })).toEqual([
      '--threads', '4',
      '--flash-attn', 'auto'
    ])
  })

  it('returns nothing when disabled', () => {
    expect(buildTuningArgs({ gpuLayers: -1, threads: 8, enabled: false })).toEqual([])
  })
})

describe('isUnsupportedArgFailure', () => {
  it('recognizes a rejected flag', () => {
    expect(isUnsupportedArgFailure('error: invalid argument: --cache-type-k')).toBe(true)
  })

  it('ignores an out-of-memory failure', () => {
    expect(isUnsupportedArgFailure('ggml_vulkan: device memory allocation failed')).toBe(false)
  })
})

describe('computeOffloadLayers KV accounting', () => {
  const GB = 1024 * 1024 * 1024
  /** DeepSeek-R1-Distill-Qwen-14B: 48 blocks, 192 KiB of KV per token. */
  const QWEN_14B = { modelBytes: 8.37 * GB, layerCount: 48, kvBytesPerToken: 196608 }

  it('charges KV per offloaded layer, not for the whole model up front', () => {
    // A GTX 1650 with 3.83 GB free. Reserving all 48 layers' KV as a flat block
    // while offloading a third of them leaves far too little for weights.
    const layers = computeOffloadLayers({ ...QWEN_14B, vramBytes: 3.83 * GB })
    const flatKvReserve = Math.floor(
      (3.83 * GB - 0.9 * GB - 196608 * 4096) / (QWEN_14B.modelBytes / 48)
    )
    expect(layers).toBeGreaterThan(flatKvReserve)
  })

  it('keeps the offload inside what VRAM can actually hold', () => {
    const vramBytes = 3.83 * GB
    const layers = computeOffloadLayers({ ...QWEN_14B, vramBytes })
    const weights = (QWEN_14B.modelBytes / 48) * layers
    const kv = (196608 / 48) * 4096 * layers
    expect(weights + kv).toBeLessThanOrEqual(vramBytes - 0.9 * GB)
  })

  it('still refuses a GPU that cannot hold a useful share', () => {
    expect(computeOffloadLayers({ ...QWEN_14B, vramBytes: 1 * GB })).toBe(0)
  })

  it('offloads everything only when the KV fits alongside the weights', () => {
    expect(computeOffloadLayers({ ...QWEN_14B, vramBytes: 24 * GB })).toBe(-1)
    // Enough room for the weights alone, but not once KV is counted.
    const tight = computeOffloadLayers({ ...QWEN_14B, vramBytes: 9.5 * GB })
    expect(tight).not.toBe(-1)
  })
})

import { describe, expect, it } from 'vitest'
import { describeOffload, describeVramContention, estimateOffload } from './gpu-offload'
import type { CookbookModel, SystemInfoFull } from './types'

const GB = 1024 ** 3

function system(vramGB: number | null, isAppleSilicon = false): SystemInfoFull {
  return {
    platform: 'linux',
    arch: 'x64',
    cpu: { model: 'AMD Ryzen 7 3750H', cores: 4, threads: 8, speedGHz: 2.3 },
    ram: { totalGB: 29, freeGB: 17, usedPercent: 41 },
    gpu: { name: 'NVIDIA GeForce GTX 1650', vramGB, isAppleSilicon },
    disk: { readMBps: 500, writeMBps: 400, freeGB: 200, totalGB: 500 },
    thermals: { cpuTempC: 48 }
  } as SystemInfoFull
}

function model(overrides: Partial<CookbookModel> = {}): CookbookModel {
  return {
    id: 'test',
    name: 'Test',
    family: 'llama',
    parameterBillions: 14,
    sizeTier: 'large',
    quantization: 'Q4_K_M',
    useCases: ['chat'],
    ramRequiredGB: 9,
    ramRecommendedGB: 12,
    diskSizeGB: 8.37,
    ollamaTag: 'test',
    description: '',
    highlights: [],
    ...overrides
  } as CookbookModel
}

/** Real geometry read from the user's GGUF files. */
const QWEN_14B = {
  blockCount: 48,
  embeddingLength: 5120,
  headCount: 40,
  headCountKv: 8,
  fileSizeBytes: 8.37 * GB
}
const QWEN_7B = {
  blockCount: 28,
  embeddingLength: 3584,
  headCount: 28,
  headCountKv: 4,
  fileSizeBytes: 4.36 * GB
}
const QWEN_4B = {
  blockCount: 32,
  embeddingLength: 2560,
  headCount: 32,
  headCountKv: 8,
  fileSizeBytes: 2.71 * GB
}

describe('estimateOffload on a 4 GB card', () => {
  const gtx1650 = system(4)

  it('warns that a 14B model mostly runs on CPU', () => {
    const result = estimateOffload(gtx1650, model(), QWEN_14B)
    expect(result.fit).toBe('partial')
    expect(result.fraction).toBeLessThan(0.5)
    expect(result.confidence).toBe('measured')
  })

  it('rates a 7B model as a larger partial offload', () => {
    const big = estimateOffload(gtx1650, model(), QWEN_14B)
    const small = estimateOffload(gtx1650, model({ diskSizeGB: 4.36 }), QWEN_7B)
    expect(small.fraction).toBeGreaterThan(big.fraction)
  })

  it('rates a 4B model as a full GPU run', () => {
    const result = estimateOffload(gtx1650, model({ parameterBillions: 4, diskSizeGB: 2.71 }), QWEN_4B)
    expect(result.fit).toBe('full')
    expect(result.fraction).toBe(1)
  })

  it('calls a model far beyond the card CPU-only', () => {
    const huge = { ...QWEN_14B, fileSizeBytes: 70 * GB }
    expect(estimateOffload(gtx1650, model({ diskSizeGB: 70 }), huge).fit).toBe('cpu_only')
  })
})

describe('estimateOffload confidence', () => {
  it('is estimated for a model that is not downloaded yet', () => {
    expect(estimateOffload(system(4), model()).confidence).toBe('estimated')
  })

  it('is measured once the GGUF geometry is known', () => {
    expect(estimateOffload(system(4), model(), QWEN_14B).confidence).toBe('measured')
  })

  it('prefers the real file size over the catalog estimate', () => {
    const catalogSaysSmall = model({ diskSizeGB: 1 })
    const actuallyLarge = estimateOffload(system(4), catalogSaysSmall, QWEN_14B)
    const fromCatalog = estimateOffload(system(4), catalogSaysSmall)
    expect(actuallyLarge.fraction).toBeLessThan(fromCatalog.fraction)
  })
})

describe('estimateOffload edge cases', () => {
  it('reports unified memory rather than an offload warning on Apple Silicon', () => {
    expect(estimateOffload(system(null, true), model()).fit).toBe('unified')
  })

  it('reports CPU-only when there is no dedicated VRAM', () => {
    expect(estimateOffload(system(null), model()).fit).toBe('cpu_only')
  })

  it('declines to guess when the hardware is unknown', () => {
    expect(estimateOffload(null, model()).fit).toBe('unknown')
  })

  it('treats a GPU smaller than its own overhead as CPU-only', () => {
    expect(estimateOffload(system(0.5), model()).fit).toBe('cpu_only')
  })
})

describe('describeOffload', () => {
  it('says nothing when the whole model fits', () => {
    const result = describeOffload(system(24), model({ parameterBillions: 4, diskSizeGB: 2.71 }), QWEN_4B)
    expect(result).toBeNull()
  })

  it('says nothing on unified memory or unknown hardware', () => {
    expect(describeOffload(system(null, true), model())).toBeNull()
    expect(describeOffload(null, model())).toBeNull()
  })

  it('names the share and the consequence for a partial offload', () => {
    const note = describeOffload(system(4), model(), QWEN_14B)
    expect(note).toMatch(/%/)
    expect(note).toContain('CPU')
    expect(note).toContain('4 GB GPU')
  })

  it('hedges an estimate but not a measurement', () => {
    expect(describeOffload(system(4), model())).toContain('~')
    expect(describeOffload(system(4), model(), QWEN_14B)).not.toContain('~')
  })

  it('warns plainly when nothing meaningful fits', () => {
    const note = describeOffload(system(4), model({ diskSizeGB: 70 }), {
      ...QWEN_14B,
      fileSizeBytes: 70 * GB
    })
    expect(note).toContain('Too large')
  })
})

describe('describeVramContention', () => {
  it('reports what other things are holding', () => {
    const note = describeVramContention({
      index: '0',
      name: 'GTX 1650',
      totalMiB: 4096,
      usedMiB: 2150,
      freeMiB: 1946
    })
    expect(note).toContain('2.1 GB')
    expect(note).toContain('4.0 GB')
  })

  it('stays quiet on an idle card', () => {
    expect(
      describeVramContention({ index: '0', name: 'GTX 1650', totalMiB: 4096, usedMiB: 33, freeMiB: 4063 })
    ).toBeNull()
  })

  it('stays quiet when there is no reading', () => {
    expect(describeVramContention(null)).toBeNull()
  })
})

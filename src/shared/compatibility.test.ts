import { describe, it, expect } from 'vitest'
import {
  getCompatibility,
  getMemoryPressure,
  getRuntimeFit,
  estimateRuntimeGB,
  getUsableMemoryGB,
  getDiskFit,
  describeDiskFit,
  estimateDownloadSizeGB
} from './compatibility'
import { SystemInfoFull, CookbookModel } from './types'

function makeSystem(overrides: {
  totalGB?: number
  usedPercent?: number
  isAppleSilicon?: boolean
  vramGB?: number | null
  freeDiskGB?: number | null
} = {}): SystemInfoFull {
  const totalGB = overrides.totalGB ?? 16
  const usedPercent = overrides.usedPercent ?? 30
  return {
    platform: 'darwin',
    arch: 'arm64',
    cpu: { model: 'Apple M2', cores: 8, threads: 8, speedGHz: 3.5 },
    ram: {
      totalGB,
      freeGB: totalGB * (1 - usedPercent / 100),
      usedPercent
    },
    gpu: {
      name: 'Apple M2 GPU',
      vramGB: overrides.vramGB ?? null,
      isAppleSilicon: overrides.isAppleSilicon ?? true
    },
    disk: {
      readMBps: 2000,
      writeMBps: 1500,
      freeGB: overrides.freeDiskGB === undefined ? 500 : overrides.freeDiskGB,
      totalGB: 1000
    },
    thermals: { cpuTempC: null }
  }
}

function makeModel(overrides: Partial<CookbookModel> = {}): CookbookModel {
  return {
    id: 'test:7b',
    name: 'Test 7B',
    family: 'llama',
    parameterBillions: 7,
    sizeTier: 'medium',
    quantization: 'Q4_K_M',
    useCases: ['chat'],
    ramRequiredGB: 5,
    ramRecommendedGB: 8,
    diskSizeGB: 4,
    ollamaTag: 'test:7b',
    description: 'test',
    highlights: [],
    ...overrides
  } as CookbookModel
}

describe('getCompatibility', () => {
  it('returns the same rating regardless of how much memory is in use', () => {
    const model = makeModel()
    const idle = getCompatibility(makeSystem({ usedPercent: 20 }), model)
    const modelLoaded = getCompatibility(makeSystem({ usedPercent: 75 }), model)

    expect(modelLoaded).toBe(idle)
  })

  it('does not degrade when the machine is nearly full', () => {
    const model = makeModel()
    expect(getCompatibility(makeSystem({ usedPercent: 95 }), model)).toBe('great')
  })

  it('budgets for the attention cache on top of model weights', () => {
    const model = makeModel({ parameterBillions: 30, ramRequiredGB: 5, ramRecommendedGB: 8 })
    expect(estimateRuntimeGB(model)).toBeGreaterThan(model.ramRequiredGB)
  })

  it('leaves headroom for the OS rather than promising 75% of total RAM', () => {
    const usable = getUsableMemoryGB(makeSystem({ totalGB: 8 }))
    expect(usable).toBeLessThan(8 * 0.75)
  })

  it('rejects models that exceed the machine outright', () => {
    const huge = makeModel({ ramRequiredGB: 40, ramRecommendedGB: 48, parameterBillions: 70 })
    expect(getCompatibility(makeSystem({ totalGB: 16 }), huge)).toBe('wont_fit')
  })

  it('uses dedicated VRAM when the model fits inside it', () => {
    const system = makeSystem({ totalGB: 16, isAppleSilicon: false, vramGB: 12 })
    expect(getUsableMemoryGB(system, 6)).toBeCloseTo(11.2, 5)
  })

  it('falls back to system RAM when the model exceeds VRAM', () => {
    const system = makeSystem({ totalGB: 32, isAppleSilicon: false, vramGB: 4 })
    expect(getUsableMemoryGB(system, 20)).toBeGreaterThan(4)
  })

  it('assumes it runs when hardware is unknown', () => {
    expect(getCompatibility(null, makeModel())).toBe('runs')
  })
})

describe('getMemoryPressure', () => {
  it('reports an idle machine as ok', () => {
    expect(getMemoryPressure(makeSystem({ usedPercent: 30 })).level).toBe('ok')
  })

  it('reports a loaded machine as critical', () => {
    expect(getMemoryPressure(makeSystem({ usedPercent: 92 })).level).toBe('critical')
  })

  it('discounts memory held by a model the user deliberately started', () => {
    const system = makeSystem({ totalGB: 16, usedPercent: 80 })
    const withoutModel = getMemoryPressure(system)
    const withModel = getMemoryPressure(system, 6)

    expect(withoutModel.level).toBe('busy')
    expect(withModel.level).toBe('ok')
    expect(withModel.availableGB).toBeGreaterThan(withoutModel.availableGB)
  })
})

describe('getRuntimeFit', () => {
  it('separates "fits this machine" from "fits right now"', () => {
    const model = makeModel()
    const busy = makeSystem({ totalGB: 16, usedPercent: 90 })

    expect(getCompatibility(busy, model)).toBe('great')
    expect(getRuntimeFit(busy, model)).toBe('no_room')
  })

  it('is comfortable on an idle machine', () => {
    expect(getRuntimeFit(makeSystem({ usedPercent: 20 }), makeModel())).toBe('comfortable')
  })
})

describe('getDiskFit', () => {
  it('is ok when the model fits with headroom to spare', () => {
    expect(getDiskFit(makeSystem({ freeDiskGB: 100 }), makeModel({ diskSizeGB: 4 }))).toBe('ok')
  })

  it('is tight when the download would leave almost nothing free', () => {
    expect(getDiskFit(makeSystem({ freeDiskGB: 5 }), makeModel({ diskSizeGB: 4 }))).toBe('tight')
  })

  it('is insufficient when the model is larger than the free space', () => {
    expect(getDiskFit(makeSystem({ freeDiskGB: 3 }), makeModel({ diskSizeGB: 40 }))).toBe(
      'insufficient'
    )
  })

  it('is unknown when free space could not be probed', () => {
    expect(getDiskFit(makeSystem({ freeDiskGB: null }), makeModel())).toBe('unknown')
    expect(getDiskFit(null, makeModel())).toBe('unknown')
  })

  it('prefers the exact GGUF file size over the catalog estimate', () => {
    const model = makeModel({ diskSizeGB: 4, ggufFileSize: 40 * 1024 ** 3 })
    expect(estimateDownloadSizeGB(model)).toBeCloseTo(40, 5)
    expect(getDiskFit(makeSystem({ freeDiskGB: 20 }), model)).toBe('insufficient')
  })
})

describe('describeDiskFit', () => {
  it('says nothing when there is room', () => {
    expect(describeDiskFit(makeSystem({ freeDiskGB: 500 }), makeModel())).toBeNull()
    expect(describeDiskFit(makeSystem({ freeDiskGB: null }), makeModel())).toBeNull()
  })

  it('reports both the requirement and what is actually free', () => {
    const note = describeDiskFit(makeSystem({ freeDiskGB: 3 }), makeModel({ diskSizeGB: 40 }))
    expect(note).toContain('40.0 GB')
    expect(note).toContain('3.0 GB')
  })
})

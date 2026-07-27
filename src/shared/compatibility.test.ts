import { describe, expect, it } from 'vitest'
import { getCompatibility, getRuntimeVramUsage, getVramUsage } from './compatibility'
import type { CookbookModel, SystemInfoFull } from './types'

const GB = 1024 ** 3

function system(overrides: {
  vramGB?: number | null
  totalRamGB?: number
  usedPercent?: number
  isAppleSilicon?: boolean
}): SystemInfoFull {
  return {
    platform: 'linux',
    arch: 'x64',
    cpu: { model: 'Test CPU', cores: 8, threads: 16, speedGHz: 3.5 },
    ram: {
      totalGB: overrides.totalRamGB ?? 32,
      freeGB: 16,
      usedPercent: overrides.usedPercent ?? 30
    },
    gpu: {
      name: 'Test GPU',
      vramGB: overrides.vramGB === undefined ? 16 : overrides.vramGB,
      isAppleSilicon: overrides.isAppleSilicon ?? false
    },
    disk: { readMBps: null, writeMBps: null },
    thermals: { cpuTempC: null }
  }
}

const model = (requiredGB: number, recommendedGB: number) =>
  ({ ramRequiredGB: requiredGB, ramRecommendedGB: recommendedGB }) as CookbookModel

describe('getRuntimeVramUsage', () => {
  it('converts resident VRAM bytes to GB', () => {
    expect(getRuntimeVramUsage({ loaded: [], totalSizeBytes: 0, totalVramBytes: 8 * GB })).toEqual({
      usedGB: 8
    })
  })

  it('returns null when the runtime reading is unavailable', () => {
    expect(getRuntimeVramUsage(null)).toBeNull()
  })
})

describe('getVramUsage', () => {
  it('carries total alongside used so both come from the driver', () => {
    expect(getVramUsage({ totalMiB: 4096, usedMiB: 1024 })).toEqual({ usedGB: 1, totalGB: 4 })
  })

  it('returns null when there is no reading to use', () => {
    expect(getVramUsage(null)).toBeNull()
    expect(getVramUsage({ totalMiB: 0, usedMiB: 0 })).toBeNull()
  })

  it('prefers the driver total over the probed one when they disagree', () => {
    // The engine binary reports 4342 MiB (4.24 GB) for the same card nvidia-smi
    // calls 4096 MiB (4.0 GB). RAM is kept small so the VRAM figure decides.
    const sys = system({ vramGB: 4.24, totalRamGB: 5 })
    const target = model(4.1, 4.1)

    // Probed total: 4.24 GB clears the 4.1 GB requirement.
    expect(getCompatibility(sys, target, { usedGB: 0 })).toBe('runs')
    // Driver total: 4.0 GB does not, so it correctly drops a tier.
    const driver = getVramUsage({ totalMiB: 4096, usedMiB: 0 })!
    expect(getCompatibility(sys, target, driver)).toBe('tight')
  })
})

describe('getCompatibility with live VRAM', () => {
  it('is unchanged when no runtime reading is supplied', () => {
    expect(getCompatibility(system({ vramGB: 16 }), model(8, 12))).toBe('great')
    expect(getCompatibility(system({ vramGB: 16 }), model(8, 12), null)).toBe('great')
  })

  it('downgrades a model once another one occupies the GPU', () => {
    // System RAM is deliberately small here: with a large RAM budget the CPU
    // fallback absorbs the loss and the rating would not move at all.
    const sys = system({ vramGB: 16, totalRamGB: 16 })
    const target = model(10, 12)
    expect(getCompatibility(sys, target)).toBe('great')
    // 12 GB resident leaves 4 GB free, too little for a 10 GB model, and 70% of
    // 16 GB of system RAM cannot absorb it either.
    expect(getCompatibility(sys, target, { usedGB: 12 })).not.toBe('great')
  })

  it('falls back to the system-RAM budget when free VRAM runs out', () => {
    const sys = system({ vramGB: 16, totalRamGB: 64 })
    // 15 GB resident: the 8 GB model no longer fits in VRAM, so it is rated
    // against 70% of 64 GB rather than being written off.
    expect(getCompatibility(sys, model(8, 10), { usedGB: 15 })).toBe('great')
  })

  it('ignores GPU occupancy on Apple Silicon, which is scored on unified memory', () => {
    const sys = system({ isAppleSilicon: true, totalRamGB: 32, vramGB: null })
    expect(getCompatibility(sys, model(8, 12), { usedGB: 10 })).toBe(
      getCompatibility(sys, model(8, 12))
    )
  })

  it('never lets occupancy push free VRAM below zero', () => {
    const sys = system({ vramGB: 8, totalRamGB: 32 })
    expect(() => getCompatibility(sys, model(4, 6), { usedGB: 99 })).not.toThrow()
    expect(getCompatibility(sys, model(4, 6), { usedGB: 99 })).toBe('great')
  })

  it('still returns runs when no system info is available', () => {
    expect(getCompatibility(null, model(8, 12), { usedGB: 4 })).toBe('runs')
  })
})

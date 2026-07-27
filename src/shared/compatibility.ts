import { SystemInfoFull, CookbookModel, ModelCompatibility, MemoryPressure } from './types'

const APPLE_SILICON_ALLOC_CAP = 0.75
const OS_RESERVE_FRACTION = 0.28
const OS_RESERVE_MIN_GB = 3
const OS_RESERVE_MAX_GB = 10
const VRAM_DISPLAY_RESERVE_GB = 0.8

const KV_CACHE_GB_PER_PARAM_B = 0.06
const KV_CACHE_MIN_GB = 0.3
const KV_CACHE_MAX_GB = 3

const PRESSURE_BUSY_FREE_FRACTION = 0.35
const PRESSURE_CRITICAL_FREE_FRACTION = 0.15

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function osReserveGB(totalGB: number): number {
  return clamp(totalGB * OS_RESERVE_FRACTION, OS_RESERVE_MIN_GB, OS_RESERVE_MAX_GB)
}

/**
 * Working memory the model needs beyond its weights, for the attention cache that
 * grows with conversation length. The catalog's ramRequiredGB covers weights only.
 */
export function estimateKvCacheGB(model: CookbookModel): number {
  return clamp(model.parameterBillions * KV_CACHE_GB_PER_PARAM_B, KV_CACHE_MIN_GB, KV_CACHE_MAX_GB)
}

/** Total RAM this model needs while running: weights plus attention cache. */
export function estimateRuntimeGB(model: CookbookModel): number {
  return model.ramRequiredGB + estimateKvCacheGB(model)
}

/**
 * Memory this machine can realistically give a model. Depends only on installed
 * hardware, never on what happens to be running, so the answer is stable across scans.
 */
export function getUsableMemoryGB(system: SystemInfoFull, needGB = 0): number {
  const totalGB = system.ram.totalGB
  const systemBudget = totalGB - osReserveGB(totalGB)

  if (system.gpu?.isAppleSilicon) {
    return Math.max(0, Math.min(totalGB * APPLE_SILICON_ALLOC_CAP, systemBudget))
  }

  const vram = system.gpu?.vramGB || 0
  const usableVram = vram > 0 ? vram - VRAM_DISPLAY_RESERVE_GB : 0
  if (usableVram >= needGB && usableVram > 0) {
    return usableVram
  }

  return Math.max(0, systemBudget)
}

/**
 * Whether the model fits this machine at all. Static by design — downloading or
 * loading a model must not change its own rating.
 */
export function getCompatibility(system: SystemInfoFull | null, model: CookbookModel): ModelCompatibility {
  if (!system) return 'runs'

  const kvCacheGB = estimateKvCacheGB(model)
  const needGB = model.ramRequiredGB + kvCacheGB
  const wantGB = model.ramRecommendedGB + kvCacheGB
  const usableGB = getUsableMemoryGB(system, needGB)

  if (usableGB >= wantGB) return 'great'
  if (usableGB >= needGB) return 'runs'
  if (usableGB >= needGB * 0.85) return 'tight'
  return 'wont_fit'
}

/**
 * How busy memory is right now — a separate question from whether a model fits.
 * `loadedModelGB` is added back so a model the user deliberately started does not
 * make the machine look overloaded to itself.
 */
export function getMemoryPressure(
  system: SystemInfoFull | null,
  loadedModelGB = 0
): { level: MemoryPressure; availableGB: number; usedByOthersPercent: number } {
  if (!system) return { level: 'ok', availableGB: 0, usedByOthersPercent: 0 }

  const totalGB = system.ram.totalGB
  const usedPercent = clamp(system.ram.usedPercent, 0, 100)
  const freeGB = totalGB * (1 - usedPercent / 100)
  const availableGB = clamp(freeGB + Math.max(0, loadedModelGB), 0, totalGB)
  const freeFraction = totalGB > 0 ? availableGB / totalGB : 0

  const level: MemoryPressure =
    freeFraction >= PRESSURE_BUSY_FREE_FRACTION
      ? 'ok'
      : freeFraction >= PRESSURE_CRITICAL_FREE_FRACTION
        ? 'busy'
        : 'critical'

  return {
    level,
    availableGB,
    usedByOthersPercent: Math.round((1 - freeFraction) * 100)
  }
}

/**
 * Whether now is a good moment to start this model, given what else is running.
 * Distinct from getCompatibility, which answers whether it fits at all.
 */
export function getRuntimeFit(
  system: SystemInfoFull | null,
  model: CookbookModel,
  loadedModelGB = 0
): 'comfortable' | 'snug' | 'no_room' {
  if (!system) return 'comfortable'

  const needGB = estimateRuntimeGB(model)
  const { availableGB } = getMemoryPressure(system, loadedModelGB)

  if (availableGB >= needGB * 1.15) return 'comfortable'
  if (availableGB >= needGB) return 'snug'
  return 'no_room'
}

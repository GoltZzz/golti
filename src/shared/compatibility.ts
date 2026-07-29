import { SystemInfoFull, CookbookModel, ModelCompatibility, VramReading, MemoryPressure, DiskFit } from './types'

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
  loadedModelGB = 0,
  vram?: VramReading | null
): 'comfortable' | 'snug' | 'no_room' {
  if (!system) return 'comfortable'

  const needGB = estimateRuntimeGB(model)
  const { availableGB } = getMemoryPressure(system, loadedModelGB)

  // On a discrete GPU the card fills long before system RAM does, so a live
  // reading is the binding constraint. It counts every consumer — the engine,
  // the compositor, another app — which a static VRAM total cannot see.
  const vramFreeGB = getFreeVramGB(vram)
  if (vramFreeGB !== null && !system.gpu?.isAppleSilicon) {
    if (vramFreeGB >= needGB * 1.15 && availableGB >= needGB * 1.15) return 'comfortable'
    // The GPU is full but system RAM is not: it will still run, just on the CPU.
    if (availableGB >= needGB) return 'snug'
    return 'no_room'
  }

  if (availableGB >= needGB * 1.15) return 'comfortable'
  if (availableGB >= needGB) return 'snug'
  return 'no_room'
}

/**
 * Free VRAM in GB from a live driver reading, or null when it is unavailable.
 * Null means "unknown", never "nothing free" — callers must not treat it as 0.
 */
export function getFreeVramGB(vram?: VramReading | null): number | null {
  if (!vram || vram.totalMiB <= 0) return null
  return vram.freeMiB / 1024
}

/**
 * Bytes the download itself needs beyond the finished file: resumable downloads
 * write a partial alongside the target, and a volume with no slack left thrashes.
 */
const DISK_HEADROOM_GB = 2
const DISK_TIGHT_MULTIPLIER = 1.15

export function estimateDownloadSizeGB(model: CookbookModel): number {
  if (model.ggufFileSize && model.ggufFileSize > 0) {
    return model.ggufFileSize / 1024 ** 3
  }
  return model.diskSizeGB
}

/**
 * Whether this machine has room to store the model. Separate from getCompatibility:
 * a model can fit on disk and still be unrunnable, or run fine with nowhere to land.
 */
export function getDiskFit(system: SystemInfoFull | null, model: CookbookModel): DiskFit {
  const freeGB = system?.disk?.freeGB
  if (freeGB === null || freeGB === undefined) return 'unknown'

  const needGB = estimateDownloadSizeGB(model)
  if (freeGB >= needGB + DISK_HEADROOM_GB) return 'ok'
  if (freeGB >= needGB * DISK_TIGHT_MULTIPLIER) return 'tight'
  return 'insufficient'
}

export function describeDiskFit(system: SystemInfoFull | null, model: CookbookModel): string | null {
  const fit = getDiskFit(system, model)
  if (fit === 'ok' || fit === 'unknown') return null

  const freeGB = system?.disk?.freeGB ?? 0
  const needGB = estimateDownloadSizeGB(model)

  if (fit === 'insufficient') {
    return `Needs ~${needGB.toFixed(1)} GB but only ${freeGB.toFixed(1)} GB is free on this disk.`
  }
  return `Will leave under ${DISK_HEADROOM_GB} GB free (~${needGB.toFixed(1)} GB of ${freeGB.toFixed(1)} GB available).`
}

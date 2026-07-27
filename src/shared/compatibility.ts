import { SystemInfoFull, CookbookModel, ModelCompatibility, OllamaRuntimeInfo } from './types'

const BYTES_PER_GB = 1024 ** 3

/**
 * Live GPU occupancy, folded into the capacity maths below.
 *
 * Without this the cookbook rates every model against an *idle* GPU, so a card
 * already holding a 7B model still advertises its full VRAM.
 */
export interface RuntimeVramUsage {
  /** VRAM currently occupied, in GB. */
  usedGB: number
  /**
   * Total VRAM as reported by the same source as `usedGB`. When present it wins
   * over `system.gpu.vramGB`: the driver and the engine binary disagree slightly
   * on totals (reserved regions are counted differently), and mixing the two
   * produces a small permanent error in the free-VRAM figure.
   */
  totalGB?: number
}

/**
 * Preferred source: a driver-level reading, which counts *every* VRAM consumer
 * — our engine, Ollama (including one started outside Golti), the compositor,
 * anything else on the card.
 */
export function getVramUsage(
  reading: { totalMiB: number; usedMiB: number } | null
): RuntimeVramUsage | null {
  if (!reading || reading.totalMiB <= 0) return null
  return {
    usedGB: reading.usedMiB / 1024,
    totalGB: reading.totalMiB / 1024
  }
}

/**
 * Fallback source for when no driver tool is installed. Sees only what Ollama
 * itself loaded, so it under-reports whenever anything else holds VRAM.
 */
export function getRuntimeVramUsage(runtime: OllamaRuntimeInfo | null): RuntimeVramUsage | null {
  if (!runtime) return null
  return { usedGB: runtime.totalVramBytes / BYTES_PER_GB }
}

export function getCompatibility(
  system: SystemInfoFull | null,
  model: CookbookModel,
  runtimeVram?: RuntimeVramUsage | null
): ModelCompatibility {
  if (!system) return 'runs'

  // Calculate system total capacity limit for LLMs
  let totalCapacityLimit = 0

  if (system.gpu?.isAppleSilicon) {
    // Apple Silicon unified memory (macOS restricts single allocations to ~75% total RAM by default)
    totalCapacityLimit = system.ram.totalGB * 0.75
  } else {
    // Windows/Linux/Intel Mac. Anything already resident on the card is not
    // available to the model being rated, so score against what is left. Both
    // figures come from the same source when a live reading is available.
    const totalVram = runtimeVram?.totalGB ?? system.gpu?.vramGB ?? 0
    const vram = Math.max(0, totalVram - (runtimeVram?.usedGB || 0))
    if (vram > 0) {
      if (vram >= model.ramRequiredGB) {
        // Can fit completely in VRAM -> GPU inference
        totalCapacityLimit = vram
      } else {
        // Exceeds dedicated VRAM, falls back to CPU system RAM
        totalCapacityLimit = system.ram.totalGB * 0.70
      }
    } else {
      // Integrated graphics / CPU only
      totalCapacityLimit = system.ram.totalGB * 0.70
    }
  }

  // Real-time free memory estimation (unallocated RAM + 1.5 GB OS dynamic headroom)
  const currentFreeRAM = system.ram.totalGB * (1 - Math.min(100, Math.max(0, system.ram.usedPercent)) / 100)
  const realTimeHeadroom = system.gpu?.isAppleSilicon || !system.gpu?.vramGB
    ? Math.min(totalCapacityLimit, currentFreeRAM + 1.5)
    : totalCapacityLimit

  // Tiered compatibility rules
  if (totalCapacityLimit >= model.ramRecommendedGB && realTimeHeadroom >= model.ramRecommendedGB * 1.1) {
    return 'great'
  } else if (totalCapacityLimit >= model.ramRequiredGB && realTimeHeadroom >= model.ramRequiredGB) {
    return 'runs'
  } else if (totalCapacityLimit >= model.ramRequiredGB * 0.85) {
    return 'tight'
  } else {
    return 'wont_fit'
  }
}

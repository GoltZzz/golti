import { SystemInfoFull, CookbookModel, ModelCompatibility, OllamaRuntimeInfo } from './types'

const BYTES_PER_GB = 1024 ** 3

/**
 * Live GPU occupancy, folded into the capacity maths below.
 *
 * Without this the cookbook rates every model against an *idle* GPU, so a card
 * already holding a 7B model still advertises its full VRAM. `/api/ps` tells us
 * what is actually resident, which is the difference between a predicted fit
 * and a real one.
 */
export interface RuntimeVramUsage {
  /** VRAM currently occupied by loaded models, in GB. */
  usedGB: number
}

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
    // Windows/Linux/Intel Mac. Anything a resident model already holds is not
    // available to the model being rated, so score against what is left.
    const totalVram = system.gpu?.vramGB || 0
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

import { SystemInfoFull, CookbookModel, ModelCompatibility } from './types'

export function getCompatibility(system: SystemInfoFull | null, model: CookbookModel): ModelCompatibility {
  if (!system) return 'runs'

  // Calculate system total capacity limit for LLMs
  let totalCapacityLimit = 0

  if (system.gpu?.isAppleSilicon) {
    // Apple Silicon unified memory (macOS restricts single allocations to ~75% total RAM by default)
    totalCapacityLimit = system.ram.totalGB * 0.75
  } else {
    // Windows/Linux/Intel Mac
    const vram = system.gpu?.vramGB || 0
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

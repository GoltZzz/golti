import { SystemInfoFull, CookbookModel, ModelCompatibility } from './types'

export function getCompatibility(system: SystemInfoFull | null, model: CookbookModel): ModelCompatibility {
  if (!system) return 'runs'

  let availableMemory = 0

  if (system.gpu?.isAppleSilicon) {
    // Apple Silicon unified memory
    // Let's assume ~75% of total memory can be allocated for system / GPU model inference
    availableMemory = system.ram.totalGB * 0.75
  } else {
    // Windows/Linux/Intel Mac
    const vram = system.gpu?.vramGB || 0
    if (vram > 0) {
      if (vram >= model.ramRequiredGB) {
        // Can fit completely in VRAM -> GPU inference
        availableMemory = vram
      } else {
        // Doesn't fit in VRAM, will fall back to CPU/System RAM (much slower)
        availableMemory = system.ram.totalGB * 0.70
      }
    } else {
      // Integrated graphics / CPU only
      availableMemory = system.ram.totalGB * 0.70
    }
  }

  // Tiered compatibility rules
  if (availableMemory >= model.ramRecommendedGB * 1.2) {
    return 'great'
  } else if (availableMemory >= model.ramRequiredGB * 1.1) {
    return 'runs'
  } else if (availableMemory >= model.ramRequiredGB * 0.85) {
    return 'tight'
  } else {
    return 'wont_fit'
  }
}

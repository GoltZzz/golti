import type { CookbookModel, SystemInfoFull, VramReading } from './types'
import { kvBytesPerToken, KV_RESERVE_CONTEXT_DEFAULT } from './context-budget'
import { estimateKvCacheGB } from './compatibility'

const GB = 1024 ** 3

/**
 * How much of a model is expected to run on the GPU.
 *
 * - `full`     — weights and cache fit in VRAM; generation runs at GPU speed
 * - `partial`  — only some layers fit; the rest run on CPU and set the pace
 * - `cpu_only` — nothing meaningful fits, or there is no usable GPU
 * - `unified`  — Apple Silicon, where there is no separate VRAM pool to run out of
 * - `unknown`  — no VRAM figure available, so we decline to guess
 */
export type OffloadFit = 'full' | 'partial' | 'cpu_only' | 'unified' | 'unknown'

export interface OffloadEstimate {
  fit: OffloadFit
  /** Share of the model expected to sit in VRAM, 0..1. */
  fraction: number
  /**
   * `measured` when the numbers come from the model's own GGUF header,
   * `estimated` when derived from its parameter count because it is not
   * downloaded yet. Drives how firmly the UI is allowed to phrase things.
   */
  confidence: 'measured' | 'estimated'
}

/**
 * VRAM that is never available to the model: the engine's compute buffers plus
 * the driver/display context. Mirrors the reserve the engine sizes against.
 */
const VRAM_OVERHEAD_GB = 0.9

/** Above this share, the remainder on CPU is not worth warning about. */
const FULL_THRESHOLD = 0.95
/** Below this share, calling it a GPU run would be misleading. */
const CPU_THRESHOLD = 0.1

/** Exact GGUF geometry, when the model is on disk. */
export interface ModelGeometry {
  blockCount?: number
  embeddingLength?: number
  headCount?: number
  headCountKv?: number
  /** Actual file size in bytes, which beats any catalog estimate. */
  fileSizeBytes?: number
}

function weightsGB(model: CookbookModel, geometry?: ModelGeometry): number {
  if (geometry?.fileSizeBytes && geometry.fileSizeBytes > 0) {
    return geometry.fileSizeBytes / GB
  }
  if (model.ggufFileSize && model.ggufFileSize > 0) {
    return model.ggufFileSize / GB
  }
  return model.diskSizeGB
}

/**
 * KV cache cost at the reference context, in GB.
 *
 * With real geometry this is exact; otherwise it falls back to the catalog's
 * parameter-count heuristic. Offload runs use the quantized cache, so that is
 * what we size against — assuming f16 would nearly double the estimate.
 */
function kvCacheGB(model: CookbookModel, geometry?: ModelGeometry): number {
  const perToken = geometry
    ? kvBytesPerToken(
        {
          blockCount: geometry.blockCount,
          embeddingLength: geometry.embeddingLength,
          headCount: geometry.headCount,
          headCountKv: geometry.headCountKv
        },
        'q8_0'
      )
    : undefined

  if (perToken) return (perToken * KV_RESERVE_CONTEXT_DEFAULT) / GB
  return estimateKvCacheGB(model)
}

/**
 * Estimates how much of `model` will run on this machine's GPU.
 *
 * Deliberately answers with a *fraction* rather than a layer count: layer counts
 * only exist inside a downloaded GGUF, whereas the question "how much of this
 * runs on my GPU" can be answered for the whole catalog. Turning a fraction into
 * an `-ngl` value is the engine's job at launch.
 *
 * Rated against total VRAM, not the live reading, so a card's rating does not
 * change while the user watches it. Live contention is reported separately.
 */
export function estimateOffload(
  system: SystemInfoFull | null,
  model: CookbookModel,
  geometry?: ModelGeometry
): OffloadEstimate {
  const confidence: OffloadEstimate['confidence'] = geometry?.blockCount ? 'measured' : 'estimated'

  if (!system) return { fit: 'unknown', fraction: 0, confidence }

  // Unified memory has no separate VRAM pool, so there is no offload cliff to
  // warn about — whether it fits at all is getCompatibility's question.
  if (system.gpu?.isAppleSilicon) return { fit: 'unified', fraction: 1, confidence }

  const totalVramGB = system.gpu?.vramGB ?? 0
  if (!totalVramGB || totalVramGB <= 0) {
    return { fit: 'cpu_only', fraction: 0, confidence }
  }

  const needGB = weightsGB(model, geometry) + kvCacheGB(model, geometry)
  if (needGB <= 0) return { fit: 'unknown', fraction: 0, confidence }

  const usableGB = totalVramGB - VRAM_OVERHEAD_GB
  if (usableGB <= 0) return { fit: 'cpu_only', fraction: 0, confidence }

  const fraction = Math.max(0, Math.min(1, usableGB / needGB))

  if (fraction >= FULL_THRESHOLD) return { fit: 'full', fraction: 1, confidence }
  if (fraction < CPU_THRESHOLD) return { fit: 'cpu_only', fraction, confidence }
  return { fit: 'partial', fraction, confidence }
}

/**
 * One sentence for the card, or null when there is nothing worth saying.
 *
 * `full` and `unified` return null on purpose: a note on every card would be
 * noise, and the compatibility badge already carries the good news.
 */
export function describeOffload(
  system: SystemInfoFull | null,
  model: CookbookModel,
  geometry?: ModelGeometry
): string | null {
  const { fit, fraction, confidence } = estimateOffload(system, model, geometry)
  if (fit === 'full' || fit === 'unified' || fit === 'unknown') return null

  const vramGB = system?.gpu?.vramGB
  const cardNote = vramGB ? ` on your ${vramGB.toFixed(0)} GB GPU` : ''

  if (fit === 'cpu_only') {
    return `Too large for GPU memory${cardNote} — runs on CPU, which is much slower.`
  }

  const percent = Math.round(fraction * 100)
  const hedge = confidence === 'estimated' ? '~' : ''
  return `${hedge}${percent}% fits${cardNote} — the rest runs on CPU, so expect slower generation.`
}

/**
 * How much VRAM other things are holding right now. Separate from the rating
 * above so live movement never rewrites a model's badge.
 */
export function describeVramContention(vram: VramReading | null | undefined): string | null {
  if (!vram || vram.totalMiB <= 0) return null
  const usedGB = vram.usedMiB / 1024
  // Below this the card is essentially idle and the note is just noise.
  if (usedGB < 0.5) return null
  return `${usedGB.toFixed(1)} GB of ${(vram.totalMiB / 1024).toFixed(1)} GB VRAM is currently in use.`
}

import { exec } from 'child_process'
import { promisify } from 'util'
import { detectGpu } from '../engine/gpu-detect'
import type { VramReading } from '../../shared/types'

const execAsync = promisify(exec)

/**
 * `VramReading` is deliberately the *only* capacity signal the compatibility
 * maths uses. Summing what our own processes report (Ollama's `/api/ps`, the
 * engine's layer estimate) misses every other consumer — the compositor, a
 * browser, or an Ollama someone started outside Golti — and mixes measurements
 * with estimates. The driver already knows the true answer, so we ask it.
 */
export type { VramReading } from '../../shared/types'

/** How long a probe stays fresh. Several views poll independently; they share this. */
const CACHE_TTL_MS = 2000

let cached: { at: number; value: VramReading | null } | null = null
let inFlight: Promise<VramReading | null> | null = null

/** Parses `nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free`. */
export function parseNvidiaSmiVram(stdout: string): VramReading[] {
  const readings: VramReading[] = []
  for (const line of stdout.trim().split('\n')) {
    const parts = line.split(',').map((f) => f.trim())
    if (parts.length < 5) continue
    const [index, name, total, used, free] = parts
    const totalMiB = Number.parseInt(total, 10)
    const usedMiB = Number.parseInt(used, 10)
    const freeMiB = Number.parseInt(free, 10)
    if (!index || !Number.isFinite(totalMiB) || totalMiB <= 0) continue
    readings.push({
      index,
      name: name || 'GPU',
      totalMiB,
      usedMiB: Number.isFinite(usedMiB) ? usedMiB : 0,
      // Some drivers omit free; derive it rather than reporting zero headroom.
      freeMiB: Number.isFinite(freeMiB) ? freeMiB : Math.max(0, totalMiB - (usedMiB || 0))
    })
  }
  return readings
}

/** Parses `rocm-smi --showmeminfo vram --csv`, which reports bytes rather than MiB. */
export function parseRocmSmiVram(stdout: string): VramReading[] {
  const readings: VramReading[] = []
  for (const line of stdout.trim().split('\n')) {
    const parts = line.split(',').map((f) => f.trim())
    const match = parts[0]?.match(/^card(\d+)$/)
    if (!match) continue

    const numbers = parts.slice(1).map((p) => Number.parseInt(p, 10))
    const [totalBytes, usedBytes] = numbers
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) continue

    const totalMiB = Math.round(totalBytes / (1024 * 1024))
    const usedMiB = Number.isFinite(usedBytes) ? Math.round(usedBytes / (1024 * 1024)) : 0
    readings.push({
      index: match[1],
      name: 'AMD GPU',
      totalMiB,
      usedMiB,
      freeMiB: Math.max(0, totalMiB - usedMiB)
    })
  }
  return readings
}

/**
 * Chooses the card inference will actually use on a multi-GPU box: the one with
 * the most VRAM, which on hybrid laptops is the discrete GPU rather than the
 * integrated one sitting at index 0.
 */
export function pickPrimaryVram(readings: VramReading[]): VramReading | null {
  if (readings.length === 0) return null
  return [...readings].sort((a, b) => b.totalMiB - a.totalMiB)[0]
}

async function probeVram(): Promise<VramReading | null> {
  const gpu = await detectGpu()

  // Apple unified memory has no separate VRAM pool to report, and a CPU-only
  // box has nothing to probe. Both skip the subprocess entirely.
  if (gpu.vendor === 'apple' || gpu.vendor === 'none') return null

  if (gpu.vendor === 'nvidia') {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free --format=csv,noheader,nounits'
      )
      const primary = pickPrimaryVram(parseNvidiaSmiVram(stdout))
      if (primary) return primary
    } catch {}
  }

  if (gpu.vendor === 'amd') {
    try {
      const { stdout } = await execAsync('rocm-smi --showmeminfo vram --csv')
      const primary = pickPrimaryVram(parseRocmSmiVram(stdout))
      if (primary) return primary
    } catch {}
  }

  return null
}

/**
 * Current VRAM occupancy, or null when it cannot be measured.
 *
 * Null means "unknown", never "nothing in use" — callers must not render it as
 * a zero. Results are cached briefly and concurrent callers share one probe, so
 * several polling views cost one subprocess rather than one each.
 */
export async function readVram(force = false): Promise<VramReading | null> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value
  }
  if (inFlight) return inFlight

  inFlight = probeVram()
    .then((value) => {
      cached = { at: Date.now(), value }
      return value
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** Testing/backend-switch hook: drops the cached reading. */
export function resetVramCache(): void {
  cached = null
  inFlight = null
}

import type { OllamaLoadedModel, OllamaRuntimeInfo } from '../../shared/types'

/**
 * Shape of one entry in Ollama's `/api/ps` response. `size` is what the model
 * occupies in total and `size_vram` how much of that landed on the GPU, so the
 * difference is the part being served from system RAM.
 */
interface OllamaPsEntry {
  name?: string
  model?: string
  size?: number
  size_vram?: number
  expires_at?: string
}

/**
 * Turns a `/api/ps` payload into the runtime summary the UI shows.
 *
 * This is the only place we learn the *actual* GPU split: everything else
 * (VRAM probes, layer heuristics) is a prediction, whereas Ollama reports here
 * what it really did after loading.
 */
export function summarizeOllamaPs(payload: unknown): OllamaRuntimeInfo {
  const rawModels = (payload as { models?: unknown })?.models
  const entries: OllamaPsEntry[] = Array.isArray(rawModels) ? rawModels : []

  const loaded: OllamaLoadedModel[] = []
  for (const entry of entries) {
    const name = entry.name || entry.model
    if (!name) continue

    const sizeBytes = Number(entry.size) || 0
    // Clamp: a rounding quirk upstream must never report >100% on GPU.
    const vramBytes = Math.min(Number(entry.size_vram) || 0, sizeBytes || Number.MAX_SAFE_INTEGER)
    const gpuPercent = sizeBytes > 0 ? Math.round((vramBytes / sizeBytes) * 100) : 0

    loaded.push({
      name,
      sizeBytes,
      vramBytes,
      gpuPercent,
      placement: vramBytes <= 0 ? 'cpu' : gpuPercent >= 100 ? 'gpu' : 'partial',
      expiresAt: entry.expires_at
    })
  }

  return {
    loaded,
    totalSizeBytes: loaded.reduce((sum, m) => sum + m.sizeBytes, 0),
    totalVramBytes: loaded.reduce((sum, m) => sum + m.vramBytes, 0)
  }
}

/**
 * Reads what Ollama currently has resident. Returns null when the daemon is
 * unreachable, which callers treat as "unknown" rather than "nothing loaded" —
 * the two look identical in the payload but mean very different things.
 */
export async function fetchOllamaRuntime(port = 11434): Promise<OllamaRuntimeInfo | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ps`, {
      signal: AbortSignal.timeout(1500)
    })
    if (!res.ok) return null
    return summarizeOllamaPs(await res.json())
  } catch {
    return null
  }
}

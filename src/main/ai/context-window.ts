import { dbProviders } from '../db/database'
import { getEngineState } from '../engine/engine-process'
import { lookupCloudContextWindow } from '../../shared/context-windows'

interface CacheEntry {
  value: number
  at: number
}

const CLOUD_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function clearContextWindowCache(): void {
  cache.clear()
}

async function fetchGoogleContextWindow(
  apiKey: string,
  model: string
): Promise<number | undefined> {
  if (!apiKey) return undefined
  const name = model.startsWith('models/') ? model : `models/${model}`
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(apiKey)}`
    )
    if (!response.ok) return undefined
    const data: any = await response.json()
    const limit = data?.inputTokenLimit
    const output = data?.outputTokenLimit
    if (typeof limit !== 'number' || limit <= 0) return undefined
    return typeof output === 'number' && output > 0 ? limit + output : limit
  } catch {
    return undefined
  }
}

export async function resolveContextWindow(
  providerId: string,
  modelName: string
): Promise<number | undefined> {
  const provider = dbProviders.list().find((p) => p.id === providerId)
  if (!provider) return undefined

  if (provider.type === 'golti-engine') {
    const state = getEngineState()
    return state.status === 'running' && state.contextSize ? state.contextSize : undefined
  }

  const key = `${providerId}:${modelName}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CLOUD_CACHE_TTL_MS) return hit.value

  const live =
    provider.type === 'google'
      ? await fetchGoogleContextWindow(provider.apiKey || '', modelName)
      : undefined
  const resolved = live ?? lookupCloudContextWindow(modelName)
  if (resolved) cache.set(key, { value: resolved, at: Date.now() })
  return resolved
}

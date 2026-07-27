import os from 'os'
import { dbProviders } from '../db/database'
import { getEngineState } from '../engine/engine-process'
import { getAvailableMemoryBytes } from '../system/memory'
import { DEFAULT_LOCAL_CONTEXT_TARGET, lookupCloudContextWindow } from '../../shared/context-windows'
import { computeContextBudget, kvBytesPerToken, ModelShape } from '../../shared/context-budget'
import { OLLAMA_PARALLEL_SLOTS } from '../ollama/ollama-process'

const STABLE_RAM_FRACTION = 0.5

interface CacheEntry {
  value: number
  at: number
}

const CACHE_TTL_MS = 60_000
const CLOUD_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function clearContextWindowCache(): void {
  cache.clear()
}

interface OllamaModelProfile {
  contextLength?: number
  shape: ModelShape
}

function readArchNumber(info: Record<string, unknown>, suffix: string): number | undefined {
  for (const [key, value] of Object.entries(info)) {
    if (key.endsWith(suffix) && typeof value === 'number' && value > 0) return value
  }
  return undefined
}

async function fetchOllamaModelProfile(
  endpoint: string,
  model: string
): Promise<OllamaModelProfile | undefined> {
  try {
    const response = await fetch(`${endpoint}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    })
    if (!response.ok) return undefined
    const data: any = await response.json()
    const info = data?.model_info
    if (!info || typeof info !== 'object') return undefined
    return {
      contextLength: readArchNumber(info, '.context_length'),
      shape: {
        blockCount: readArchNumber(info, '.block_count'),
        embeddingLength: readArchNumber(info, '.embedding_length'),
        headCount: readArchNumber(info, '.attention.head_count'),
        headCountKv: readArchNumber(info, '.attention.head_count_kv')
      }
    }
  } catch {
    return undefined
  }
}

async function fetchOllamaModelBytes(endpoint: string, model: string): Promise<number> {
  try {
    const response = await fetch(`${endpoint}/api/tags`)
    if (!response.ok) return 0
    const data: any = await response.json()
    const models: any[] = Array.isArray(data?.models) ? data.models : []
    const match = models.find((m) => m?.name === model || m?.model === model)
    return typeof match?.size === 'number' && match.size > 0 ? match.size : 0
  } catch {
    return 0
  }
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

export function resolveOllamaNumCtx(trainedContextLength: number | undefined): number | undefined {
  if (!trainedContextLength) return undefined
  return Math.min(trainedContextLength, DEFAULT_LOCAL_CONTEXT_TARGET)
}

export function resolveOllamaContextSize(input: {
  trainedContextSize?: number
  shape: ModelShape
  modelBytes: number
  availableBytes: number
}): number | undefined {
  if (!input.trainedContextSize) return undefined
  return computeContextBudget({
    trainedContextSize: input.trainedContextSize,
    perTokenBytes: kvBytesPerToken(input.shape),
    modelBytes: input.modelBytes,
    availableBytes: input.availableBytes,
    parallelSlots: OLLAMA_PARALLEL_SLOTS
  }).contextSize
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

  if (provider.type !== 'ollama') {
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

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const endpoint = (provider.endpoint || 'http://localhost:11434').replace(/\/+$/, '')
  const profile = await fetchOllamaModelProfile(endpoint, modelName)
  if (!profile?.contextLength) return undefined

  const [modelBytes, freeBytes] = await Promise.all([
    fetchOllamaModelBytes(endpoint, modelName),
    getAvailableMemoryBytes()
  ])

  const resolved = resolveOllamaContextSize({
    trainedContextSize: profile.contextLength,
    shape: profile.shape,
    modelBytes,
    availableBytes: Math.max(freeBytes, os.totalmem() * STABLE_RAM_FRACTION)
  })

  if (resolved) {
    console.log(
      `[Ollama] Context size ${resolved} for ${modelName} (trained for ${profile.contextLength})`
    )
    cache.set(key, { value: resolved, at: Date.now() })
  }
  return resolved
}

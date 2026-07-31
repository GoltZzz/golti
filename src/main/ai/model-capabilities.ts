import path from 'path'
import type { ModelCapabilities } from '../../shared/types'
import { dbProviders } from '../db/database'
import { listLocalModels } from '../engine/model-downloader'
import { projectorMetadataFor, supportsVision } from '../engine/projector'
import { lookupCloudPdfSupport, lookupCloudVisionSupport } from '../../shared/vision-support'
import { localImageTokens } from '../../shared/image-tokens'

export type { ModelCapabilities }

interface CacheEntry {
  value: ModelCapabilities
  at: number
}

const CLOUD_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function clearModelCapabilitiesCache(): void {
  cache.clear()
}

function stripGguf(name: string): string {
  return name.toLowerCase().replace(/\.gguf$/, '')
}

function matchLocalModel(modelName: string): string | undefined {
  const wanted = stripGguf(path.basename(modelName))
  for (const local of listLocalModels()) {
    if (stripGguf(local.filename) === wanted) {
      return local.filepath
    }
  }
  return undefined
}

/**
 * Resolved against the *target* model rather than the running engine, so the
 * answer is correct before a model is loaded and the composer does not flicker.
 */
export function resolveLocalCapabilities(modelName: string): ModelCapabilities {
  const filepath = matchLocalModel(modelName)
  if (!filepath) {
    return { image: false, pdf: false, reason: `${modelName} is not installed locally` }
  }

  if (!supportsVision(filepath)) {
    return {
      image: false,
      pdf: false,
      reason: `${path.parse(modelName).name} has no vision projector installed`
    }
  }

  const info = projectorMetadataFor(filepath)
  return {
    image: true,
    pdf: false,
    imageTokens: localImageTokens({
      imageSize: info?.imageSize,
      patchSize: info?.patchSize
    })
  }
}

export async function resolveModelCapabilities(
  providerId: string,
  modelName: string
): Promise<ModelCapabilities> {
  const provider = dbProviders.list().find((p) => p.id === providerId)
  if (!provider) return { image: false, pdf: false, reason: 'Provider not found' }

  if (provider.type === 'golti-engine') {
    // Never cached: installing a projector must take effect immediately.
    return resolveLocalCapabilities(modelName)
  }

  const key = `${providerId}:${modelName}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CLOUD_CACHE_TTL_MS) return hit.value

  const image = lookupCloudVisionSupport(modelName)
  const pdf = lookupCloudPdfSupport(modelName)

  // An unrecognised cloud name is permissive: a newly released model should not
  // be blocked just because the lookup table has not caught up.
  const value: ModelCapabilities = {
    image: image ?? true,
    pdf: pdf ?? false,
    reason: image === false ? `${modelName} cannot read images` : undefined
  }

  cache.set(key, { value, at: Date.now() })
  return value
}

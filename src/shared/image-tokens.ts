export const MAX_IMAGE_EDGE = 1568

export interface ImageDimensions {
  width: number
  height: number
}

export function fitWithin(dim: ImageDimensions, maxEdge: number): ImageDimensions {
  const longest = Math.max(dim.width, dim.height)
  if (longest <= maxEdge) return { ...dim }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(dim.width * scale)),
    height: Math.max(1, Math.round(dim.height * scale))
  }
}

export function anthropicImageTokens(dim: ImageDimensions): number {
  const { width, height } = fitWithin(dim, MAX_IMAGE_EDGE)
  return Math.ceil((width * height) / 750)
}

export function openAIImageTokens(dim: ImageDimensions): number {
  let { width, height } = fitWithin(dim, 2048)
  const shortest = Math.min(width, height)
  if (shortest > 768) {
    const scale = 768 / shortest
    width = Math.max(1, Math.round(width * scale))
    height = Math.max(1, Math.round(height * scale))
  }
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512)
  return 85 + 170 * tiles
}

export function googleImageTokens(dim: ImageDimensions): number {
  if (dim.width <= 384 && dim.height <= 384) return 258
  const tiles = Math.ceil(dim.width / 768) * Math.ceil(dim.height / 768)
  return 258 * tiles
}

export const DEFAULT_LOCAL_IMAGE_TOKENS = 1024

export function localImageTokens(projector?: {
  imageSize?: number
  patchSize?: number
  mergeFactor?: number
}): number {
  const imageSize = projector?.imageSize
  const patchSize = projector?.patchSize
  if (!imageSize || !patchSize) return DEFAULT_LOCAL_IMAGE_TOKENS
  const patches = Math.pow(Math.ceil(imageSize / patchSize), 2)
  const merge = projector?.mergeFactor && projector.mergeFactor > 0 ? projector.mergeFactor : 1
  return Math.max(1, Math.ceil(patches / merge))
}

/**
 * Stored on the attachment row: the worst case across providers, so the
 * composer budget never under-reports regardless of which model is selected.
 */
export function pessimisticImageTokens(dim: ImageDimensions): number {
  return Math.max(
    anthropicImageTokens(dim),
    openAIImageTokens(dim),
    googleImageTokens(dim),
    DEFAULT_LOCAL_IMAGE_TOKENS
  )
}

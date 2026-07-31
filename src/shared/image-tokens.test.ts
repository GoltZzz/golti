import { describe, it, expect } from 'vitest'
import {
  fitWithin,
  anthropicImageTokens,
  openAIImageTokens,
  googleImageTokens,
  localImageTokens,
  pessimisticImageTokens,
  DEFAULT_LOCAL_IMAGE_TOKENS,
  MAX_IMAGE_EDGE
} from './image-tokens'

describe('fitWithin', () => {
  it('leaves small images alone', () => {
    expect(fitWithin({ width: 800, height: 600 }, MAX_IMAGE_EDGE)).toEqual({
      width: 800,
      height: 600
    })
  })

  it('scales the longest edge down and preserves aspect ratio', () => {
    expect(fitWithin({ width: 4000, height: 2000 }, 1568)).toEqual({ width: 1568, height: 784 })
  })

  it('never returns a zero dimension', () => {
    expect(fitWithin({ width: 5000, height: 1 }, 100).height).toBe(1)
  })
})

describe('anthropicImageTokens', () => {
  it('matches the documented width*height/750 formula', () => {
    expect(anthropicImageTokens({ width: 1092, height: 1092 })).toBe(1590)
  })

  it('clamps oversized images to the 1568px edge first', () => {
    const huge = anthropicImageTokens({ width: 8000, height: 8000 })
    expect(huge).toBe(anthropicImageTokens({ width: 1568, height: 1568 }))
  })
})

describe('openAIImageTokens', () => {
  it('charges base + one tile for a 512px square', () => {
    expect(openAIImageTokens({ width: 512, height: 512 })).toBe(255)
  })

  it('charges four tiles for a 1024px square', () => {
    expect(openAIImageTokens({ width: 1024, height: 1024 })).toBe(85 + 170 * 4)
  })

  it('shrinks the shortest side to 768 before tiling', () => {
    expect(openAIImageTokens({ width: 2048, height: 1024 })).toBe(
      openAIImageTokens({ width: 1536, height: 768 })
    )
  })
})

describe('googleImageTokens', () => {
  it('charges a flat 258 for small images', () => {
    expect(googleImageTokens({ width: 300, height: 200 })).toBe(258)
    expect(googleImageTokens({ width: 384, height: 384 })).toBe(258)
  })

  it('charges 258 per 768px tile above that', () => {
    expect(googleImageTokens({ width: 800, height: 600 })).toBe(516)
    expect(googleImageTokens({ width: 1536, height: 1536 })).toBe(258 * 4)
  })
})

describe('localImageTokens', () => {
  it('falls back when projector metadata is missing', () => {
    expect(localImageTokens()).toBe(DEFAULT_LOCAL_IMAGE_TOKENS)
    expect(localImageTokens({ imageSize: 896 })).toBe(DEFAULT_LOCAL_IMAGE_TOKENS)
  })

  it('derives patch count from image and patch size', () => {
    expect(localImageTokens({ imageSize: 896, patchSize: 14 })).toBe(4096)
  })

  it('divides by the merge factor', () => {
    expect(localImageTokens({ imageSize: 896, patchSize: 14, mergeFactor: 4 })).toBe(1024)
  })
})

describe('pessimisticImageTokens', () => {
  it('is at least as large as every per-provider estimate', () => {
    const dim = { width: 1092, height: 1092 }
    const worst = pessimisticImageTokens(dim)
    expect(worst).toBeGreaterThanOrEqual(anthropicImageTokens(dim))
    expect(worst).toBeGreaterThanOrEqual(openAIImageTokens(dim))
    expect(worst).toBeGreaterThanOrEqual(googleImageTokens(dim))
    expect(worst).toBeGreaterThanOrEqual(DEFAULT_LOCAL_IMAGE_TOKENS)
  })
})

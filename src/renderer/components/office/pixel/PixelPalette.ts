/**
 * Pixel Color Palette & 16-Bit Shading Engine
 *
 * Implements authentic retro color ramping with hue-shifting:
 * - Highlights: Shift slightly towards warm golden light (+Hue for reds/skin, higher value, lower saturation).
 * - Midtones: Pure base color.
 * - Shadows: Cool ambient shift (-Hue towards blue/violet, increased saturation, decreased value).
 * - Outlines: Deep saturated ink contour for crisp pixel sprite borders.
 */

import { AgentAvatarConfig } from '../../../../shared/types'

export interface ColorRamp {
  highlight: string
  base: string
  shadow: string
  deepShadow: string
  outline: string
}

export interface AgentPixelPalette {
  skin: ColorRamp
  hair: ColorRamp
  outfit: ColorRamp
  accent: ColorRamp
  accessory: ColorRamp
  ink: string
  eyeColor: string
  eyeShine: string
  blush: string
}

/**
 * Converts Hex string (#rgb or #rrggbb) to RGB [0-255].
 */
export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (clean.length !== 6) {
    return [128, 128, 128]
  }
  const num = parseInt(clean, 16)
  if (isNaN(num)) return [128, 128, 128]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/**
 * Converts RGB [0-255] to Hex string (#rrggbb).
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const h = (v: number) => clamp(v).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Converts RGB [0-255] to HSV [0-360, 0-1, 0-1].
 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2
    } else {
      h = (rNorm - gNorm) / delta + 4
    }
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }

  const s = max === 0 ? 0 : delta / max
  const v = max

  return [h, s, v]
}

/**
 * Converts HSV [0-360, 0-1, 0-1] to RGB [0-255].
 */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r1 = 0
  let g1 = 0
  let b1 = 0

  if (h >= 0 && h < 60) {
    r1 = c
    g1 = x
    b1 = 0
  } else if (h >= 60 && h < 120) {
    r1 = x
    g1 = c
    b1 = 0
  } else if (h >= 120 && h < 180) {
    r1 = 0
    g1 = c
    b1 = x
  } else if (h >= 180 && h < 240) {
    r1 = 0
    g1 = x
    b1 = c
  } else if (h >= 240 && h < 300) {
    r1 = x
    g1 = 0
    b1 = c
  } else {
    r1 = c
    g1 = 0
    b1 = x
  }

  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

/**
 * Generates an authentic 16-bit color ramp with highlight, base, shadow, and outline.
 */
export function generateColorRamp(
  hex: string,
  kind: 'skin' | 'hair' | 'cloth' | 'accent' = 'cloth'
): ColorRamp {
  const [r, g, b] = hexToRgb(hex)
  const [h, s, v] = rgbToHsv(r, g, b)

  let highlightH = h
  let highlightS = Math.max(0.05, s * 0.72)
  let highlightV = Math.min(1, v * 1.25 + 0.08)

  let shadowH = h
  let shadowS = Math.min(1, s * 1.22 + 0.08)
  let shadowV = Math.max(0.08, v * 0.68)

  let deepShadowV = Math.max(0.04, v * 0.45)
  let outlineV = Math.max(0.02, v * 0.28)

  if (kind === 'skin') {
    // Skin hue shifting: warm peach highlight (+Hue toward yellow), rich reddish/terracotta shadow
    highlightH = (h + 8) % 360
    shadowH = (h - 8 + 360) % 360
    highlightV = Math.min(1, v * 1.18 + 0.1)
    shadowV = Math.max(0.15, v * 0.75)
    deepShadowV = Math.max(0.1, v * 0.55)
  } else if (kind === 'hair') {
    // Hair hue shifting: glossy specular highlight
    highlightV = Math.min(1, v * 1.35 + 0.12)
    highlightS = Math.max(0.1, s * 0.65)
    shadowV = Math.max(0.06, v * 0.6)
  } else if (kind === 'cloth' || kind === 'accent') {
    // Fabric hue shifting: cool ambient shadow (-Hue towards blue)
    shadowH = (h + 12) % 360
    shadowV = Math.max(0.08, v * 0.7)
  }

  const highlightRgb = hsvToRgb(highlightH, highlightS, highlightV)
  const shadowRgb = hsvToRgb(shadowH, shadowS, shadowV)
  const deepShadowRgb = hsvToRgb(shadowH, Math.min(1, shadowS * 1.15), deepShadowV)
  const outlineRgb = hsvToRgb(shadowH, Math.min(1, shadowS * 1.3), outlineV)

  return {
    highlight: rgbToHex(...highlightRgb),
    base: hex.startsWith('#') ? hex : rgbToHex(r, g, b),
    shadow: rgbToHex(...shadowRgb),
    deepShadow: rgbToHex(...deepShadowRgb),
    outline: rgbToHex(...outlineRgb)
  }
}

/**
 * Builds the full palette definition for an agent sprite.
 */
export function getAgentPixelPalette(avatar: AgentAvatarConfig): AgentPixelPalette {
  const skin = generateColorRamp(avatar.skinColor || '#f8c09a', 'skin')
  const hair = generateColorRamp(avatar.hairColor || '#382a21', 'hair')
  const outfit = generateColorRamp(avatar.outfitColor || '#2c3e50', 'cloth')
  const accent = generateColorRamp(avatar.accentColor || '#61afef', 'accent')
  const accessory = generateColorRamp(avatar.accentColor || '#e5c07b', 'accent')

  // Subtle blush for expressive pixel faces
  const [sr, sg, sb] = hexToRgb(skin.base)
  const blush = rgbToHex(Math.min(255, sr * 1.1), Math.max(0, sg * 0.75), Math.max(0, sb * 0.8))

  return {
    skin,
    hair,
    outfit,
    accent,
    accessory,
    ink: '#11131a',
    eyeColor: '#1a1d26',
    eyeShine: '#ffffff',
    blush
  }
}

import { describe, it, expect } from 'vitest'
import {
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  generateColorRamp,
  getAgentPixelPalette
} from './PixelPalette'

describe('PixelPalette', () => {
  it('converts hex to rgb and back correctly', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
    expect(hexToRgb('#00ff00')).toEqual([0, 255, 0])
    expect(hexToRgb('#0000ff')).toEqual([0, 0, 255])
    expect(hexToRgb('123456')).toEqual([18, 52, 86])
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00')
  })

  it('converts rgb to hsv and back accurately', () => {
    const [h, s, v] = rgbToHsv(255, 0, 0)
    expect(h).toBe(0)
    expect(s).toBe(1)
    expect(v).toBe(1)

    const [r, g, b] = hsvToRgb(h, s, v)
    expect(Math.round(r)).toBe(255)
    expect(Math.round(g)).toBe(0)
    expect(Math.round(b)).toBe(0)
  })

  it('generates 16-bit color ramp with highlight, base, shadow, and outline', () => {
    const ramp = generateColorRamp('#61afef', 'cloth')
    expect(ramp.base).toBe('#61afef')
    expect(ramp.highlight).toMatch(/^#[0-9a-f]{6}$/i)
    expect(ramp.shadow).toMatch(/^#[0-9a-f]{6}$/i)
    expect(ramp.deepShadow).toMatch(/^#[0-9a-f]{6}$/i)
    expect(ramp.outline).toMatch(/^#[0-9a-f]{6}$/i)
    expect(ramp.highlight).not.toBe(ramp.shadow)
  })

  it('builds full agent pixel palette with skin, hair, and outfit ramps', () => {
    const palette = getAgentPixelPalette({
      skinColor: '#f8c09a',
      hairColor: '#382a21',
      outfitColor: '#2c3e50',
      accentColor: '#61afef',
      accessory: 'headphones'
    })

    expect(palette.skin.base).toBe('#f8c09a')
    expect(palette.hair.base).toBe('#382a21')
    expect(palette.outfit.base).toBe('#2c3e50')
    expect(palette.accent.base).toBe('#61afef')
    expect(palette.ink).toBe('#11131a')
    expect(palette.blush).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

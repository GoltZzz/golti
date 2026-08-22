// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import {
  adjustBrightness,
  drawIsometricTile,
  drawIsometricDesk,
  drawIsometricBackWall,
  drawIsometricDivider,
  drawIsometricServerRack,
  drawIsometricCoffeeBar,
  drawIsometricHoloTable,
  drawIsometricPlant,
  drawIsometricChair,
  drawIsometricWall
} from './IsometricAssets'

function createMockCanvasCtx(): CanvasRenderingContext2D {
  const noop = vi.fn()
  const gradientMock = {
    addColorStop: vi.fn()
  }
  return {
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    roundRect: noop,
    fillText: noop,
    createRadialGradient: vi.fn(() => gradientMock),
    createLinearGradient: vi.fn(() => gradientMock),
    quadraticCurveTo: noop,
    setTransform: noop,
    transform: noop,
    resetTransform: noop,
    clearRect: noop
  } as unknown as CanvasRenderingContext2D
}

describe('IsometricAssets', () => {
  it('adjusts color brightness properly', () => {
    const lighter = adjustBrightness('#101010', 2.0)
    expect(lighter).toBe('rgb(32, 32, 32)')

    const darker = adjustBrightness('#ffffff', 0.5)
    expect(darker).toBe('rgb(128, 128, 128)')
  })

  it('draws isometric tiles across all zone materials without error', () => {
    const ctx = createMockCanvasCtx()
    const materials = ['wood', 'carpet', 'concrete', 'tile', 'grating', 'slate', 'corridor'] as const

    materials.forEach((mat) => {
      expect(() => drawIsometricTile(ctx, 100, 100, mat, false, true)).not.toThrow()
      expect(() => drawIsometricTile(ctx, 100, 100, mat, true, false)).not.toThrow()
    })
  })

  it('draws high-fidelity desks across all types and screen configurations', () => {
    const ctx = createMockCanvasCtx()
    const deskTypes = ['executive', 'dev', 'research', 'server_console'] as const

    deskTypes.forEach((dt) => {
      expect(() =>
        drawIsometricDesk(ctx, 100, 100, {
          deskType: dt,
          screens: 2,
          isActive: true,
          isNight: false,
          animFrame: 10,
          agentName: 'Alex Rivera',
          agentRole: 'Studio Director'
        })
      ).not.toThrow()

      expect(() =>
        drawIsometricDesk(ctx, 100, 100, {
          deskType: dt,
          screens: 1,
          isActive: false,
          isNight: true,
          animFrame: 0
        })
      ).not.toThrow()
    })
  })

  it('draws open-concept dividers and solid architectural back walls', () => {
    const ctx = createMockCanvasCtx()
    expect(() => drawIsometricDivider(ctx, 100, 100, 'north', false)).not.toThrow()
    expect(() => drawIsometricDivider(ctx, 100, 100, 'west', true)).not.toThrow()
    expect(() => drawIsometricBackWall(ctx, 100, 100, 'north', false)).not.toThrow()
    expect(() => drawIsometricBackWall(ctx, 100, 100, 'west', true)).not.toThrow()
    expect(() => drawIsometricWall(ctx, 100, 100, 'north', true, false)).not.toThrow()
  })

  it('draws environmental props (servers, coffee bar, hologram table, plants, chairs)', () => {
    const ctx = createMockCanvasCtx()
    expect(() => drawIsometricServerRack(ctx, 100, 100, 5, false)).not.toThrow()
    expect(() => drawIsometricCoffeeBar(ctx, 100, 100, 5)).not.toThrow()
    expect(() => drawIsometricHoloTable(ctx, 100, 100, 5, false)).not.toThrow()
    expect(() => drawIsometricPlant(ctx, 100, 100, false)).not.toThrow()
    expect(() => drawIsometricChair(ctx, 100, 100)).not.toThrow()
  })
})

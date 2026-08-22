import { describe, it, expect } from 'vitest'
import {
  gridToScreen,
  screenToGrid,
  getDepthSortKey,
  getFacingDirection
} from './IsometricProjection'

describe('IsometricProjection Math', () => {
  it('correctly converts grid coordinates to screen coordinates and back', () => {
    const isoX = 4
    const isoY = 6
    const originX = 500
    const originY = 200

    const screen = gridToScreen(isoX, isoY, 0, originX, originY)
    const backToGrid = screenToGrid(screen.x, screen.y, originX, originY)

    expect(Math.round(backToGrid.x)).toBe(isoX)
    expect(Math.round(backToGrid.y)).toBe(isoY)
  })

  it('computes monotonic depth sorting keys', () => {
    const key1 = getDepthSortKey(2, 2, 0)
    const key2 = getDepthSortKey(4, 5, 0)
    const key3 = getDepthSortKey(10, 10, 0)

    expect(key1).toBeLessThan(key2)
    expect(key2).toBeLessThan(key3)
  })

  it('determines correct 4-direction facing angle', () => {
    expect(getFacingDirection(0, 0, 5, 0)).toBe('SE')
    expect(getFacingDirection(5, 0, 0, 0)).toBe('NW')
    expect(getFacingDirection(0, 0, 0, 5)).toBe('SW')
    expect(getFacingDirection(0, 5, 0, 0)).toBe('NE')
  })
})

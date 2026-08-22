/**
 * Core 2:1 Isometric Projection Math & Coordinate Utilities
 */

export const TILE_WIDTH = 64
export const TILE_HEIGHT = 32

export interface IsoPoint {
  x: number // grid X (tiles)
  y: number // grid Y (tiles)
  z?: number // height above floor (tiles/units)
}

export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Converts Isometric Grid coordinates (x, y, z) to 2D Screen pixel coordinates.
 */
export function gridToScreen(
  isoX: number,
  isoY: number,
  isoZ: number = 0,
  originX: number = 0,
  originY: number = 0
): ScreenPoint {
  const screenX = (isoX - isoY) * (TILE_WIDTH / 2) + originX
  const screenY = (isoX + isoY) * (TILE_HEIGHT / 2) - isoZ * TILE_HEIGHT + originY
  return { x: screenX, y: screenY }
}

/**
 * Converts 2D Screen pixel coordinates back to Isometric Grid coordinates (floor z=0).
 */
export function screenToGrid(
  screenX: number,
  screenY: number,
  originX: number = 0,
  originY: number = 0
): IsoPoint {
  const relX = screenX - originX
  const relY = screenY - originY

  const isoX = (relX / (TILE_WIDTH / 2) + relY / (TILE_HEIGHT / 2)) / 2
  const isoY = (relY / (TILE_HEIGHT / 2) - relX / (TILE_WIDTH / 2)) / 2

  return { x: isoX, y: isoY, z: 0 }
}

/**
 * Computes depth sorting index for isometric layering (Y-sorting).
 */
export function getDepthSortKey(isoX: number, isoY: number, isoZ: number = 0): number {
  return (isoX + isoY) * 1000 + isoZ * 10
}

/**
 * 4-direction facing angle calculation.
 */
export type Direction = 'SE' | 'SW' | 'NE' | 'NW'

export function getFacingDirection(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): Direction {
  const dx = toX - fromX
  const dy = toY - fromY

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'SE' : 'NW'
  } else {
    return dy > 0 ? 'SW' : 'NE'
  }
}

import { describe, it, expect } from 'vitest'
import {
  findOfficePath,
  getFacingDirection,
  isWalkable
} from './OfficePathfinding'

describe('OfficePathfinding', () => {
  it('identifies walkable and blocked tiles', () => {
    expect(isWalkable(7, 5)).toBe(true) // Center corridor
    expect(isWalkable(3, 3)).toBe(false) // Director desk
    expect(isWalkable(2, 15)).toBe(false) // Server rack
    expect(isWalkable(0, 0)).toBe(false) // Out of bounds
  })

  it('calculates facing direction based on movement vectors', () => {
    expect(getFacingDirection({ x: 5, y: 5 }, { x: 8, y: 5 })).toBe('east')
    expect(getFacingDirection({ x: 5, y: 5 }, { x: 2, y: 5 })).toBe('west')
    expect(getFacingDirection({ x: 5, y: 5 }, { x: 5, y: 8 })).toBe('south')
    expect(getFacingDirection({ x: 5, y: 5 }, { x: 5, y: 2 })).toBe('north')
  })

  it('generates waypoints navigating between rooms through corridor', () => {
    const start = { x: 3, y: 2 } // Director office desk area
    const goal = { x: 11, y: 2 } // Dev bullpen desk area

    const path = findOfficePath(start, goal)
    expect(path.length).toBeGreaterThan(0)
    expect(path[path.length - 1]).toEqual(goal)

    // Ensure none of the intermediate path points land directly on a solid obstacle
    for (let i = 0; i < path.length - 1; i++) {
      expect(isWalkable(Math.round(path[i].x), Math.round(path[i].y))).toBe(true)
    }
  })

  it('handles start === goal immediately', () => {
    const pos = { x: 7, y: 7 }
    const path = findOfficePath(pos, pos)
    expect(path).toEqual([pos])
  })
})

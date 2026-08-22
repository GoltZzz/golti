/**
 * Grid-based Corridor & Aisle Pathfinding Engine for Isometric Office
 *
 * Implements an efficient A* pathfinder over the studio floor grid (1..18, 1..19),
 * avoiding solid desks, server chassis, and divider barriers while guiding agents
 * through doors and hallway corridors.
 */

export type FacingDirection = 'south' | 'north' | 'east' | 'west'

export interface PathNode {
  x: number
  y: number
}

// Solid obstacle coordinates on floor (desks, server racks, solid fixtures)
const SOLID_OBSTACLES: Array<{ x: number; y: number }> = [
  // Desks
  { x: 3, y: 3 },
  { x: 11, y: 3 },
  { x: 13, y: 3 },
  { x: 15, y: 3 },
  { x: 11, y: 6 },
  { x: 13, y: 6 },
  { x: 11, y: 11 },
  { x: 14, y: 11 },
  { x: 3, y: 17 },
  // Server Racks
  { x: 2, y: 15 },
  { x: 5, y: 15 },
  { x: 3, y: 18 },
  // Dividers & Plant barriers
  { x: 8, y: 2 },
  { x: 8, y: 4 },
  { x: 8, y: 6 },
  { x: 8, y: 10 },
  { x: 8, y: 12 },
  { x: 8, y: 16 },
  // Solid Fixtures
  { x: 5, y: 3 }, // Bookshelf
  { x: 16, y: 2 }, // Printer
  { x: 16, y: 10 } // Filing cabinet
]

const obstacleSet = new Set(SOLID_OBSTACLES.map((o) => `${o.x},${o.y}`))

export function isWalkable(x: number, y: number): boolean {
  if (x < 1 || x > 18 || y < 1 || y > 19) return false
  return !obstacleSet.has(`${x},${y}`)
}

/**
 * Calculates facing direction from current grid position to next target position.
 */
export function getFacingDirection(current: PathNode, next: PathNode): FacingDirection {
  const dx = next.x - current.x
  const dy = next.y - current.y

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'east' : 'west'
  }
  return dy > 0 ? 'south' : 'north'
}

/**
 * A* Pathfinding from start to goal. Returns an array of waypoints.
 * If direct path is already unobstructed or start === goal, returns [goal].
 */
export function findOfficePath(start: PathNode, goal: PathNode): PathNode[] {
  const startX = Math.round(start.x)
  const startY = Math.round(start.y)
  const goalX = Math.round(goal.x)
  const goalY = Math.round(goal.y)

  if (startX === goalX && startY === goalY) {
    return [{ x: goal.x, y: goal.y }]
  }

  interface Node {
    x: number
    y: number
    g: number
    h: number
    f: number
    parent: Node | null
  }

  const openList: Node[] = []
  const closedSet = new Set<string>()

  const heuristic = (x: number, y: number) => Math.abs(x - goalX) + Math.abs(y - goalY)

  const startNode: Node = {
    x: startX,
    y: startY,
    g: 0,
    h: heuristic(startX, startY),
    f: heuristic(startX, startY),
    parent: null
  }

  openList.push(startNode)

  const neighbors = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 }
  ]

  let bestNode: Node = startNode
  let iterations = 0
  const maxIterations = 350

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++

    // Find node with lowest f
    let lowestIdx = 0
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) {
        lowestIdx = i
      }
    }

    const current = openList.splice(lowestIdx, 1)[0]
    const currentKey = `${current.x},${current.y}`

    if (current.x === goalX && current.y === goalY) {
      bestNode = current
      break
    }

    closedSet.add(currentKey)

    if (current.h < bestNode.h) {
      bestNode = current
    }

    for (const offset of neighbors) {
      const nx = current.x + offset.x
      const ny = current.y + offset.y
      const nKey = `${nx},${ny}`

      if (closedSet.has(nKey)) continue
      // Allow destination tile even if near obstacle
      if (!isWalkable(nx, ny) && !(nx === goalX && ny === goalY)) continue

      const gScore = current.g + 1
      const existing = openList.find((n) => n.x === nx && n.y === ny)

      if (!existing) {
        const h = heuristic(nx, ny)
        openList.push({
          x: nx,
          y: ny,
          g: gScore,
          h,
          f: gScore + h,
          parent: current
        })
      } else if (gScore < existing.g) {
        existing.g = gScore
        existing.f = gScore + existing.h
        existing.parent = current
      }
    }
  }

  // Reconstruct path
  const path: PathNode[] = []
  let curr: Node | null = bestNode
  while (curr && curr.parent) {
    path.unshift({ x: curr.x, y: curr.y })
    curr = curr.parent
  }

  // Ensure exact floating goal is reached
  if (path.length > 0) {
    path[path.length - 1] = { x: goal.x, y: goal.y }
  } else {
    path.push({ x: goal.x, y: goal.y })
  }

  return path
}

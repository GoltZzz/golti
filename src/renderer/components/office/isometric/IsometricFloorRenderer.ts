/**
 * High-Fidelity Isometric 2.5D Multi-Room Floor Renderer
 *
 * Implements painter's-order rendering passes:
 * 1. Foundation Slab: Raised 3D architectural concrete base with soft ground shadow.
 * 2. Ground Layer: Zone-specific materials (parquet wood, acoustic carpet, lab epoxy, slate check, steel grates).
 * 3. Flat Floor Layer: Area rugs and floor inlays.
 * 4. Static Props & Furniture Layer: Depth-sorted by (isoX + isoY) so agents, desks, and props layer correctly.
 * 5. Light Layer: Warm desk lamp pools, active screen glows, coffee lounge pendants, and hologram floor projection.
 *
 * DOM overlay (OfficeFloorLayer) handles interactive agents, roving focus, and accessibility.
 */

import { gridToScreen, getDepthSortKey } from './IsometricProjection'
import {
  drawIsometricTile,
  drawIsometricBackWall,
  drawIsometricDivider,
  drawIsometricDesk,
  drawIsometricServerRack,
  drawIsometricCoffeeBar,
  drawIsometricHoloTable,
  drawIsometricWhiteboard,
  drawIsometricPlant,
  drawIsometricNeonSign,
  drawIsometricChair,
  drawIsometricFilingCabinet,
  drawIsometricPrinter,
  drawIsometricWaterCooler,
  drawIsometricBookshelf,
  drawIsometricRug,
  drawIsometricWallClock,
  drawIsometricRoundTable,
  drawContactShadow,
  drawErgonomicMeshChair,
  FloorTileType,
  DeskType
} from './IsometricAssets'
import { drawPixelCharacterSpriteCanvas } from '../pixel/PixelCharacterCanvasRenderer'
import { OfficeAgent, OfficeDesk } from '../../../../shared/types'

export interface RoomDefinition {
  id: string
  name: string
  startX: number
  startY: number
  endX: number
  endY: number
  tileType: FloorTileType
}

export const STUDIO_ROOMS: RoomDefinition[] = [
  {
    id: 'director',
    name: "Executive Director's Suite",
    startX: 1,
    startY: 1,
    endX: 6,
    endY: 6,
    tileType: 'wood'
  },
  {
    id: 'bullpen',
    name: 'Open Dev Bullpen',
    startX: 9,
    startY: 1,
    endX: 17,
    endY: 7,
    tileType: 'carpet'
  },
  {
    id: 'lounge',
    name: 'Espresso Lounge & Coffee Bar',
    startX: 1,
    startY: 8,
    endX: 6,
    endY: 12,
    tileType: 'tile'
  },
  {
    id: 'research',
    name: 'Deep Research Lab',
    startX: 9,
    startY: 9,
    endX: 17,
    endY: 13,
    tileType: 'concrete'
  },
  {
    id: 'server',
    name: 'Engine & Vulkan VRAM Servers',
    startX: 1,
    startY: 14,
    endX: 6,
    endY: 18,
    tileType: 'grating'
  },
  {
    id: 'war_room',
    name: 'Holographic War Room',
    startX: 9,
    startY: 15,
    endX: 17,
    endY: 18,
    tileType: 'slate'
  }
]

const FLOOR_MARGIN = 1

export const FLOOR_BOUNDS = STUDIO_ROOMS.reduce(
  (bounds, room) => ({
    minX: Math.min(bounds.minX, room.startX),
    maxX: Math.max(bounds.maxX, room.endX),
    minY: Math.min(bounds.minY, room.startY),
    maxY: Math.max(bounds.maxY, room.endY)
  }),
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
)

const LOOP_MIN_X = FLOOR_BOUNDS.minX - FLOOR_MARGIN
const LOOP_MAX_X = FLOOR_BOUNDS.maxX + FLOOR_MARGIN
const LOOP_MIN_Y = FLOOR_BOUNDS.minY - FLOOR_MARGIN
const LOOP_MAX_Y = FLOOR_BOUNDS.maxY + FLOOR_MARGIN

// ==========================================
// Landmark Grid Positions (Shared with Store)
// ==========================================
export const COFFEE_BAR_GRID = { x: 3, y: 9 }
export const ROUND_TABLE_GRID = { x: 3, y: 11 }
export const WATER_COOLER_GRID = { x: 5, y: 9 }
export const HOLO_TABLE_GRID = { x: 13, y: 17 }
export const WHITEBOARD_GRID = { x: 11, y: 2 }
export const RESEARCH_WHITEBOARD_GRID = { x: 11, y: 10 }
export const FILING_CABINET_GRID = { x: 16, y: 10 }
export const PRINTER_GRID = { x: 16, y: 2 }
export const SERVER_RACK_GRIDS = [
  { x: 2, y: 15 },
  { x: 5, y: 15 }
]
export const BOOKSHELF_GRID = { x: 5, y: 3 }

const SEAT_OFFSET = 1

/** The tile an agent stands on to work a desk, one tile in front of it. */
export function seatForDesk(desk: OfficeDesk): { x: number; y: number } {
  switch (desk.orientation) {
    case 'north':
      return { x: desk.x, y: desk.y - SEAT_OFFSET }
    case 'south':
      return { x: desk.x, y: desk.y + SEAT_OFFSET }
    case 'east':
      return { x: desk.x + SEAT_OFFSET, y: desk.y }
    case 'west':
    default:
      return { x: desk.x - SEAT_OFFSET, y: desk.y }
  }
}

interface RenderItemBase {
  depth: number
  isoX: number
  isoY: number
}

export type RenderItem = RenderItemBase &
  (
    | { type: 'back_wall'; orientation: 'north' | 'west' }
    | { type: 'divider'; orientation: 'north' | 'west' }
    | {
        type: 'desk'
        deskType: DeskType
        screens: number
        isActive: boolean
        agentName?: string
        agentRole?: string
      }
    | { type: 'chair' }
    | { type: 'desk_chair' }
    | {
        type: 'agent'
        agent: OfficeAgent
        isSeated: boolean
        isWalking: boolean
      }
    | { type: 'server' }
    | { type: 'coffee' }
    | { type: 'round_table' }
    | { type: 'holo_table' }
    | { type: 'whiteboard' }
    | { type: 'filing_cabinet' }
    | { type: 'printer' }
    | { type: 'water_cooler' }
    | { type: 'bookshelf' }
    | { type: 'wall_clock' }
    | { type: 'plant' }
    | { type: 'neon_sign' }
  )

export type DecorKey = 'plants' | 'neon_sign' | 'dual_monitors' | 'server_upgrade'

export interface RenderOfficeOptions {
  agents: OfficeAgent[]
  desks: OfficeDesk[]
  isNight: boolean
  animFrame: number
  unlockedDecor?: DecorKey[]
}

/**
 * Main isometric renderer executing painter's order passes.
 */
export function renderIsometricOffice(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  options: RenderOfficeOptions
): void {
  const { agents, desks, isNight, animFrame, unlockedDecor = [] } = options
  const hasDecor = (key: DecorKey) => unlockedDecor.includes(key)

  ctx.clearRect(0, 0, width, height)

  // --------------------------------------------------------------------------
  // Layer 1: Ground Tiles (Zone Materials + 4% Checker Contrast)
  // --------------------------------------------------------------------------
  for (let gx = LOOP_MIN_X; gx <= LOOP_MAX_X; gx++) {
    for (let gy = LOOP_MIN_Y; gy <= LOOP_MAX_Y; gy++) {
      const room = STUDIO_ROOMS.find(
        (r) => gx >= r.startX && gx <= r.endX && gy >= r.startY && gy <= r.endY
      )
      const screen = gridToScreen(gx, gy, 0, originX, originY)
      const isChecker = (gx + gy) % 2 === 0
      drawIsometricTile(ctx, screen.x, screen.y, room?.tileType ?? 'corridor', isNight, isChecker)
    }
  }

  // --------------------------------------------------------------------------
  // Layer 2: Ground Flat Details & Rugs
  // --------------------------------------------------------------------------
  const directorRug = gridToScreen(3, 4, 0, originX, originY)
  drawIsometricRug(
    ctx,
    directorRug.x,
    directorRug.y,
    isNight ? 'rgba(229, 192, 123, 0.12)' : 'rgba(229, 192, 123, 0.2)'
  )

  const loungeRug = gridToScreen(3, 11, 0, originX, originY)
  drawIsometricRug(
    ctx,
    loungeRug.x,
    loungeRug.y,
    isNight ? 'rgba(198, 120, 221, 0.1)' : 'rgba(198, 120, 221, 0.18)'
  )

  // --------------------------------------------------------------------------
  // Layer 3: Build Depth-Sorted Props & Furniture Queue
  // --------------------------------------------------------------------------
  const items: RenderItem[] = []

  // Exterior Solid Architectural Back Walls (North edge gy=1, West edge gx=1)
  for (let gx = FLOOR_BOUNDS.minX; gx <= FLOOR_BOUNDS.maxX; gx++) {
    items.push({
      depth: getDepthSortKey(gx, 1, 0) - 10,
      type: 'back_wall',
      isoX: gx,
      isoY: 1,
      orientation: 'north'
    })
  }
  for (let gy = FLOOR_BOUNDS.minY; gy <= FLOOR_BOUNDS.maxY; gy++) {
    items.push({
      depth: getDepthSortKey(1, gy, 0) - 10,
      type: 'back_wall',
      isoX: 1,
      isoY: gy,
      orientation: 'west'
    })
  }

  // Low Acoustic Planter Dividers between functional zones
  ;[
    { x: 8, y: 2, orientation: 'west' as const },
    { x: 8, y: 4, orientation: 'west' as const },
    { x: 8, y: 6, orientation: 'west' as const },
    { x: 8, y: 10, orientation: 'west' as const },
    { x: 8, y: 12, orientation: 'west' as const },
    { x: 8, y: 16, orientation: 'west' as const }
  ].forEach((div) => {
    items.push({
      depth: getDepthSortKey(div.x, div.y, 0) - 4,
      type: 'divider',
      isoX: div.x,
      isoY: div.y,
      orientation: div.orientation
    })
  })

  // Server Racks
  SERVER_RACK_GRIDS.forEach((pos) => {
    items.push({ depth: getDepthSortKey(pos.x, pos.y, 0), type: 'server', isoX: pos.x, isoY: pos.y })
  })

  // Landmarks
  items.push({
    depth: getDepthSortKey(COFFEE_BAR_GRID.x, COFFEE_BAR_GRID.y, 0),
    type: 'coffee',
    isoX: COFFEE_BAR_GRID.x,
    isoY: COFFEE_BAR_GRID.y
  })
  items.push({
    depth: getDepthSortKey(ROUND_TABLE_GRID.x, ROUND_TABLE_GRID.y, 0),
    type: 'round_table',
    isoX: ROUND_TABLE_GRID.x,
    isoY: ROUND_TABLE_GRID.y
  })
  items.push({
    depth: getDepthSortKey(WATER_COOLER_GRID.x, WATER_COOLER_GRID.y, 0),
    type: 'water_cooler',
    isoX: WATER_COOLER_GRID.x,
    isoY: WATER_COOLER_GRID.y
  })
  items.push({
    depth: getDepthSortKey(HOLO_TABLE_GRID.x, HOLO_TABLE_GRID.y, 0),
    type: 'holo_table',
    isoX: HOLO_TABLE_GRID.x,
    isoY: HOLO_TABLE_GRID.y
  })

  // Hologram Table Chairs
  ;[
    { x: HOLO_TABLE_GRID.x - 1, y: HOLO_TABLE_GRID.y - 0.7 },
    { x: HOLO_TABLE_GRID.x + 1, y: HOLO_TABLE_GRID.y - 0.7 },
    { x: HOLO_TABLE_GRID.x - 1, y: HOLO_TABLE_GRID.y + 0.7 },
    { x: HOLO_TABLE_GRID.x + 1, y: HOLO_TABLE_GRID.y + 0.7 }
  ].forEach((pos) => {
    items.push({ depth: getDepthSortKey(pos.x, pos.y, 0), type: 'chair', isoX: pos.x, isoY: pos.y })
  })

  // Whiteboards & Props
  items.push({
    depth: getDepthSortKey(WHITEBOARD_GRID.x, WHITEBOARD_GRID.y, 0),
    type: 'whiteboard',
    isoX: WHITEBOARD_GRID.x,
    isoY: WHITEBOARD_GRID.y
  })
  items.push({
    depth: getDepthSortKey(RESEARCH_WHITEBOARD_GRID.x, RESEARCH_WHITEBOARD_GRID.y, 0),
    type: 'whiteboard',
    isoX: RESEARCH_WHITEBOARD_GRID.x,
    isoY: RESEARCH_WHITEBOARD_GRID.y
  })
  items.push({
    depth: getDepthSortKey(PRINTER_GRID.x, PRINTER_GRID.y, 0),
    type: 'printer',
    isoX: PRINTER_GRID.x,
    isoY: PRINTER_GRID.y
  })
  items.push({
    depth: getDepthSortKey(FILING_CABINET_GRID.x, FILING_CABINET_GRID.y, 0),
    type: 'filing_cabinet',
    isoX: FILING_CABINET_GRID.x,
    isoY: FILING_CABINET_GRID.y
  })
  items.push({
    depth: getDepthSortKey(BOOKSHELF_GRID.x, BOOKSHELF_GRID.y, 0),
    type: 'bookshelf',
    isoX: BOOKSHELF_GRID.x,
    isoY: BOOKSHELF_GRID.y
  })
  items.push({
    depth: getDepthSortKey(4, 1, 0) - 5,
    type: 'wall_clock',
    isoX: 4,
    isoY: 1
  })

  // Lush Studio Plants
  items.push({ depth: getDepthSortKey(2, 2, 0), type: 'plant', isoX: 2, isoY: 2 })
  items.push({ depth: getDepthSortKey(6, 6, 0), type: 'plant', isoX: 6, isoY: 6 })
  items.push({ depth: getDepthSortKey(9, 7, 0), type: 'plant', isoX: 9, isoY: 7 })
  items.push({ depth: getDepthSortKey(17, 7, 0), type: 'plant', isoX: 17, isoY: 7 })
  items.push({ depth: getDepthSortKey(9, 14, 0), type: 'plant', isoX: 9, isoY: 14 })

  // Progression Decor
  if (hasDecor('neon_sign')) {
    items.push({ depth: getDepthSortKey(13, 1, 0) - 6, type: 'neon_sign', isoX: 13, isoY: 1 })
  }
  if (hasDecor('server_upgrade')) {
    items.push({ depth: getDepthSortKey(3, 18, 0), type: 'server', isoX: 3, isoY: 18 })
  }

  // Workstation Desks & Desk Chairs
  desks.forEach((desk) => {
    const assignedAgent = agents.find((a) => a.deskId === desk.id)
    const isBusy = assignedAgent?.status === 'working' || assignedAgent?.status === 'thinking'
    const deskType: DeskType =
      desk.zone === 'director'
        ? 'executive'
        : desk.zone === 'research'
        ? 'research'
        : desk.zone === 'server'
        ? 'server_console'
        : 'dev'

    const seat = seatForDesk(desk)

    // Add Desk Chair (sorted slightly behind seat position)
    items.push({
      depth: getDepthSortKey(seat.x, seat.y, 0) - 0.15,
      type: 'desk_chair',
      isoX: seat.x,
      isoY: seat.y
    })

    // Add Workstation Desk (surface, monitors, PC tower, keyboard, nameplate)
    items.push({
      depth: getDepthSortKey(desk.x, desk.y, 0),
      type: 'desk',
      isoX: desk.x,
      isoY: desk.y,
      deskType,
      screens: hasDecor('dual_monitors') ? desk.screens + 1 : desk.screens,
      isActive: isBusy,
      agentName: assignedAgent?.name,
      agentRole: assignedAgent?.roleTitle
    })
  })

  // Grounded Agents in depth order
  agents.forEach((agent) => {
    const desk = desks.find((d) => d.id === agent.deskId)
    const seat = desk ? seatForDesk(desk) : { x: agent.position.x, y: agent.position.y }
    const distToSeat = Math.hypot(agent.position.x - seat.x, agent.position.y - seat.y)
    const isWalking = Boolean(agent.targetPosition || (agent.pathWaypoints && agent.pathWaypoints.length > 0))
    const isSeated = distToSeat < 0.35 && !isWalking

    items.push({
      depth: getDepthSortKey(agent.position.x, agent.position.y, 0),
      type: 'agent',
      agent,
      isSeated,
      isWalking,
      isoX: agent.position.x,
      isoY: agent.position.y
    })
  })

  // Sort strictly by depth key (X + Y painter's order)
  items.sort((a, b) => a.depth - b.depth)

  // Check if any agent is brainstorming near whiteboards
  const isBrainstormingNear = (wx: number, wy: number) =>
    agents.some(
      (a) =>
        (a.ambientActivity === 'whiteboard_brainstorm' || a.status === 'thinking') &&
        Math.hypot(a.position.x - wx, a.position.y - wy) < 2.5
    )

  // Render Sorted Props, Furniture & Agents
  items.forEach((item) => {
    const screen = gridToScreen(item.isoX, item.isoY, 0, originX, originY)

    switch (item.type) {
      case 'back_wall':
        drawIsometricBackWall(ctx, screen.x, screen.y, item.orientation, isNight)
        break
      case 'divider':
        drawIsometricDivider(ctx, screen.x, screen.y, item.orientation, isNight)
        break
      case 'desk':
        drawIsometricDesk(ctx, screen.x, screen.y, {
          deskType: item.deskType,
          screens: item.screens,
          isActive: item.isActive,
          isNight,
          animFrame,
          agentName: item.agentName,
          agentRole: item.agentRole,
          skipChair: true
        })
        break
      case 'desk_chair':
        drawErgonomicMeshChair(ctx, screen.x, screen.y, isNight)
        break
      case 'chair':
        drawIsometricChair(ctx, screen.x, screen.y)
        break
      case 'agent':
        drawPixelCharacterSpriteCanvas(ctx, screen.x, screen.y, item.agent, {
          isSeated: item.isSeated,
          isWalking: item.isWalking,
          walkFrame: item.agent.walkFrame,
          animFrame,
          isNight
        })
        break
      case 'server':
        drawIsometricServerRack(ctx, screen.x, screen.y, animFrame, isNight)
        break
      case 'coffee':
        drawIsometricCoffeeBar(ctx, screen.x, screen.y, animFrame)
        break
      case 'round_table':
        drawIsometricRoundTable(ctx, screen.x, screen.y)
        break
      case 'holo_table':
        drawIsometricHoloTable(ctx, screen.x, screen.y, animFrame, isNight)
        break
      case 'whiteboard':
        drawIsometricWhiteboard(
          ctx,
          screen.x,
          screen.y,
          animFrame,
          isBrainstormingNear(item.isoX, item.isoY)
        )
        break
      case 'filing_cabinet':
        drawIsometricFilingCabinet(ctx, screen.x, screen.y)
        break
      case 'printer':
        drawIsometricPrinter(ctx, screen.x, screen.y)
        break
      case 'water_cooler':
        drawIsometricWaterCooler(ctx, screen.x, screen.y, animFrame)
        break
      case 'bookshelf':
        drawIsometricBookshelf(ctx, screen.x, screen.y)
        break
      case 'wall_clock':
        drawIsometricWallClock(ctx, screen.x, screen.y)
        break
      case 'plant':
        drawIsometricPlant(ctx, screen.x, screen.y, isNight)
        break
      case 'neon_sign':
        drawIsometricNeonSign(ctx, screen.x, screen.y, animFrame, isNight)
        break
    }
  })

  // --------------------------------------------------------------------------
  // Layer 4: Dynamic Ambient Lighting Pools
  // --------------------------------------------------------------------------
  desks.forEach((desk) => {
    const assignedAgent = agents.find((a) => a.deskId === desk.id)
    const isBusy = assignedAgent?.status === 'working' || assignedAgent?.status === 'thinking'
    const screen = gridToScreen(desk.x, desk.y, 0, originX, originY)

    ctx.save()
    // Warm Desk Lamp Light Cone
    const lampGlow = ctx.createRadialGradient(screen.x, screen.y + 6, 2, screen.x, screen.y + 6, 36)
    lampGlow.addColorStop(0, isNight ? 'rgba(240, 200, 120, 0.22)' : 'rgba(240, 200, 120, 0.12)')
    lampGlow.addColorStop(1, 'rgba(240, 200, 120, 0)')
    ctx.fillStyle = lampGlow
    ctx.beginPath()
    ctx.ellipse(screen.x, screen.y + 6, 36, 18, 0, 0, Math.PI * 2)
    ctx.fill()

    // Dynamic Screen Surface Glow when agent is computing
    if (isBusy) {
      const screenGlow = ctx.createRadialGradient(screen.x, screen.y - 4, 2, screen.x, screen.y - 4, 44)
      screenGlow.addColorStop(
        0,
        isNight ? 'rgba(97, 175, 239, 0.32)' : 'rgba(97, 175, 239, 0.18)'
      )
      screenGlow.addColorStop(1, 'rgba(97, 175, 239, 0)')
      ctx.fillStyle = screenGlow
      ctx.beginPath()
      ctx.ellipse(screen.x, screen.y - 4, 44, 22, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  })

  // Ambient Night Multiply Pass
  if (isNight) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = 'rgba(10, 12, 20, 0.42)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
}

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useOfficeStore } from '../../../stores/officeStore'
import {
  STUDIO_ROOMS,
  seatForDesk,
  COFFEE_BAR_GRID,
  ROUND_TABLE_GRID,
  WATER_COOLER_GRID,
  HOLO_TABLE_GRID,
  WHITEBOARD_GRID,
  RESEARCH_WHITEBOARD_GRID,
  FILING_CABINET_GRID,
  PRINTER_GRID,
  BOOKSHELF_GRID,
  SERVER_RACK_GRIDS
} from './IsometricFloorRenderer'

function roomFor(id: string) {
  return STUDIO_ROOMS.find((r) => r.id === id)
}

function withinRoom(point: { x: number; y: number }, room: (typeof STUDIO_ROOMS)[number]): boolean {
  return point.x >= room.startX && point.x <= room.endX && point.y >= room.startY && point.y <= room.endY
}

function withinAnyRoom(point: { x: number; y: number }): boolean {
  return STUDIO_ROOMS.some((room) => withinRoom(point, room))
}

describe('office floor coordinate integrity', () => {
  beforeEach(() => {
    useOfficeStore.getState().resetToDefaults()
  })

  it('every desk sits inside the room matching its zone', () => {
    const desks = useOfficeStore.getState().desks
    expect(desks.length).toBeGreaterThan(0)

    desks.forEach((desk) => {
      const room = roomFor(desk.zone)
      expect(room, `desk "${desk.id}" has zone "${desk.zone}" with no matching room`).toBeDefined()
      expect(
        withinRoom(desk, room!),
        `desk "${desk.id}" at (${desk.x}, ${desk.y}) falls outside room "${desk.zone}" (${room!.startX}-${room!.endX}, ${room!.startY}-${room!.endY})`
      ).toBe(true)
    })
  })

  it('every seat sits inside the same room as its desk', () => {
    const desks = useOfficeStore.getState().desks

    desks.forEach((desk) => {
      const room = roomFor(desk.zone)
      const seat = seatForDesk(desk)
      expect(
        withinRoom(seat, room!),
        `seat for desk "${desk.id}" at (${seat.x}, ${seat.y}) falls outside room "${desk.zone}"`
      ).toBe(true)
    })
  })

  it('every starter agent spawns inside its assigned desk room', () => {
    const { agents, desks } = useOfficeStore.getState()

    agents.forEach((agent) => {
      const desk = desks.find((d) => d.id === agent.deskId)
      expect(desk, `agent "${agent.id}" references unknown desk "${agent.deskId}"`).toBeDefined()
      const room = roomFor(desk!.zone)
      expect(
        withinRoom(agent.position, room!),
        `agent "${agent.id}" at (${agent.position.x}, ${agent.position.y}) falls outside room "${desk!.zone}"`
      ).toBe(true)
    })
  })

  it('every shared landmark sits inside the floor footprint', () => {
    const landmarks = [
      COFFEE_BAR_GRID,
      ROUND_TABLE_GRID,
      WATER_COOLER_GRID,
      HOLO_TABLE_GRID,
      WHITEBOARD_GRID,
      RESEARCH_WHITEBOARD_GRID,
      FILING_CABINET_GRID,
      PRINTER_GRID,
      BOOKSHELF_GRID,
      ...SERVER_RACK_GRIDS
    ]

    landmarks.forEach((point) => {
      expect(
        withinAnyRoom(point),
        `landmark at (${point.x}, ${point.y}) does not fall inside any studio room`
      ).toBe(true)
    })
  })

  it('rooms tile the floor without overlapping each other', () => {
    for (let i = 0; i < STUDIO_ROOMS.length; i++) {
      for (let j = i + 1; j < STUDIO_ROOMS.length; j++) {
        const a = STUDIO_ROOMS[i]
        const b = STUDIO_ROOMS[j]
        const overlaps = a.startX <= b.endX && a.endX >= b.startX && a.startY <= b.endY && a.endY >= b.startY
        expect(overlaps, `rooms "${a.id}" and "${b.id}" overlap`).toBe(false)
      }
    }
  })
})

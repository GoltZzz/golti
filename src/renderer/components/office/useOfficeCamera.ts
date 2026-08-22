import { useCallback, useRef, useState } from 'react'
import { gridToScreen, getDepthSortKey } from './isometric/IsometricProjection'
import { FLOOR_BOUNDS } from './isometric/IsometricFloorRenderer'

export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 1.8
const FIT_MARGIN = 0.88

export interface WorldPoint {
  x: number
  y: number
}

export interface CameraProjection {
  x: number
  y: number
  depth: number
}

export interface OfficeCamera {
  pan: WorldPoint
  zoom: number
  isDragging: boolean
  /** World-space (store) position to CSS pixel position within the viewport. */
  worldToScreen: (pos: WorldPoint, zOffset?: number) => CameraProjection
  setZoom: (updater: (prev: number) => number) => void
  zoomBy: (delta: number) => void
  /** Recomputes pan + zoom so the whole floor is centred in the given viewport. */
  fitToViewport: (viewportWidth: number, viewportHeight: number) => void
  reset: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  /** Returns the click point when the gesture was a click rather than a drag. */
  onMouseUp: (e: React.MouseEvent) => WorldPoint | null
  onWheel: (e: React.WheelEvent) => void
}

const CLICK_SLOP_PX = 5

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

function computeFit(viewportWidth: number, viewportHeight: number): { pan: WorldPoint; zoom: number } {
  const corners = [
    gridToScreen(FLOOR_BOUNDS.minX, FLOOR_BOUNDS.minY, 0, 0, 0),
    gridToScreen(FLOOR_BOUNDS.maxX, FLOOR_BOUNDS.minY, 0, 0, 0),
    gridToScreen(FLOOR_BOUNDS.minX, FLOOR_BOUNDS.maxY, 0, 0, 0),
    gridToScreen(FLOOR_BOUNDS.maxX, FLOOR_BOUNDS.maxY, 0, 0, 0)
  ]
  const minX = Math.min(...corners.map((c) => c.x))
  const maxX = Math.max(...corners.map((c) => c.x))
  const minY = Math.min(...corners.map((c) => c.y))
  const maxY = Math.max(...corners.map((c) => c.y))

  const boxWidth = Math.max(1, maxX - minX)
  const boxHeight = Math.max(1, maxY - minY)

  const zoom = clampZoom(
    Math.min(viewportWidth / boxWidth, viewportHeight / boxHeight) * FIT_MARGIN
  )

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    zoom,
    pan: {
      x: viewportWidth / (2 * zoom) - centerX,
      y: viewportHeight / (2 * zoom) - centerY
    }
  }
}

const INITIAL_FIT = computeFit(900, 600)

/**
 * Single source of truth for the office viewport.
 *
 * The canvas draws the world already scaled by `zoom` and offset by `pan`, so
 * DOM chrome layered on top must apply the same transform or the two drift
 * apart. Both go through `worldToScreen`.
 */
export function useOfficeCamera(): OfficeCamera {
  const [pan, setPan] = useState<WorldPoint>(INITIAL_FIT.pan)
  const [zoom, setZoomState] = useState(INITIAL_FIT.zoom)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const lastViewportRef = useRef({ width: 900, height: 600 })

  const worldToScreen = useCallback(
    (pos: WorldPoint, zOffset = 0): CameraProjection => {
      const screen = gridToScreen(pos.x, pos.y, zOffset, pan.x, pan.y)
      return {
        x: screen.x * zoom,
        y: screen.y * zoom,
        depth: getDepthSortKey(pos.x, pos.y)
      }
    },
    [pan.x, pan.y, zoom]
  )

  const setZoom = useCallback((updater: (prev: number) => number) => {
    setZoomState((prev) => clampZoom(updater(prev)))
  }, [])

  const zoomBy = useCallback((delta: number) => {
    setZoomState((prev) => clampZoom(prev + delta))
  }, [])

  const fitToViewport = useCallback((viewportWidth: number, viewportHeight: number) => {
    if (viewportWidth <= 0 || viewportHeight <= 0) return
    lastViewportRef.current = { width: viewportWidth, height: viewportHeight }
    const fit = computeFit(viewportWidth, viewportHeight)
    setPan(fit.pan)
    setZoomState(fit.zoom)
  }, [])

  const reset = useCallback(() => {
    const { width, height } = lastViewportRef.current
    const fit = computeFit(width, height)
    setPan(fit.pan)
    setZoomState(fit.zoom)
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      setIsDragging(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    },
    [pan.x, pan.y]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const dx = (e.clientX - dragStartRef.current.x) / zoom
      const dy = (e.clientY - dragStartRef.current.y) / zoom
      setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy })
    },
    [isDragging, zoom]
  )

  const onMouseUp = useCallback(
    (e: React.MouseEvent): WorldPoint | null => {
      if (!isDragging) return null
      setIsDragging(false)

      const travelled = Math.hypot(
        e.clientX - dragStartRef.current.x,
        e.clientY - dragStartRef.current.y
      )
      if (travelled >= CLICK_SLOP_PX) return null

      const rect = e.currentTarget.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom
      }
    },
    [isDragging, zoom]
  )

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setZoomState((prev) => clampZoom(prev * factor))
  }, [])

  return {
    pan,
    zoom,
    isDragging,
    worldToScreen,
    setZoom,
    zoomBy,
    fitToViewport,
    reset,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel
  }
}

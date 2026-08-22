import React, { useRef, useEffect, useCallback } from 'react'
import { Maximize2, Minimize2, RotateCcw, Sun, Moon } from 'lucide-react'
import { useOfficeStore } from '../../stores/officeStore'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { renderIsometricOffice, WHITEBOARD_GRID } from './isometric/IsometricFloorRenderer'
import { gridToScreen } from './isometric/IsometricProjection'
import { useOfficeCamera } from './useOfficeCamera'
import { OfficeFloorLayer } from './OfficeFloorLayer'

const WHITEBOARD_HIT_RADIUS = 36
const SIM_STEP_MS = 33 // Cap at ~30fps for high efficiency

interface OfficeFloorCanvasProps {
  hoveredTaskId?: string | null
}

export const OfficeFloorCanvas: React.FC<OfficeFloorCanvasProps> = ({
  hoveredTaskId
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef(0)
  const lastDrawnStateRef = useRef<string>('')

  const agents = useOfficeStore((s) => s.agents)
  const desks = useOfficeStore((s) => s.desks)
  const tasks = useOfficeStore((s) => s.tasks)
  const envelopes = useOfficeStore((s) => s.envelopes)
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId)
  const lightingMode = useOfficeStore((s) => s.lightingMode)
  const isSimulationActive = useOfficeStore((s) => s.isSimulationActive)
  const unlockedDecor = useOfficeStore((s) => s.unlockedDecor)
  const setSelectedAgentId = useOfficeStore((s) => s.setSelectedAgentId)
  const toggleLightingMode = useOfficeStore((s) => s.toggleLightingMode)

  const camera = useOfficeCamera()
  const reducedMotion = useReducedMotion()
  const isNight = lightingMode === 'night'

  // Determine highlighted agent from hovered task in TaskRail
  const hoveredTask = tasks.find((t) => t.id === hoveredTaskId)
  const highlightedAgentId = hoveredTask?.assignedAgentId || null

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const { zoom } = camera
    ctx.save()
    ctx.scale(zoom, zoom)
    renderIsometricOffice(
      ctx,
      canvas.width / zoom,
      canvas.height / zoom,
      camera.pan.x,
      camera.pan.y,
      {
        agents: useOfficeStore.getState().agents,
        desks: useOfficeStore.getState().desks,
        isNight,
        animFrame: animFrameRef.current,
        unlockedDecor
      }
    )
    ctx.restore()
  }, [camera, isNight, unlockedDecor])

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const updateSize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      camera.fitToViewport(container.clientWidth, container.clientHeight)
      draw()
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw, camera.fitToViewport])

  // Redraw when state dependencies change
  useEffect(() => {
    draw()
  }, [draw, agents, desks, unlockedDecor, isNight])

  /**
   * 30fps capped rAF loop with motion-detection dirty checking.
   * Redraws only when motion/active generation is running or when dirty.
   */
  useEffect(() => {
    if (reducedMotion) {
      if (useOfficeStore.getState().hasPendingMotion()) {
        useOfficeStore.getState().tick({ snap: true })
      }
      draw()
      return
    }

    if (!isSimulationActive) return

    let raf = 0
    let lastStep = 0

    const frame = (now: number) => {
      const store = useOfficeStore.getState()
      const hasMotion = store.hasPendingMotion()
      const hasActiveWork = store.agents.some(
        (a) => a.status === 'working' || a.status === 'thinking' || a.status === 'meeting'
      )

      if (now - lastStep >= SIM_STEP_MS) {
        lastStep = now

        if (hasMotion) {
          store.tick()
        }

        if (hasMotion || hasActiveWork) {
          animFrameRef.current += 1
          draw()
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [isSimulationActive, reducedMotion, draw])

  const handleMouseUp = (e: React.MouseEvent) => {
    const click = camera.onMouseUp(e)
    if (!click) return

    // Deselect if clicked on empty floor
    setSelectedAgentId(null)
  }

  const workingCount = agents.filter(
    (a) => a.status === 'working' || a.status === 'thinking'
  ).length
  const floorSummary = `Studio floor. ${agents.length} agents, ${workingCount} currently active. Agents are listed as buttons within this region.`

  return (
    <div className="office-stage">
      <div
        ref={containerRef}
        className={`office-viewport ${camera.isDragging ? 'is-dragging' : ''}`}
        onMouseDown={camera.onMouseDown}
        onMouseMove={camera.onMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={camera.onWheel}
        data-lighting={lightingMode}
        role="group"
        aria-label="Isometric studio floor"
      >
        <canvas
          ref={canvasRef}
          className="office-floor-canvas"
          role="img"
          aria-label={floorSummary}
        />

        <OfficeFloorLayer
          agents={agents}
          envelopes={envelopes}
          selectedAgentId={selectedAgentId}
          highlightedAgentId={highlightedAgentId}
          camera={camera}
          reducedMotion={reducedMotion}
          onSelectAgent={setSelectedAgentId}
        />

        <div className="office-camera-hud">
          <button
            className="office-btn"
            onClick={toggleLightingMode}
            title={isNight ? 'Switch to daylight' : 'Switch to neon night'}
            aria-label={isNight ? 'Switch to daylight' : 'Switch to neon night'}
          >
            {isNight ? (
              <Moon size={11} color="var(--accent-cyan)" />
            ) : (
              <Sun size={11} color="var(--accent-yellow)" />
            )}
          </button>
          <button
            className="office-btn"
            onClick={() => camera.zoomBy(0.15)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Maximize2 size={11} />
          </button>
          <button
            className="office-btn"
            onClick={() => camera.zoomBy(-0.15)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minimize2 size={11} />
          </button>
          <button
            className="office-btn"
            onClick={camera.reset}
            title="Reset camera"
            aria-label="Reset camera"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

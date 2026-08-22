import React, { useRef } from 'react'
import { OfficeAgent, OfficeEnvelope } from '../../../shared/types'
import { AgentAvatar } from './AgentAvatar'
import { OfficeEnvelopeLayer } from './OfficeEnvelopeLayer'
import { OfficeCamera } from './useOfficeCamera'

interface OfficeFloorLayerProps {
  agents: OfficeAgent[]
  envelopes: OfficeEnvelope[]
  selectedAgentId: string | null
  hoveredTaskId?: string | null
  highlightedAgentId?: string | null
  camera: OfficeCamera
  reducedMotion: boolean
  onSelectAgent: (id: string) => void
}

export const OfficeFloorLayer: React.FC<OfficeFloorLayerProps> = ({
  agents,
  envelopes,
  selectedAgentId,
  highlightedAgentId,
  camera,
  reducedMotion,
  onSelectAgent
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Roving focus: arrow keys walk through agent avatars in order
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const buttons = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>('.agent-node') ?? []
    )
    if (buttons.length === 0) return
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (current === -1) return
    e.preventDefault()
    const next =
      e.key === 'ArrowRight'
        ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length
    buttons[next].focus()
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)
  const seatHighlight = selectedAgent ? camera.worldToScreen(selectedAgent.position) : null

  const highlightedAgent = agents.find((a) => a.id === highlightedAgentId)
  const taskLinkedHighlight = highlightedAgent ? camera.worldToScreen(highlightedAgent.position) : null

  return (
    <div className="office-floor-layer" ref={containerRef} onKeyDown={handleKeyDown}>
      <OfficeEnvelopeLayer
        envelopes={envelopes}
        zoom={camera.zoom}
        reducedMotion={reducedMotion}
        worldToScreen={camera.worldToScreen}
      />

      {/* Selected Seat Highlight */}
      {seatHighlight && (
        <div
          className="office-seat-highlight"
          style={{
            left: seatHighlight.x,
            top: seatHighlight.y,
            transform: `translate(-50%, -50%) scale(${camera.zoom})`,
            zIndex: Math.round(seatHighlight.depth)
          }}
          aria-hidden="true"
        />
      )}

      {/* Task-Rail Linked Hover Highlight */}
      {taskLinkedHighlight && !seatHighlight && (
        <div
          className="office-seat-highlight highlight-linked"
          style={{
            left: taskLinkedHighlight.x,
            top: taskLinkedHighlight.y,
            transform: `translate(-50%, -50%) scale(${camera.zoom})`,
            zIndex: Math.round(taskLinkedHighlight.depth)
          }}
          aria-hidden="true"
        />
      )}

      {/* Agents Avatars */}
      {agents.map((agent) => {
        const point = camera.worldToScreen(agent.position, 0.12)
        const isHighlighted = highlightedAgentId === agent.id

        return (
          <AgentAvatar
            key={agent.id}
            agent={agent}
            isSelected={selectedAgentId === agent.id}
            isHighlighted={isHighlighted}
            screenX={point.x}
            screenY={point.y}
            depth={point.depth}
            zoom={camera.zoom}
            reducedMotion={reducedMotion}
            onSelect={() => onSelectAgent(agent.id)}
          />
        )
      })}
    </div>
  )
}

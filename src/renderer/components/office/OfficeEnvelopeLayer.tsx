import React from 'react'
import { OfficeEnvelope } from '../../../shared/types'
import { CameraProjection } from './useOfficeCamera'

interface OfficeEnvelopeLayerProps {
  envelopes: OfficeEnvelope[]
  zoom: number
  reducedMotion: boolean
  worldToScreen: (pos: { x: number; y: number }, zOffset?: number) => CameraProjection
}

const ENVELOPE_TINT: Record<OfficeEnvelope['type'], string> = {
  task_delegation: 'var(--accent-yellow)',
  code_review: 'var(--accent-purple)',
  research_data: 'var(--accent-cyan)',
  chat_ping: 'var(--accent-blue)',
  status_update: 'var(--accent-green)'
}

export const OfficeEnvelopeLayer: React.FC<OfficeEnvelopeLayerProps> = ({
  envelopes,
  zoom,
  reducedMotion,
  worldToScreen
}) => {
  if (envelopes.length === 0) return null

  return (
    <>
      {envelopes.map((env) => {
        const t = reducedMotion ? 0.5 : env.progress
        const world = {
          x: env.fromPos.x + (env.toPos.x - env.fromPos.x) * t,
          y: env.fromPos.y + (env.toPos.y - env.fromPos.y) * t
        }

        // Parabolic arc with bounce at arrival
        let arcHeight = 0
        if (!reducedMotion) {
          if (env.progress < 0.85) {
            arcHeight = Math.sin((env.progress / 0.85) * Math.PI) * 1.6
          } else {
            // Small bounce at destination
            const bounceT = (env.progress - 0.85) / 0.15
            arcHeight = Math.sin(bounceT * Math.PI) * 0.35
          }
        }

        const point = worldToScreen(world, arcHeight)
        const ground = worldToScreen(world)
        const tint = ENVELOPE_TINT[env.type] || 'var(--accent-yellow)'

        return (
          <React.Fragment key={env.id}>
            {!reducedMotion && (
              <div
                className="office-envelope-shadow"
                style={{
                  left: ground.x,
                  top: ground.y,
                  transform: `translate(-50%, -50%) scale(${zoom})`,
                  zIndex: Math.round(ground.depth)
                }}
                aria-hidden="true"
              />
            )}

            {/* Particle Trail */}
            {!reducedMotion && env.progress > 0.1 && (
              <div
                className="office-envelope-trail"
                style={{
                  left: point.x - 4,
                  top: point.y + 4,
                  transform: `translate(-50%, -50%) scale(${zoom})`,
                  zIndex: Math.round(ground.depth),
                  backgroundColor: tint
                }}
                aria-hidden="true"
              />
            )}

            <div
              className="office-envelope-item"
              style={{
                left: point.x,
                top: point.y,
                transform: `translate(-50%, -50%) scale(${zoom})`,
                zIndex: Math.round(ground.depth) + 1,
                backgroundColor: tint,
                boxShadow: `0 0 10px ${tint}, 0 2px 6px rgba(0, 0, 0, 0.5)`
              }}
              title={env.message}
              aria-hidden="true"
            />
          </React.Fragment>
        )
      })}
    </>
  )
}

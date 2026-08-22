import React, { useEffect, useState } from 'react'
import { Coffee, Brain, Sparkles, Zap, AlertTriangle } from 'lucide-react'
import { OfficeAgent } from '../../../shared/types'
import { PixelCharacterSprite } from './pixel/PixelCharacterSprite'

export { PixelCharacterSprite }

interface AgentAvatarProps {
  agent: OfficeAgent
  isSelected: boolean
  isHighlighted?: boolean
  screenX: number
  screenY: number
  depth: number
  zoom: number
  reducedMotion: boolean
  onSelect: () => void
}

const STATUS_LABEL: Record<OfficeAgent['status'], string> = {
  idle: 'idle',
  working: 'working',
  thinking: 'thinking',
  break: 'on break',
  meeting: 'in a meeting',
  error: 'errored'
}

function StatusBubble({ agent }: { agent: OfficeAgent }): React.ReactElement | null {
  if (!agent.statusMessage && agent.status === 'idle') return null

  switch (agent.status) {
    case 'working':
      return (
        <div className="agent-thought-bubble">
          <Zap size={10} color="var(--accent-blue)" />
          <span>{agent.statusMessage || 'Executing task'}</span>
        </div>
      )
    case 'thinking':
      return (
        <div className="agent-thought-bubble">
          <Brain size={10} color="var(--accent-yellow)" />
          <span>{agent.statusMessage || 'Reasoning & planning'}</span>
        </div>
      )
    case 'break':
      return (
        <div className="agent-thought-bubble">
          <Coffee size={10} color="var(--accent-green)" />
          <span>{agent.statusMessage || 'Coffee recharge ☕'}</span>
        </div>
      )
    case 'meeting':
      return (
        <div className="agent-thought-bubble">
          <Sparkles size={10} color="var(--accent-purple)" />
          <span>Holographic sync</span>
        </div>
      )
    case 'error':
      return (
        <div className="agent-thought-bubble" style={{ borderColor: 'var(--status-error)' }}>
          <AlertTriangle size={10} color="var(--status-error)" />
          <span style={{ color: 'var(--status-error)' }}>{agent.statusMessage || 'Failed'}</span>
        </div>
      )
    default:
      return null
  }
}

/**
 * 16/32-Bit Isometric Pixel Character Sprite.
 */
export function CharacterSprite({
  agent,
  reducedMotion,
  scale,
  className
}: {
  agent: OfficeAgent
  reducedMotion: boolean
  scale?: number
  className?: string
}): React.ReactElement {
  return (
    <PixelCharacterSprite
      agent={agent}
      reducedMotion={reducedMotion}
      scale={scale}
      className={className}
    />
  )
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  agent,
  isSelected,
  isHighlighted = false,
  screenX,
  screenY,
  depth,
  zoom,
  reducedMotion,
  onSelect
}) => {
  const [xpDelta, setXpDelta] = useState<number | null>(null)
  const [prevXp, setPrevXp] = useState(agent.xp)
  const [prevLevel, setPrevLevel] = useState(agent.level)

  // Trigger floating XP effect when XP increases
  useEffect(() => {
    if (agent.xp > prevXp) {
      const diff = agent.xp - prevXp
      setXpDelta(diff)
      const timer = setTimeout(() => setXpDelta(null), 1800)
      setPrevXp(agent.xp)
      return () => clearTimeout(timer)
    } else if (agent.xp !== prevXp) {
      setPrevXp(agent.xp)
    }
  }, [agent.xp, prevXp])

  // Trigger level up floater
  useEffect(() => {
    if (agent.level > prevLevel) {
      setXpDelta(999) // Marker for level up
      const timer = setTimeout(() => setXpDelta(null), 2200)
      setPrevLevel(agent.level)
      return () => clearTimeout(timer)
    }
  }, [agent.level, prevLevel])

  // Token budget arc calculation
  const budgetRatio =
    agent.tokenBudget > 0 ? Math.max(0, 1 - agent.tokensUsed / agent.tokenBudget) : 1
  const radius = 7
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - budgetRatio)

  const label = `${agent.name}, ${agent.roleTitle}, level ${agent.level}, ${
    STATUS_LABEL[agent.status]
  }${agent.statusMessage ? `: ${agent.statusMessage}` : ''}`

  return (
    <button
      type="button"
      className={`agent-node status-${agent.status} ${isSelected ? 'is-selected' : ''} ${
        isHighlighted ? 'is-highlighted' : ''
      }`}
      style={{
        left: screenX,
        top: screenY,
        zIndex: Math.round(depth),
        transform: `translate(-50%, -100%) scale(${zoom})`
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-pressed={isSelected}
      aria-label={label}
    >
      {/* Floating Status / Thought Bubble */}
      <StatusBubble agent={agent} />

      {/* Floating XP Gain / Level Up */}
      {xpDelta !== null && !reducedMotion && (
        <div className="office-xp-floater" aria-hidden="true">
          {xpDelta === 999 ? `🎉 Level ${agent.level}!` : `+${xpDelta} XP`}
        </div>
      )}

      {/* Interactive Hit Box Aligned to Canvas Sprite */}
      <div className="agent-ring-container">
        <svg className="agent-status-ring-svg" viewBox="0 0 20 20">
          <circle className="agent-ring-base" cx="10" cy="10" r={radius} />
          <circle
            className="agent-ring-budget"
            cx="10"
            cy="10"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            stroke={budgetRatio < 0.2 ? 'var(--status-error)' : 'var(--accent-green)'}
          />
          <circle className="agent-ring-dot" cx="10" cy="10" r="3.5" />
        </svg>

        <div className="agent-sprite-hitbox" style={{ width: 32, height: 48 }} aria-hidden="true" />
      </div>

      {/* Desk Nameplate / Tag Stack */}
      <div className="agent-nameplate">
        <div className="agent-name-badge">
          <span className="agent-level-tag">L{agent.level}</span>
          <span>{agent.name}</span>
        </div>
        <div className="agent-role-pill">{agent.roleTitle}</div>
      </div>
    </button>
  )
}

import React from 'react'
import { useChatStore } from '../../stores/chatStore'

interface UsageMeterProps {
  compact?: boolean
}

export const UsageMeter: React.FC<UsageMeterProps> = ({ compact }) => {
  const budget = useChatStore((s) => s.tokenBudget)
  if (!budget) return null

  const pct = Math.min(100, Math.round((budget.usedTokens / Math.max(1, budget.contextWindow)) * 100))
  const level = budget.overflow ? 'is-over' : pct >= 80 ? 'is-warn' : ''

  if (compact) {
    return (
      <div className="usage-meter-inline" title={`${budget.usedTokens} / ${budget.contextWindow} tokens`}>
        <div className="usage-meter-bar" aria-hidden>
          <div className={`usage-meter-fill ${level}`} style={{ width: `${pct}%` }} />
        </div>
        <span>
          {budget.usedTokens}/{budget.contextWindow}
        </span>
      </div>
    )
  }

  return (
    <div className="usage-breakdown">
      <div className="usage-row">
        <span className="usage-row-label">Context window</span>
        <span className="usage-row-value">{budget.contextWindow}</span>
      </div>
      <div className="usage-total-bar" aria-hidden>
        <div className={`usage-total-fill ${level}`} style={{ width: `${pct}%` }} />
      </div>
      {budget.items.map((item) => (
        <div key={item.id} className="usage-row">
          <span className="usage-row-label">{item.label}</span>
          <span className="usage-row-value">{item.tokens}</span>
        </div>
      ))}
      <div className="usage-row">
        <span className="usage-row-label">Available</span>
        <span className="usage-row-value">{budget.availableTokens}</span>
      </div>
      {budget.overflow && (
        <p className="inspector-empty" style={{ color: 'var(--accent-yellow)' }}>
          Over budget. Disable context items or shorten the draft before sending.
        </p>
      )}
    </div>
  )
}

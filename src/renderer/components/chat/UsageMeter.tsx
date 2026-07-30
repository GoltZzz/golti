import React, { useState } from 'react'
import { Cpu, Info } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

interface UsageMeterProps {
  compact?: boolean
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

export const UsageMeter: React.FC<UsageMeterProps> = ({ compact }) => {
  const budget = useChatStore((s) => s.tokenBudget)
  const [showPopover, setShowPopover] = useState(false)

  if (!budget) return null

  const pct = Math.min(100, Math.round((budget.usedTokens / Math.max(1, budget.contextWindow)) * 100))
  const level = budget.overflow ? 'is-over' : pct >= 80 ? 'is-warn' : 'is-ok'

  if (compact) {
    return (
      <div className="usage-meter-container">
        <button
          type="button"
          className="usage-meter-inline"
          onClick={() => setShowPopover(!showPopover)}
          onMouseEnter={() => setShowPopover(true)}
          onMouseLeave={() => setShowPopover(false)}
          title={`Context Window: ${fmtNum(budget.usedTokens)} of ${fmtNum(budget.contextWindow)} tokens used (${pct}%)`}
          aria-label={`Context token usage: ${fmtNum(budget.usedTokens)} of ${fmtNum(budget.contextWindow)} tokens (${pct}%)`}
        >
          <div className="usage-meter-bar" aria-hidden>
            <div className={`usage-meter-fill ${level}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="usage-meter-text">
            {fmtNum(budget.usedTokens)} / {fmtNum(budget.contextWindow)} ({pct}%)
          </span>
        </button>

        {showPopover && (
          <div className="usage-popover animate-fade-in">
            <div className="usage-popover-header">
              <div className="usage-popover-title">
                <Cpu size={13} />
                <span>Context Window Allocation</span>
              </div>
              <span className={`usage-popover-badge ${level}`}>
                {budget.overflow ? 'OVERFLOW' : `${pct}% Used`}
              </span>
            </div>

            <div className="usage-total-bar" aria-hidden>
              <div className={`usage-total-fill ${level}`} style={{ width: `${pct}%` }} />
            </div>

            <div className="usage-popover-list">
              <div className="usage-popover-row">
                <span className="usage-row-label">Context Limit</span>
                <span className="usage-row-value">{fmtNum(budget.contextWindow)} tok</span>
              </div>
              {budget.items.map((item) => (
                <div key={item.id} className="usage-popover-row">
                  <span className="usage-row-label">{item.label}</span>
                  <span className="usage-row-value">{fmtNum(item.tokens)} tok</span>
                </div>
              ))}
              <div className="usage-popover-row is-divider">
                <span className="usage-row-label">Available Remaining</span>
                <span className="usage-row-value text-cyan">{fmtNum(Math.max(0, budget.availableTokens))} tok</span>
              </div>
            </div>

            {budget.overflow && (
              <div className="usage-popover-warning">
                <Info size={12} />
                <span>Message exceeds model context window. Remove attached context items or shorten draft.</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="usage-breakdown">
      <div className="usage-row">
        <span className="usage-row-label">Context window</span>
        <span className="usage-row-value">{fmtNum(budget.contextWindow)}</span>
      </div>
      <div className="usage-total-bar" aria-hidden>
        <div className={`usage-total-fill ${level}`} style={{ width: `${pct}%` }} />
      </div>
      {budget.items.map((item) => (
        <div key={item.id} className="usage-row">
          <span className="usage-row-label">{item.label}</span>
          <span className="usage-row-value">{fmtNum(item.tokens)}</span>
        </div>
      ))}
      <div className="usage-row">
        <span className="usage-row-label">Available</span>
        <span className="usage-row-value">{fmtNum(budget.availableTokens)}</span>
      </div>
      {budget.overflow && (
        <p className="inspector-empty" style={{ color: 'var(--accent-yellow)' }}>
          Over budget. Disable context items or shorten the draft before sending.
        </p>
      )}
    </div>
  )
}

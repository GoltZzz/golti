import React, { useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronRight, Copy, Check, RefreshCw } from 'lucide-react'
import { estimateTokens } from '../../../shared/chat-utils'

interface ThinkingBlockProps {
  reasoningContent: string
  isStreaming?: boolean
  durationMs?: number
  onRethink?: () => void
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  reasoningContent,
  isStreaming = false,
  durationMs,
  onRethink
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(isStreaming)
  const [copied, setCopied] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  // Auto expand when streaming starts, auto collapse when streaming finishes
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true)
    } else {
      setIsExpanded(false)
    }
  }, [isStreaming])

  // Live timer while streaming
  useEffect(() => {
    if (!isStreaming) return
    const start = Date.now() - elapsedMs
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start)
    }, 100)
    return () => clearInterval(interval)
  }, [isStreaming])

  const formattedTime = (ms: number) => {
    const seconds = (ms / 1000).toFixed(1)
    return `${seconds}s`
  }

  const copyThought = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(reasoningContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tokenCount = estimateTokens(reasoningContent)

  return (
    <div className={`thinking-block ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div
        className="thinking-header"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded(!isExpanded)
          }
        }}
      >
        <div className="thinking-title">
          <Brain size={14} className={`thinking-icon ${isStreaming ? 'pulse' : ''}`} />
          <span>
            {isStreaming
              ? 'Thinking…'
              : durationMs
                ? `Thought for ${formattedTime(durationMs)}`
                : elapsedMs > 0
                  ? `Thought for ${formattedTime(elapsedMs)}`
                  : 'Thought process'}
          </span>
          {isStreaming && (
            <span className="thinking-timer">{formattedTime(elapsedMs)}</span>
          )}
          {!isStreaming && tokenCount > 0 && (
            <span className="thinking-badge">{tokenCount} tokens</span>
          )}
        </div>

        <div className="thinking-actions">
          {reasoningContent && (
            <button
              className="thinking-action-btn"
              onClick={copyThought}
              title="Copy thought process"
              aria-label="Copy thought process"
            >
              {copied ? <Check size={12} color="#98c379" /> : <Copy size={12} />}
            </button>
          )}

          {onRethink && !isStreaming && (
            <button
              className="thinking-action-btn"
              onClick={(e) => {
                e.stopPropagation()
                onRethink()
              }}
              title="Re-think / Expand reasoning"
              aria-label="Re-think"
            >
              <RefreshCw size={12} />
            </button>
          )}

          <button
            className="thinking-toggle-btn"
            aria-label={isExpanded ? 'Collapse thought process' : 'Expand thought process'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="thinking-body animate-fade-in">
          <pre className="thinking-text">{reasoningContent}</pre>
        </div>
      )}
    </div>
  )
}

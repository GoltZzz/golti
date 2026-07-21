import React, { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useShallow } from 'zustand/react/shallow'
import {
  Copy,
  Check,
  Bot,
  User,
  Pencil,
  RefreshCw,
  Square,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Search,
  BookOpen,
  ExternalLink,
  Loader2,
  AlertCircle
} from 'lucide-react'
import type { Message } from '../../../shared/types'
import { useChatStore } from '../../stores/chatStore'
import { useInspectorStore } from '../../stores/inspectorStore'
import { getSiblings } from '../../../shared/chat-utils'

import { useSettingsStore } from '../../stores/settingsStore'
import { ThinkingBlock } from './ThinkingBlock'

interface MessageBubbleProps {
  message: Message
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message }) => {
  const isUser = message.role === 'user'
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)

  const showThinkingProcess = useSettingsStore((s) => s.settings?.showThinkingProcess ?? true)

  const regenerate = useChatStore((s) => s.regenerate)
  const editAndResend = useChatStore((s) => s.editAndResend)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const selectBranch = useChatStore((s) => s.selectBranch)
  const stopGeneration = useChatStore((s) => s.stopGeneration)
  const isGenerating = useChatStore((s) => s.isGenerating)
  
  const messageCitations = useChatStore(
    useShallow((s) => s.citations.filter((c) => c.messageId === message.id))
  )
  const messageShells = useChatStore(
    useShallow((s) => s.artifacts.filter((a) => a.messageId === message.id))
  )
  const siblings = useChatStore(
    useShallow((s) => getSiblings(s.messages, message.id))
  )
  const searchStatus = useChatStore((s) => s.searchStatusByMessageId[message.id])
  const researchProgress = useChatStore((s) => s.researchProgressByMessageId[message.id])

  const { selectShell } = useInspectorStore()

  const siblingIndex = Math.max(0, siblings.findIndex((s) => s.id === message.id))
  const isDeepResearchMsg = message.isDeepResearch || Boolean(researchProgress)

  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedCodeIndex(index)
    setTimeout(() => setCopiedCodeIndex(null), 2000)
  }

  const handleRethink = () => {
    sendMessage('Please expand on your reasoning process step-by-step.')
  }

  return (
    <div className="msg">
      <div className={`msg-row ${isUser ? 'is-user' : 'is-assistant'}`}>
        {!isUser && (
          <div className="msg-avatar is-assistant" aria-hidden>
            <Bot size={16} />
          </div>
        )}

        <div className="msg-body">
          {!isUser && message.reasoningContent && showThinkingProcess && (
            <ThinkingBlock
              reasoningContent={message.reasoningContent}
              isStreaming={message.isStreaming}
              durationMs={message.thinkingDurationMs}
              onRethink={handleRethink}
            />
          )}

          {editing ? (
            <div className="msg-edit-box">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                aria-label="Edit message"
              />
              <div className="msg-edit-actions">
                <button className="chat-ghost-btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button
                  className="primary-btn"
                  onClick={() => {
                    setEditing(false)
                    editAndResend(message.id, editText.trim())
                  }}
                  disabled={!editText.trim() || isGenerating}
                >
                  Save & resend
                </button>
              </div>
            </div>
          ) : (
            <div className="msg-content" data-selectable>
              {message.isStreaming && !message.content ? (
                <div style={{ display: 'flex', gap: 4, padding: '6px 0' }}>
                  <span className="dot-flashing" />
                  <span className="dot-flashing" />
                  <span className="dot-flashing" />
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeText = String(children).replace(/\n$/, '')
                      const index = codeText.length + (match?.[1]?.length || 0)

                      if (!inline) {
                        const lang = match ? match[1] : 'code'
                        return (
                          <div className="msg-code-block">
                            <div className="msg-code-header">
                              <span style={{ fontWeight: 600, textTransform: 'lowercase', letterSpacing: '0.02em' }}>{lang}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => {
                                    const sh = messageShells.find(
                                      (a) => a.content === codeText || a.language === lang
                                    )
                                    if (sh) selectShell(sh.id)
                                  }}
                                  title="Open in Shell"
                                >
                                  <FileCode2 size={12} /> Shell
                                </button>
                                <button onClick={() => handleCopyCode(codeText, index)}>
                                  {copiedCodeIndex === index ? (
                                    <>
                                      <Check size={12} color="#98c379" /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} /> Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <pre>
                              <code>{children}</code>
                            </pre>
                          </div>
                        )
                      }

                      return (
                        <code className="msg-inline-code" {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </div>
          )}

          {!isUser && researchProgress && (
            <div className="research-panel animate-fade-in">
              <div className="research-header">
                <Search size={14} className="research-icon" />
                <span className="research-title">Deep Research Plan</span>
              </div>
              {researchProgress.plan?.reasoning && (
                <p className="research-reasoning">{researchProgress.plan.reasoning}</p>
              )}
              <div className="research-steps">
                {researchProgress.steps.map((step) => (
                  <div key={step.stepIndex} className={`research-step is-${step.status}`}>
                    <span className="research-step-status">
                      {step.status === 'searching' && <Loader2 size={12} className="spin text-cyan" />}
                      {step.status === 'reading' && <Loader2 size={12} className="spin text-yellow" />}
                      {step.status === 'done' && <Check size={12} className="text-green" />}
                      {step.status === 'error' && <AlertCircle size={12} className="text-red" />}
                      {step.status === 'pending' && <span className="step-dot" />}
                    </span>
                    <span className="research-step-query">{step.query}</span>
                    {step.status === 'done' && step.sourcesFound > 0 && (
                      <span className="research-step-count">{step.sourcesFound} sources</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isUser && searchStatus && !researchProgress && (
            <div
              className={`search-status is-${searchStatus.state}`}
              role="status"
              style={{
                marginTop: 8,
                fontSize: 12,
                color:
                  searchStatus.state === 'error'
                    ? 'var(--accent-primary)'
                    : searchStatus.state === 'success'
                      ? 'var(--accent-cyan)'
                      : 'var(--text-muted)'
              }}
            >
              {searchStatus.state === 'searching' && (searchStatus.message || 'Searching the web…')}
              {searchStatus.state === 'success' && (searchStatus.message || 'Sources found')}
              {searchStatus.state === 'no-results' && (searchStatus.message || 'No sources found')}
              {searchStatus.state === 'skipped' && (searchStatus.message || 'No live lookup needed')}
              {searchStatus.state === 'error' &&
                (searchStatus.message || 'Search is temporarily unavailable')}
            </div>
          )}

          {messageCitations.length > 0 && (
            isDeepResearchMsg ? (
              <details className="research-sources-details">
                <summary className="research-sources-summary">
                  <BookOpen size={13} />
                  <span>Sources ({messageCitations.length})</span>
                </summary>
                <div className="research-sources-list">
                  {messageCitations.map((c) => (
                    <a
                      key={c.id}
                      className="research-source-card"
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="research-source-title">
                        {c.rank ? `[${c.rank}] ` : ''}
                        {c.title}
                        <ExternalLink size={11} style={{ marginLeft: 4, opacity: 0.7 }} />
                      </div>
                      {c.snippet && (
                        <p className="research-source-snippet">{c.snippet}</p>
                      )}
                    </a>
                  ))}
                </div>
              </details>
            ) : (
              <div className="citation-chips">
                {messageCitations.map((c) => (
                  <a
                    key={c.id}
                    className="citation-chip"
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    title={c.snippet}
                  >
                    {c.rank ? `[${c.rank}] ` : ''}
                    {c.title}
                  </a>
                ))}
              </div>
            )
          )}

          {(message.tokensIn || message.tokensOut || siblings.length > 1) && (
            <div className="msg-meta">
              {siblings.length > 1 && (
                <div className="branch-picker">
                  <button
                    disabled={siblingIndex <= 0}
                    onClick={() => selectBranch(siblings[siblingIndex - 1].id)}
                    aria-label="Previous branch"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span>
                    {siblingIndex + 1}/{siblings.length}
                  </span>
                  <button
                    disabled={siblingIndex >= siblings.length - 1}
                    onClick={() => selectBranch(siblings[siblingIndex + 1].id)}
                    aria-label="Next branch"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              {(message.tokensIn || message.tokensOut) && (
                <span>
                  {message.tokensIn ? `${message.tokensIn} in` : ''}
                  {message.tokensIn && message.tokensOut ? ' · ' : ''}
                  {message.tokensOut ? `${message.tokensOut} out` : ''}
                </span>
              )}
            </div>
          )}

          {!editing && (
            <div className={`msg-actions ${message.isStreaming ? 'is-open' : ''}`}>
              {isUser && (
                <button
                  className="msg-action-btn"
                  title="Edit"
                  aria-label="Edit message"
                  onClick={() => {
                    setEditText(message.content)
                    setEditing(true)
                  }}
                  disabled={isGenerating}
                >
                  <Pencil size={14} />
                </button>
              )}
              {!isUser && !message.isStreaming && (
                <button
                  className="msg-action-btn"
                  title="Regenerate"
                  aria-label="Regenerate"
                  onClick={() => regenerate(message.id)}
                  disabled={isGenerating}
                >
                  <RefreshCw size={14} />
                </button>
              )}
              {message.isStreaming && (
                <button
                  className="msg-action-btn"
                  title="Stop"
                  aria-label="Stop generation"
                  onClick={() => stopGeneration()}
                >
                  <Square size={14} />
                </button>
              )}
              <button
                className="msg-action-btn"
                title="Copy"
                aria-label="Copy message"
                onClick={() => navigator.clipboard.writeText(message.content)}
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </div>

        {isUser && (
          <div className="msg-avatar is-user" aria-hidden>
            <User size={16} />
          </div>
        )}
      </div>
    </div>
  )
})

MessageBubble.displayName = 'MessageBubble'

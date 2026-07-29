import React, { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useShallow } from 'zustand/react/shallow'
import {
  Copy,
  Check,
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
  AlertCircle,
  CornerDownRight,
  CornerDownLeft,
  ChevronDown,
  X,
  Cpu
} from 'lucide-react'
import { EggLogo } from '../brand/EggLogo'
import type { Message } from '../../../shared/types'
import { getResearchPhaseLabel } from '../../../shared/research-progress'
import { useChatStore } from '../../stores/chatStore'
import { useInspectorStore } from '../../stores/inspectorStore'
import {
  getSiblings,
  parseEngineMemoryError,
  extractAskUser,
  stripAskUser,
  stripSearchRequests,
  splitStreamingAskUser
} from '../../../shared/chat-utils'
import type { AskUserPrompt } from '../../../shared/chat-utils'
import { isTruncated } from '../../../shared/finish-reason'
import { parseModelDisplay } from '../../../shared/model-display'

import { useSettingsStore } from '../../stores/settingsStore'
import { ThinkingBlock } from './ThinkingBlock'
import { EngineMemoryErrorCard } from './EngineMemoryErrorCard'

interface MessageBubbleProps {
  message: Message
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message }) => {
  const isUser = message.role === 'user'
  const truncated = !isUser && !message.isStreaming && isTruncated(message.finishReason)
  const modelDisplay = useMemo(
    () => (!isUser && message.model ? parseModelDisplay(message.model) : null),
    [isUser, message.model]
  )
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)

  const showThinkingProcess = useSettingsStore((s) => s.settings?.showThinkingProcess ?? true)

  const regenerate = useChatStore((s) => s.regenerate)
  const continueMessage = useChatStore((s) => s.continueMessage)
  const editAndResend = useChatStore((s) => s.editAndResend)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const selectBranch = useChatStore((s) => s.selectBranch)
  const stopGeneration = useChatStore((s) => s.stopGeneration)
  const isGenerating = useChatStore((s) => s.isGenerating)
  const createOrSelectShell = useChatStore((s) => s.createOrSelectShell)
  
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
  const researchPhaseLabel = researchProgress ? getResearchPhaseLabel(researchProgress) : null
  const isResearchActive =
    Boolean(researchProgress) &&
    researchProgress!.phase !== 'done' &&
    researchProgress!.phase !== 'error'

  const { cleanContent, extractedReasoning } = useMemo(() => {
    if (isUser) {
      return { cleanContent: message.displayContent || message.content, extractedReasoning: '' }
    }
    if (!message.content) {
      return { cleanContent: message.content, extractedReasoning: '' }
    }
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi
    if (!thinkRegex.test(message.content)) {
      return { cleanContent: message.content, extractedReasoning: '' }
    }
    let reasoning = ''
    const clean = message.content
      .replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, (_, r) => {
        if (r.trim()) reasoning += (reasoning ? '\n' : '') + r.trim()
        return ''
      })
      .trimStart()
    return { cleanContent: clean, extractedReasoning: reasoning }
  }, [isUser, message.content, message.displayContent])

  const effectiveReasoning = message.reasoningContent || extractedReasoning

  const memoryErrorDetails = useMemo(() => {
    if (isUser) return null
    return parseEngineMemoryError(message.content || message.error, message.model)
  }, [isUser, message.content, message.error, message.model])

  const askUser = useMemo(
    () => (isUser || message.isStreaming ? null : extractAskUser(cleanContent)),
    [isUser, message.isStreaming, cleanContent]
  )

  const streamingAsk = useMemo(
    () =>
      !isUser && message.isStreaming
        ? splitStreamingAskUser(cleanContent)
        : { visible: cleanContent, asking: false },
    [isUser, message.isStreaming, cleanContent]
  )

  const displayCleanContent = useMemo(() => {
    if (!cleanContent) return ''
    let text = stripSearchRequests(askUser ? stripAskUser(cleanContent) : streamingAsk.visible)
    if (memoryErrorDetails?.isMemoryError) {
      text = text
        .replace(/\n*\*\[Error:.*?\]\*/gi, '')
        .replace(/\[Error:.*?\]/gi, '')
        .trim()
    }
    return text
  }, [cleanContent, memoryErrorDetails, askUser, streamingAsk])

  const answerAskUser = (answer: string) => {
    const text = answer.trim()
    if (text && !isGenerating) sendMessage(text)
  }

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
            <EggLogo size={16} />
          </div>
        )}

        <div className="msg-body">
          {!isUser && effectiveReasoning && showThinkingProcess && (
            <ThinkingBlock
              reasoningContent={effectiveReasoning}
              isStreaming={message.isStreaming}
              durationMs={message.thinkingDurationMs}
              onRethink={handleRethink}
            />
          )}

          {!isUser && researchProgress && (
            <div className="research-panel animate-fade-in">
              <div className="research-header">
                <Search size={14} className={`research-icon ${isResearchActive ? 'pulse' : ''}`} />
                <span className={`research-title ${isResearchActive ? 'research-title-live' : ''}`}>
                  {researchPhaseLabel}
                </span>
              </div>
              {researchProgress.plan?.reasoning && researchProgress.phase !== 'planning' && (
                <p className="research-reasoning">{researchProgress.plan.reasoning}</p>
              )}
              {researchProgress.phase === 'planning' && researchProgress.steps.length === 0 && (
                <p className="research-status" role="status">
                  Breaking the topic into search queries…
                </p>
              )}
              {researchProgress.steps.length > 0 && (
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
                      {step.status === 'error' && step.error && (
                        <span className="research-step-error" title={step.error}>
                          {step.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {researchProgress.phase === 'synthesizing' && message.isStreaming && !cleanContent && (
                <p className="research-status" role="status">
                  Synthesizing findings into a report…
                </p>
              )}
            </div>
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
              {message.isStreaming && !cleanContent ? (
                researchProgress ? null : (
                  <div style={{ display: 'flex', gap: 4, padding: '6px 0' }}>
                    <span className="dot-flashing" />
                    <span className="dot-flashing" />
                    <span className="dot-flashing" />
                  </div>
                )
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      let rawText = String(children).replace(/\n$/, '')
                      let lang = match ? match[1] : 'code'

                      if (
                        lang === 'code' ||
                        rawText.trim().startsWith('mermaid\n') ||
                        /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)/i.test(
                          rawText.trim()
                        )
                      ) {
                        if (
                          rawText.trim().startsWith('mermaid\n') ||
                          /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)/i.test(
                            rawText.trim()
                          )
                        ) {
                          lang = 'mermaid'
                          if (rawText.trim().startsWith('mermaid\n')) {
                            rawText = rawText.trim().slice(8).trimStart()
                          }
                        }
                      }

                      const codeText = rawText
                      const index = codeText.length + (match?.[1]?.length || 0)

                      if (!inline) {
                        return (
                          <div className="msg-code-block">
                            <div className="msg-code-header">
                              <span style={{ fontWeight: 600, textTransform: 'lowercase', letterSpacing: '0.02em' }}>{lang}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="chat-ghost-btn"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: 'var(--accent-primary, #818cf8)',
                                    fontSize: 11,
                                    padding: '2px 6px'
                                  }}
                                  onClick={() => {
                                    const title =
                                      lang === 'mermaid'
                                        ? 'Mermaid Diagram'
                                        : lang === 'html' || lang === 'svg'
                                          ? `${lang.toUpperCase()} Canvas`
                                          : `${lang.toUpperCase()} Document`
                                    createOrSelectShell({
                                      conversationId: message.conversationId,
                                      messageId: message.id,
                                      title,
                                      language: lang,
                                      content: codeText,
                                      type: lang === 'markdown' || lang === 'md' ? 'markdown' : 'code'
                                    })
                                  }}
                                  title="Open in Shell Canvas"
                                >
                                  <FileCode2 size={12} /> Open in Shell Canvas
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
                  {displayCleanContent}
                </ReactMarkdown>
              )}

              {streamingAsk.asking && (
                <div className="ask-user-pending" role="status">
                  <Loader2 size={13} className="spin" />
                  <span>Asking…</span>
                </div>
              )}

              {askUser && <AskUserCard prompt={askUser} disabled={isGenerating} onAnswer={answerAskUser} />}

              {memoryErrorDetails?.isMemoryError && (
                <EngineMemoryErrorCard
                  details={memoryErrorDetails}
                  onRetry={() => regenerate(message.id)}
                />
              )}
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

          {truncated && (
            <div className="msg-truncated" role="status">
              <AlertCircle size={14} aria-hidden="true" />
              <span className="msg-truncated-text">
                Response hit the output token limit and stopped early.
              </span>
              <button
                className="msg-truncated-btn"
                onClick={() => continueMessage(message.id)}
                disabled={isGenerating}
              >
                <CornerDownRight size={13} aria-hidden="true" />
                Continue
              </button>
            </div>
          )}

          {(message.tokensIn || message.tokensOut || siblings.length > 1 || modelDisplay) && (
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
              {modelDisplay && (
                <span className="msg-model-badge" title={message.model}>
                  <Cpu size={11} />
                  <span className="msg-model-name">{modelDisplay.displayName}</span>
                </span>
              )}
              {modelDisplay && (message.tokensIn || message.tokensOut) && (
                <span className="msg-meta-sep">·</span>
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
                onClick={() => navigator.clipboard.writeText(cleanContent || message.content)}
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

interface AskUserCardProps {
  prompt: AskUserPrompt
  disabled: boolean
  onAnswer: (answer: string) => void
}

const AskUserCard: React.FC<AskUserCardProps> = ({ prompt, disabled, onAnswer }) => {
  const [freeText, setFreeText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [otherOpen, setOtherOpen] = useState(prompt.options.length === 0)
  const [answered, setAnswered] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const otherIndex = prompt.options.length + 1

  const submit = (value: string) => {
    const text = value.trim()
    if (disabled || answered || !text) return
    setAnswered(true)
    onAnswer(text)
  }

  const chooseOption = (label: string) => {
    if (disabled || answered) return
    setOtherOpen(false)
    setSelected(label)
    submit(label)
  }

  const chooseOther = () => {
    if (disabled || answered) return
    setSelected(null)
    setOtherOpen(true)
  }

  useEffect(() => {
    if (disabled || answered || dismissed || collapsed) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const n = Number(e.key)
      if (!n) return
      if (n === otherIndex) {
        e.preventDefault()
        chooseOther()
      } else if (n >= 1 && n <= prompt.options.length) {
        e.preventDefault()
        chooseOption(prompt.options[n - 1].label)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (dismissed) return null

  const canSubmit = otherOpen ? Boolean(freeText.trim()) : Boolean(selected)

  return (
    <div className="ask-user-card" data-answered={answered}>
      <div className="ask-user-head">
        <div className="ask-user-question">{prompt.question}</div>
        <div className="ask-user-head-actions">
          <button
            className="ask-user-icon-btn"
            type="button"
            aria-label={collapsed ? 'Expand question' : 'Collapse question'}
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronDown size={14} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
          </button>
          <button
            className="ask-user-icon-btn"
            type="button"
            aria-label="Dismiss question"
            onClick={() => setDismissed(true)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="ask-user-options">
            {prompt.options.map((opt, i) => (
              <button
                key={opt.label}
                className="ask-user-option"
                type="button"
                disabled={disabled || answered}
                aria-pressed={selected === opt.label}
                data-selected={selected === opt.label}
                onClick={() => chooseOption(opt.label)}
              >
                <span className="ask-user-option-text">
                  <span className="ask-user-option-label">{opt.label}</span>
                  {opt.description && (
                    <span className="ask-user-option-desc">{opt.description}</span>
                  )}
                </span>
                <span className="ask-user-option-key">{i + 1}</span>
              </button>
            ))}

            {prompt.allowFreeText && (
              <button
                className="ask-user-option is-other"
                type="button"
                disabled={disabled || answered}
                data-selected={otherOpen}
                onClick={chooseOther}
              >
                <span className="ask-user-option-text">
                  <span className="ask-user-option-label">Other</span>
                </span>
                {prompt.options.length > 0 && (
                  <span className="ask-user-option-key">{otherIndex}</span>
                )}
              </button>
            )}
          </div>

          {prompt.allowFreeText && otherOpen && (
            <form
              className="ask-user-freeform"
              onSubmit={(e) => {
                e.preventDefault()
                submit(freeText)
              }}
            >
              <input
                className="ask-user-input"
                value={freeText}
                autoFocus
                disabled={disabled || answered}
                placeholder="Type your own answer here"
                onChange={(e) => setFreeText(e.target.value)}
              />
            </form>
          )}

          <div className="ask-user-foot">
            <button
              className="ask-user-skip"
              type="button"
              disabled={disabled || answered}
              onClick={() => setDismissed(true)}
            >
              Skip
            </button>
            <button
              className="ask-user-submit"
              type="button"
              disabled={disabled || answered || !canSubmit}
              onClick={() => submit(otherOpen ? freeText : selected || '')}
            >
              Submit <CornerDownLeft size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

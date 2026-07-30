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
  Cpu,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Undo2
} from 'lucide-react'
import { EggLogo } from '../brand/EggLogo'
import type { Message } from '../../../shared/types'
import { getResearchPhaseLabel } from '../../../shared/research-progress'
import { useChatStore } from '../../stores/chatStore'
import { useInspectorStore } from '../../stores/inspectorStore'
import {
  getSiblings,
  getBranchPath,
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

  const allMessages = useChatStore((s) => s.messages)

  const askUser = useMemo(
    () => (isUser || message.isStreaming ? null : extractAskUser(cleanContent)),
    [isUser, message.isStreaming, cleanContent]
  )

  const askUserHistory = useMemo(() => {
    if (isUser || !allMessages.length || !message) return { questionNumber: 1, history: [] }
    const branch = getBranchPath(allMessages, message.id)
    const askUserList: Array<{ assistantMsgId: string; userMsgId?: string; prompt: AskUserPrompt; userResponse?: string }> = []

    for (let i = 0; i < branch.length; i++) {
      const m = branch[i]
      if (m.role === 'assistant') {
        const parsed = extractAskUser(m.content || '')
        if (parsed) {
          const nextUser = branch[i + 1]?.role === 'user' ? branch[i + 1] : undefined
          askUserList.push({
            assistantMsgId: m.id,
            userMsgId: nextUser?.id,
            prompt: parsed,
            userResponse: nextUser?.displayContent || nextUser?.content
          })
        }
      }
    }

    const currentIndex = askUserList.findIndex((item) => item.assistantMsgId === message.id)
    const questionNumber = currentIndex >= 0 ? currentIndex + 1 : Math.max(1, askUserList.length)
    const pastHistory = currentIndex >= 0 ? askUserList.slice(0, currentIndex) : askUserList

    return {
      questionNumber,
      history: pastHistory.filter((item): item is { assistantMsgId: string; userMsgId: string; prompt: AskUserPrompt; userResponse: string } => Boolean(item.userMsgId && item.userResponse))
    }
  }, [allMessages, message.id, isUser, message.content])

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

              {askUser && (
                <AskUserCard
                  prompt={askUser}
                  questionNumber={askUserHistory.questionNumber}
                  history={askUserHistory.history}
                  disabled={isGenerating}
                  onAnswer={answerAskUser}
                  onRevise={(userMsgId) => {
                    const target = allMessages.find((m) => m.id === userMsgId)
                    if (target) {
                      const newAns = window.prompt(`Revise your previous answer:`, target.displayContent || target.content)
                      if (newAns !== null && newAns.trim() && newAns.trim() !== (target.displayContent || target.content)) {
                        editAndResend(userMsgId, newAns.trim())
                      }
                    }
                  }}
                />
              )}

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

interface GmConfidenceProps {
  confidence?: number
  isConclusion?: boolean
}

const GmConfidence: React.FC<GmConfidenceProps> = ({ confidence, isConclusion }) => {
  if (confidence === undefined) return null
  const level = Math.min(5, Math.max(1, confidence))
  const label = isConclusion ? 'Understood' : `Understanding ${level}/5`

  return (
    <div className="gm-confidence" title={`Understanding level: ${level} of 5`}>
      <span className="gm-confidence-label">{label}</span>
      <span className="gm-confidence-dots" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className="gm-confidence-dot"
            data-filled={n <= level}
            data-level={level}
          />
        ))}
      </span>
    </div>
  )
}

interface GmSummaryCardProps {
  summary: AskUserPrompt['summary']
}

const GmSummaryCard: React.FC<GmSummaryCardProps> = ({ summary }) => {
  if (!summary) return null
  const { decisions, assumptions, tradeoffs } = summary

  return (
    <div className="gm-summary">
      {decisions && decisions.length > 0 && (
        <div className="gm-summary-section">
          <div className="gm-summary-section-title">
            <Check size={12} className="gm-summary-icon gm-summary-icon--decision" />
            <span>Decisions & Requirements</span>
          </div>
          <div className="gm-summary-grid">
            {decisions.map((d, i) => (
              <div key={i} className="gm-summary-item">
                <span className="gm-summary-key">{d.label}</span>
                <span className="gm-summary-val">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {assumptions && assumptions.length > 0 && (
        <div className="gm-summary-section">
          <div className="gm-summary-section-title">
            <HelpCircle size={12} className="gm-summary-icon gm-summary-icon--assumption" />
            <span>Stated Assumptions</span>
          </div>
          <div className="gm-summary-grid">
            {assumptions.map((a, i) => (
              <div key={i} className="gm-summary-item">
                <span className="gm-summary-key">{a.label}</span>
                <span className="gm-summary-val">{a.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tradeoffs && tradeoffs.length > 0 && (
        <div className="gm-summary-section">
          <div className="gm-summary-section-title">
            <RotateCcw size={12} className="gm-summary-icon gm-summary-icon--tradeoff" />
            <span>Trade-offs & Balance</span>
          </div>
          <div className="gm-summary-tradeoffs">
            {tradeoffs.map((t, i) => (
              <div key={i} className="gm-tradeoff-card">
                <div className="gm-tradeoff-row">
                  <span className="gm-tradeoff-chosen">{t.chosen}</span>
                  <span className="gm-tradeoff-vs">over</span>
                  <span className="gm-tradeoff-over">{t.over}</span>
                </div>
                {t.reason && <div className="gm-tradeoff-reason">{t.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface AskUserCardProps {
  prompt: AskUserPrompt
  questionNumber: number
  history: Array<{ assistantMsgId: string; userMsgId: string; prompt: AskUserPrompt; userResponse: string }>
  disabled: boolean
  onAnswer: (answer: string) => void
  onRevise: (userMsgId: string) => void
}

const AskUserCard: React.FC<AskUserCardProps> = ({
  prompt,
  questionNumber,
  history,
  disabled,
  onAnswer,
  onRevise
}) => {
  const [freeText, setFreeText] = useState('')
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set())
  const [otherOpen, setOtherOpen] = useState((prompt.options || []).length === 0)
  const [answered, setAnswered] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showRevise, setShowRevise] = useState(false)

  const options = prompt.options || []
  const otherIndex = options.length + 1
  const isMulti = Boolean(prompt.multiSelect)

  const submit = (value: string) => {
    const text = value.trim()
    if (disabled || answered || !text) return
    setAnswered(true)
    onAnswer(text)
  }

  const toggleOption = (label: string) => {
    if (disabled || answered) return
    setOtherOpen(false)

    if (isMulti) {
      const next = new Set(selectedSet)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      setSelectedSet(next)
    } else {
      setSelectedSet(new Set([label]))
      submit(label)
    }
  }

  const chooseOther = () => {
    if (disabled || answered) return
    setSelectedSet(new Set())
    setOtherOpen(true)
  }

  const submitMulti = () => {
    if (disabled || answered) return
    if (otherOpen) {
      submit(freeText)
    } else {
      const selectedList = options
        .map((o) => o.label)
        .filter((l) => selectedSet.has(l))
      if (selectedList.length > 0) {
        submit(selectedList.join('; '))
      }
    }
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
      } else if (n >= 1 && n <= options.length) {
        e.preventDefault()
        toggleOption(options[n - 1].label)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (dismissed) return null

  const canSubmit = otherOpen ? Boolean(freeText.trim()) : selectedSet.size > 0
  const confidence = prompt.confidence
  const isConclusion = prompt.type === 'summary' || confidence === 5
  const aspectClass = prompt.aspect
    ? `gm-aspect--${prompt.aspect.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : ''

  return (
    <div
      className={`gm-card ${isConclusion ? 'gm-card--summary' : ''} ask-user-card`}
      data-answered={answered}
      data-multi-select={isMulti}
      data-conclusion={isConclusion || undefined}
    >
      <div className="gm-header ask-user-head">
        <div className="gm-header-left ask-user-question">
          {prompt.aspect && (
            <span className={`gm-aspect-pill ${aspectClass}`}>
              {prompt.aspect}
            </span>
          )}
          <GmConfidence confidence={confidence} isConclusion={isConclusion} />
          <span className="gm-question-badge">Q{questionNumber}</span>
        </div>

        <div className="gm-header-actions ask-user-head-actions">
          <button
            className="gm-icon-btn ask-user-icon-btn"
            type="button"
            aria-label={collapsed ? 'Expand card' : 'Collapse card'}
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronDown size={14} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
          </button>
          <button
            className="gm-icon-btn ask-user-icon-btn"
            type="button"
            aria-label="Dismiss card"
            onClick={() => setDismissed(true)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {prompt.reasoning && (
            <details className="gm-reasoning">
              <summary className="gm-reasoning-summary">
                <HelpCircle size={12} />
                <span>Why I'm asking this</span>
              </summary>
              <p className="gm-reasoning-text">{prompt.reasoning}</p>
            </details>
          )}

          {prompt.assumptions && prompt.assumptions.length > 0 && (
            <div className="gm-assumptions-banner">
              <div className="gm-assumptions-header">
                <Sparkles size={12} />
                <span>Assumptions I'm making:</span>
              </div>
              <ul className="gm-assumptions-list">
                {prompt.assumptions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="gm-question-row">
            <span className="gm-question-text ask-user-question-text">{prompt.question}</span>
            {isMulti && <span className="gm-multi-badge ask-user-multi-badge">Select all that apply</span>}
          </div>

          {prompt.type === 'summary' && prompt.summary && (
            <GmSummaryCard summary={prompt.summary} />
          )}

          {options.length > 0 && (
            <div className="gm-options-container ask-user-options">
              {options.map((opt, i) => {
                const isSelected = selectedSet.has(opt.label)
                return (
                  <button
                    key={opt.label}
                    className="gm-option-card ask-user-option"
                    type="button"
                    disabled={disabled || answered}
                    aria-pressed={isSelected}
                    data-selected={isSelected}
                    data-recommended={opt.recommended}
                    onClick={() => toggleOption(opt.label)}
                  >
                    <span className="gm-option-indicator ask-user-option-indicator">
                      {isMulti ? (
                        <span className={`gm-checkbox ask-user-checkbox ${isSelected ? 'is-checked' : ''}`}>
                          {isSelected && <Check size={10} />}
                        </span>
                      ) : (
                        <span className={`gm-radio ask-user-radio ${isSelected ? 'is-checked' : ''}`} />
                      )}
                    </span>

                    <span className="gm-option-content ask-user-option-text">
                      <span className="gm-option-label-row ask-user-option-label-row">
                        <span className="gm-option-label ask-user-option-label">{opt.label}</span>
                        {opt.recommended && (
                          <span className="gm-recommended-badge ask-user-recommended-badge">Recommended</span>
                        )}
                      </span>

                      {opt.recommendedRationale && (
                        <span className="gm-recommended-rationale">
                          {opt.recommendedRationale}
                        </span>
                      )}

                      {opt.description && (
                        <span className="gm-option-desc ask-user-option-desc">{opt.description}</span>
                      )}
                    </span>

                    <span className="gm-option-key ask-user-option-key">{i + 1}</span>
                  </button>
                )
              })}

              {prompt.allowFreeText && (
                <button
                  className="gm-option-card ask-user-option is-other"
                  type="button"
                  disabled={disabled || answered}
                  data-selected={otherOpen}
                  onClick={chooseOther}
                >
                  <span className="gm-option-indicator ask-user-option-indicator">
                    {isMulti ? (
                      <span className={`gm-checkbox ask-user-checkbox ${otherOpen ? 'is-checked' : ''}`}>
                        {otherOpen && <Check size={10} />}
                      </span>
                    ) : (
                      <span className={`gm-radio ask-user-radio ${otherOpen ? 'is-checked' : ''}`} />
                    )}
                  </span>
                  <span className="gm-option-content ask-user-option-text">
                    <span className="gm-option-label ask-user-option-label">Other / custom answer</span>
                  </span>
                  {options.length > 0 && <span className="gm-option-key ask-user-option-key">{otherIndex}</span>}
                </button>
              )}
            </div>
          )}

          {prompt.allowFreeText && (otherOpen || options.length === 0) && (
            <form
              className="gm-freeform-form ask-user-freeform"
              onSubmit={(e) => {
                e.preventDefault()
                submit(freeText)
              }}
            >
              <input
                className="gm-freeform-input ask-user-input"
                value={freeText}
                autoFocus
                disabled={disabled || answered}
                placeholder="Type your custom response…"
                onChange={(e) => setFreeText(e.target.value)}
              />
            </form>
          )}

          <div className="gm-footer ask-user-foot">
            <div className="gm-footer-left">
              {history.length > 0 && (
                <div className="gm-revise-wrapper">
                  <button
                    className="gm-btn gm-btn--ghost"
                    type="button"
                    disabled={disabled || answered}
                    onClick={() => setShowRevise((v) => !v)}
                  >
                    <Undo2 size={12} />
                    <span>Revise Previous</span>
                  </button>

                  {showRevise && (
                    <div className="gm-revise-popover">
                      <div className="gm-revise-popover-header">
                        <span>Select a question to revise:</span>
                        <button
                          type="button"
                          className="gm-icon-btn"
                          onClick={() => setShowRevise(false)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="gm-revise-popover-list">
                        {history.map((hItem, idx) => (
                          <button
                            key={hItem.assistantMsgId}
                            className="gm-revise-item"
                            type="button"
                            onClick={() => {
                              setShowRevise(false)
                              if (hItem.userMsgId && onRevise) {
                                onRevise(hItem.userMsgId)
                              }
                            }}
                          >
                            <span className="gm-revise-q-badge">Q{idx + 1}</span>
                            <div className="gm-revise-details">
                              <span className="gm-revise-q-text">{hItem.prompt.question}</span>
                              <span className="gm-revise-a-text">Answered: "{hItem.userResponse}"</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="gm-footer-right">
              <button
                className="gm-btn gm-btn--ghost ask-user-skip"
                type="button"
                disabled={disabled || answered}
                onClick={() => setDismissed(true)}
              >
                Skip
              </button>
              <button
                className="gm-btn gm-btn--primary ask-user-submit"
                type="button"
                disabled={disabled || answered || !canSubmit}
                onClick={submitMulti}
              >
                <span>Submit</span>
                <CornerDownLeft size={12} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

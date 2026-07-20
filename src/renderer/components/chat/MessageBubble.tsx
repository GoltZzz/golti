import React, { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  FileCode2
} from 'lucide-react'
import type { Message } from '../../../shared/types'
import { useChatStore } from '../../stores/chatStore'
import { useInspectorStore } from '../../stores/inspectorStore'
import { getSiblings } from '../../../shared/chat-utils'

interface MessageBubbleProps {
  message: Message
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user'
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const {
    regenerate,
    editAndResend,
    selectBranch,
    stopGeneration,
    isGenerating,
    citations,
    artifacts,
    messages
  } = useChatStore()
  const { selectArtifact } = useInspectorStore()

  const siblings = useMemo(() => getSiblings(messages, message.id), [messages, message.id])
  const siblingIndex = Math.max(0, siblings.findIndex((s) => s.id === message.id))
  const messageCitations = citations.filter((c) => c.messageId === message.id)
  const messageArtifacts = artifacts.filter((a) => a.messageId === message.id)

  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedCodeIndex(index)
    setTimeout(() => setCopiedCodeIndex(null), 2000)
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

                      if (!inline && match) {
                        return (
                          <div className="msg-code-block">
                            <div className="msg-code-header">
                              <span>{match[1]}</span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => {
                                    const art = messageArtifacts.find(
                                      (a) => a.content === codeText || a.language === match[1]
                                    )
                                    if (art) selectArtifact(art.id)
                                  }}
                                  title="Open as artifact"
                                >
                                  <FileCode2 size={12} /> Artifact
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

          {messageCitations.length > 0 && (
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
}

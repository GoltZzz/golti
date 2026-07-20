import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Bot, User } from 'lucide-react'
import { Message } from '../../../shared/types'

interface MessageBubbleProps {
  message: Message
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user'
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)

  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedCodeIndex(index)
    setTimeout(() => setCopiedCodeIndex(null), 2000)
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 'var(--space-4)',
        padding: '0 var(--space-4)',
        width: '100%'
      }}
      className="animate-slide-up"
    >
      {!isUser && (
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--accent-primary-alpha)',
          color: 'var(--accent-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Bot size={18} />
        </div>
      )}

      <div style={{
        maxWidth: '75%',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: isUser ? 'var(--bg-bubble-user)' : 'var(--bg-bubble-assistant)',
        border: `1px solid ${isUser ? 'var(--accent-primary-glow)' : 'var(--border-subtle)'}`,
        color: 'var(--text-primary)',
        fontSize: '14px',
        lineHeight: 1.6,
        boxShadow: 'var(--shadow-sm)'
      }}>
        {message.isStreaming && !message.content ? (
          <div style={{ display: 'flex', gap: '4px', padding: '6px 0' }}>
            <span className="dot-flashing" />
            <span className="dot-flashing" />
            <span className="dot-flashing" />
          </div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '')
                const codeText = String(children).replace(/\n$/, '')
                const index = Math.random()

                if (!inline && match) {
                  return (
                    <div style={{
                      position: 'relative',
                      marginTop: 'var(--space-2)',
                      marginBottom: 'var(--space-2)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      border: '1px solid var(--border-subtle)'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 12px',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        <span>{match[1]}</span>
                        <button
                          onClick={() => handleCopyCode(codeText, index)}
                          style={{ gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}
                        >
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
                      <pre style={{
                        margin: 0,
                        padding: '12px',
                        backgroundColor: '#090a0f',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        overflowX: 'auto'
                      }}>
                        <code>{children}</code>
                      </pre>
                    </div>
                  )
                }

                return (
                  <code
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px'
                    }}
                    {...props}
                  >
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

      {isUser && (
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <User size={18} />
        </div>
      )}
    </div>
  )
}

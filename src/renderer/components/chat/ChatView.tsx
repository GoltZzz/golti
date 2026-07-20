import React, { useEffect } from 'react'
import { Sparkles, MessageSquarePlus, Zap } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useChatStore } from '../../stores/chatStore'

export const ChatView: React.FC = () => {
  const {
    messages,
    sendMessage,
    isGenerating,
    fetchConversations,
    newConversation,
    setupStreamListener
  } = useChatStore()

  useEffect(() => {
    fetchConversations()
    const cleanup = setupStreamListener()
    return () => cleanup()
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-app)'
    }}>
      {/* Chat View Header */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-app)'
      }}>
        <ModelSelector />

        <button
          onClick={() => newConversation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <MessageSquarePlus size={14} />
          <span>New Thread</span>
        </button>
      </div>

      {/* Messages or Hero / Empty State */}
      {messages.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-8)',
          textAlign: 'center'
        }} className="animate-fade-in">
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--accent-primary-alpha)',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-4)',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <Sparkles size={28} />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            What would you like to build or explore?
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', marginBottom: 'var(--space-6)' }}>
            Golti is your personal local-first AI workspace. Choose a local Ollama model or cloud API to begin.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 'var(--space-3)',
            maxWidth: '520px',
            width: '100%'
          }}>
            {[
              { label: 'Summarize local document', prompt: 'Summarize the key points of this project.' },
              { label: 'Deep research query', prompt: 'Perform a deep research query on open source AI trends.' },
              { label: 'Draft an email reply', prompt: 'Help me draft a concise professional email reply.' },
              { label: 'Compare model outputs', prompt: 'Explain quantum computing in simple terms.' }
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(item.prompt)}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--border-accent)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                <Zap size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <MessageList messages={messages} />
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isGenerating} />
    </div>
  )
}

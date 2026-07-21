import React, { useEffect } from 'react'
import { Sparkles, Zap, PanelRight, Undo2, Redo2, MessageSquarePlus } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { InspectorPanel } from './InspectorPanel'
import { useChatStore } from '../../stores/chatStore'
import { useInspectorStore } from '../../stores/inspectorStore'

export const ChatView: React.FC = () => {
  const {
    visibleMessages,
    sendMessage,
    isGenerating,
    fetchConversations,
    newConversation,
    setupStreamListener,
    undoAction,
    redoAction,
    actionUndoStack,
    actionRedoStack,
    fetchModels,
    hydrateWebSearchPreference,
    isLoadingConversation,
    conversationError
  } = useChatStore()
  const { isOpen, toggle } = useInspectorStore()

  useEffect(() => {
    fetchConversations()
    fetchModels()
    hydrateWebSearchPreference()
    const cleanup = setupStreamListener()
    return () => cleanup()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoAction()
      } else if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redoAction()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoAction, redoAction])

  return (
    <div className="chat-workspace">
      <div className="chat-main">
        <div className="chat-header">
          <ModelSelector />
          <div className="chat-header-actions">
            <button
              className="chat-icon-btn"
              onClick={() => undoAction()}
              disabled={actionUndoStack.length === 0}
              title="Undo"
              aria-label="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="chat-icon-btn"
              onClick={() => redoAction()}
              disabled={actionRedoStack.length === 0}
              title="Redo"
              aria-label="Redo"
            >
              <Redo2 size={16} />
            </button>
            <button className="chat-ghost-btn" onClick={() => newConversation()} aria-label="New thread">
              <MessageSquarePlus size={14} />
              <span>New Thread</span>
            </button>
            <button
              className={`chat-icon-btn ${isOpen ? 'is-active' : ''}`}
              onClick={toggle}
              title="Toggle inspector"
              aria-label="Toggle inspector"
              aria-pressed={isOpen}
            >
              <PanelRight size={16} />
            </button>
          </div>
        </div>

        {conversationError && (
          <div
            role="alert"
            style={{
              padding: '8px 16px',
              fontSize: 12,
              color: 'var(--accent-primary)',
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            {conversationError}
          </div>
        )}

        {isLoadingConversation ? (
          <div className="chat-empty animate-fade-in">
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading conversation…</p>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="chat-empty animate-fade-in">
            <div className="chat-empty-icon">
              <Sparkles size={28} />
            </div>
            <h2>What would you like to build or explore?</h2>
            <p>
              Attach context, watch your token budget, branch replies, and keep artifacts beside the
              conversation.
            </p>
            <div className="chat-prompt-grid">
              {[
                { label: 'Summarize local document', prompt: 'Summarize the key points of this project.' },
                { label: 'Deep research query', prompt: 'Perform a deep research query on open source AI trends.' },
                { label: 'Draft an email reply', prompt: 'Help me draft a concise professional email reply.' },
                { label: 'Compare model outputs', prompt: 'Explain quantum computing in simple terms.' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  className="chat-prompt-card"
                  onClick={() => sendMessage(item.prompt)}
                  disabled={isGenerating}
                >
                  <Zap size={14} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={visibleMessages} />
        )}

        <ChatInput />
      </div>

      <InspectorPanel />
    </div>
  )
}

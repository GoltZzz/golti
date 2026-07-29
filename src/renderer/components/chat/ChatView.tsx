import React, { useEffect, useState } from 'react'
import { Zap, PanelRight, Undo2, Redo2, Code2, Sparkles, Layers } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { InspectorPanel } from './InspectorPanel'
import { EggLogo } from '../brand/EggLogo'
import { useChatStore } from '../../stores/chatStore'
import { useInspectorStore } from '../../stores/inspectorStore'

export const ChatView: React.FC = () => {
  const {
    visibleMessages,
    sendMessage,
    isGenerating,
    fetchConversations,
    setupStreamListener,
    undoAction,
    redoAction,
    actionUndoStack,
    actionRedoStack,
    fetchModels,
    hydrateWebSearchPreference,
    isLoadingConversation,
    conversationError,
    setDeepResearchEnabled,
    setDraft
  } = useChatStore()
  const { isOpen, toggle } = useInspectorStore()
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false)

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

  const quickPillActions = [
    {
      label: 'Plan New Idea',
      icon: <Sparkles size={14} />,
      onClick: () => {
        setDraft('Plan a new feature or architectural idea for this project: ')
      }
    },
    {
      label: 'Multitask',
      icon: <Layers size={14} />,
      onClick: () => {
        setDraft('Help me multitask across multiple modules in this codebase.')
      }
    },
    {
      label: 'Deep Research',
      icon: <Zap size={14} />,
      onClick: async () => {
        await setDeepResearchEnabled(true)
        setDraft('Research the latest best practices for ')
      }
    },
    {
      label: 'Summarize Codebase',
      icon: <Code2 size={14} />,
      onClick: () => {
        sendMessage('Summarize the architecture, entry points, and key patterns in this repository.')
      }
    }
  ]

  const isLanding = !isLoadingConversation && visibleMessages.length === 0

  return (
    <div className="chat-workspace">
      <div className={`chat-main ${isLanding ? 'is-landing-mode' : ''}`}>
        <div className={`chat-header ${isHeaderScrolled ? 'is-scrolled' : ''}`}>
          <div className="chat-header-left" />
          <div className="chat-header-actions">
            <button
              className="chat-icon-btn"
              onClick={() => undoAction()}
              disabled={actionUndoStack.length === 0}
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="chat-icon-btn"
              onClick={() => redoAction()}
              disabled={actionRedoStack.length === 0}
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
            >
              <Redo2 size={16} />
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
        ) : isLanding ? (
          <div className="chat-landing-container animate-fade-in">
            <div className="chat-landing-center">
              <div className="golti-mark" aria-hidden>
                <div className="golti-mark-glow" />
                <div className="golti-mark-inner">
                  <EggLogo size={32} />
                </div>
              </div>
              <ChatInput isLanding={true} />
              <div className="chat-landing-pills">
                {quickPillActions.map((pill, idx) => (
                  <button
                    key={idx}
                    className="chat-landing-pill"
                    onClick={pill.onClick}
                    disabled={isGenerating}
                  >
                    <span className="chat-landing-pill-icon">{pill.icon}</span>
                    <span>{pill.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <MessageList
              messages={visibleMessages}
              onScrollStateChange={setIsHeaderScrolled}
            />
            <ChatInput isLanding={false} />
          </>
        )}
      </div>

      <InspectorPanel />
    </div>
  )
}

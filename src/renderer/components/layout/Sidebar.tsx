import React, { useMemo, useState } from 'react'
import {
  MessageSquare,
  Search,
  Brain,
  FileText,
  Mail,
  GitCompare,
  BookOpen,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Trash2,
  Pin,
  Archive,
  Download,
  Server
} from 'lucide-react'
import { useSidebarStore, ActiveTab } from '../../stores/sidebarStore'
import { useChatStore } from '../../stores/chatStore'
import { useOllamaProcessStore } from '../../stores/ollamaProcessStore'

export const Sidebar: React.FC = () => {
  const { isCollapsed, activeTab, toggleCollapsed, setActiveTab } = useSidebarStore()
  const {
    conversations,
    currentConversationId,
    selectConversation,
    newConversation,
    deleteConversation,
    pinConversation,
    archiveConversation,
    exportConversation,
    searchConversations,
    searchHits,
    conversationError,
    generatingConversationIds
  } = useChatStore()

  const { processState, setupListeners: setupOllamaListeners } = useOllamaProcessStore()

  React.useEffect(() => {
    const unsub = setupOllamaListeners()
    return () => unsub()
  }, [setupOllamaListeners])

  const [localQuery, setLocalQuery] = useState('')

  const displayedConversations = useMemo(() => {
    if (searchHits.length > 0 && localQuery.trim()) {
      const ids = new Set(searchHits.map((h) => h.conversationId))
      return conversations.filter((c) => ids.has(c.id))
    }
    if (localQuery.trim() && searchHits.length === 0) {
      return []
    }
    return conversations
  }, [conversations, searchHits, localQuery])

  const isOllamaVisible =
    processState.status === 'running' ||
    processState.status === 'starting' ||
    processState.status === 'stopped' ||
    !!processState.binaryPath

  const mainNavItems = useMemo(() => {
    const items: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
      { id: 'chat', label: 'AI Chat', icon: <MessageSquare size={18} /> },
      { id: 'memory', label: 'Brain & Memory', icon: <Brain size={18} /> },
      { id: 'docs', label: 'Document Editor', icon: <FileText size={18} /> },
      { id: 'email', label: 'Mail & Calendar', icon: <Mail size={18} /> },
      { id: 'compare', label: 'Model Comparison', icon: <GitCompare size={18} /> },
      { id: 'cookbook', label: 'Hardware Cookbook', icon: <BookOpen size={18} /> }
    ]

    if (isOllamaVisible) {
      items.push({
        id: 'ollama',
        label: `Ollama Server${processState.port ? ` (:${processState.port})` : ''}`,
        icon: <Server size={18} />
      })
    }

    return items
  }, [isOllamaVisible, processState.port])

  return (
    <aside
      style={{
        width: isCollapsed ? 'var(--width-sidebar-collapsed)' : 'var(--width-sidebar-expanded)',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'width var(--transition-normal)',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: 'var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <button
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          style={{
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>

        {!isCollapsed && (
          <button
            onClick={() => newConversation()}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--accent-primary-alpha)',
              color: 'var(--accent-primary)',
              fontWeight: 500,
              fontSize: '13px',
              gap: '6px'
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--accent-primary-glow)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--accent-primary-alpha)')
            }
          >
            <Plus size={16} /> New Chat
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {mainNavItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: isCollapsed ? '10px' : '8px 12px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderLeft: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '13px',
                  width: '100%',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span>{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </div>

        {!isCollapsed && activeTab === 'chat' && (
          <div
            style={{
              marginTop: 'var(--space-4)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-muted)',
                padding: '0 8px 8px 8px'
              }}
            >
              Recent Chats
            </div>

            <div className="conv-search">
              <input
                value={localQuery}
                onChange={(e) => {
                  setLocalQuery(e.target.value)
                  searchConversations(e.target.value)
                }}
                placeholder="Search chats…"
                aria-label="Search conversations"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {displayedConversations.map((conv) => {
                const isSelected = conv.id === currentConversationId
                const isGenerating = generatingConversationIds.includes(conv.id)
                const hit = searchHits.find((h) => h.conversationId === conv.id)
                return (
                  <div
                    key={conv.id}
                    className="conv-item"
                    onClick={() => selectConversation(conv.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      gap: 4
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        {conv.pinned && <Pin size={11} className="conv-pin" />}
                        {isGenerating && (
                          <span
                            className="conv-generating-dot"
                            title="Generating…"
                            aria-label="Generating"
                          />
                        )}
                        {conv.title}
                      </div>
                      {hit?.snippet && localQuery.trim() && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {hit.snippet}
                        </div>
                      )}
                    </div>
                    <div className="conv-item-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        title={conv.pinned ? 'Unpin' : 'Pin'}
                        aria-label={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
                        onClick={() => pinConversation(conv.id, !conv.pinned)}
                      >
                        <Pin size={12} />
                      </button>
                      <button
                        title="Archive"
                        aria-label="Archive conversation"
                        onClick={() => archiveConversation(conv.id)}
                      >
                        <Archive size={12} />
                      </button>
                      <button
                        title="Export Markdown"
                        aria-label="Export conversation"
                        onClick={async () => {
                          await selectConversation(conv.id)
                          await exportConversation('markdown')
                        }}
                      >
                        <Download size={12} />
                      </button>
                      <button
                        title="Delete"
                        aria-label="Delete conversation"
                        onClick={() => deleteConversation(conv.id)}
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
              {displayedConversations.length === 0 && (
                <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  {localQuery.trim() ? 'No matching chats.' : 'No conversations yet.'}
                </div>
              )}
              {conversationError && (
                <div style={{ padding: 8, fontSize: 11, color: 'var(--accent-primary)' }}>
                  {conversationError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setActiveTab('settings')}
          title={isCollapsed ? 'Settings' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: isCollapsed ? '10px' : '8px 12px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: activeTab === 'settings' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'settings' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            fontSize: '13px',
            width: '100%'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'settings') e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'settings') e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <SettingsIcon size={18} />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  )
}

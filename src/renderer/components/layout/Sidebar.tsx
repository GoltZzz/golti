import React, { useMemo, useState } from 'react'
import {
  MessageSquare,
  Brain,
  FileText,
  Mail,
  GitCompare,
  BookOpen,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Pin,
  Archive,
  Download,
  Home,
  Code2
} from 'lucide-react'
import { useSidebarStore, ActiveTab } from '../../stores/sidebarStore'
import { useChatStore } from '../../stores/chatStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { DEFAULT_CONVERSATION_TITLE } from '../../../shared/conversation-title'

export const Sidebar: React.FC = () => {
  const { isCollapsed, activeTab, toggleCollapsed, setActiveTab } = useSidebarStore()
  const unseenMemories = useMemoryStore((s) => s.unseenCount)
  const markMemoriesSeen = useMemoryStore((s) => s.markSeen)
  const {
    conversations,
    currentConversationId,
    selectConversation,
    startBlankConversation,
    deleteConversation,
    pinConversation,
    archiveConversation,
    exportConversation,
    searchConversations,
    searchHits,
    conversationError,
    generatingConversationIds
  } = useChatStore()

  const [localQuery, setLocalQuery] = useState('')
  const [topTab, setTopTab] = useState<'home' | 'code'>('home')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const displayedConversations = useMemo(() => {
    if (searchHits.length > 0 && localQuery.trim()) {
      const ids = new Set(searchHits.map((h) => h.conversationId))
      return conversations.filter((c) => ids.has(c.id))
    }
    if (localQuery.trim() && searchHits.length === 0) {
      return []
    }
    return conversations.filter(
      (c) => c.title !== DEFAULT_CONVERSATION_TITLE || c.id === currentConversationId
    )
  }, [conversations, searchHits, localQuery, currentConversationId])

  const openConversation = async (id: string) => {
    setActiveTab('chat')
    await selectConversation(id)
  }

  const startNewConversation = async () => {
    setActiveTab('chat')
    startBlankConversation()
  }

  const mainNavItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'memory', label: 'Recall', icon: <Brain size={18} /> },
    { id: 'docs', label: 'Document Editor', icon: <FileText size={18} /> },
    { id: 'email', label: 'Mail & Calendar', icon: <Mail size={18} /> },
    { id: 'compare', label: 'Model Comparison', icon: <GitCompare size={18} /> },
    { id: 'cookbook', label: 'Hardware Cookbook', icon: <BookOpen size={18} /> }
  ]

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteConversation(pendingDelete.id)
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete conversation.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
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

      </div>

      {!isCollapsed && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: 'var(--space-2)',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          {(['home', 'code'] as const).map((t) => {
            const isActive = topTab === t
            return (
              <button
                key={t}
                onClick={() => setTopTab(t)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '13px'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {t === 'home' ? <Home size={16} /> : <Code2 size={16} />}
                <span>{t === 'home' ? 'Home' : 'Code'}</span>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {topTab === 'code' && !isCollapsed ? (
          <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Code view coming soon.
          </div>
        ) : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            onClick={startNewConversation}
            title={isCollapsed ? 'New Chat' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: isCollapsed ? '10px' : '8px 12px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              borderLeft: '3px solid transparent',
              fontSize: '13px',
              width: '100%',
              textAlign: 'left'
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)')
            }
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <MessageSquare size={18} />
            {!isCollapsed && <span>New</span>}
          </button>
          {mainNavItems.map((item) => {
            const isActive = activeTab === item.id
            const badgeCount = item.id === 'memory' ? unseenMemories : 0
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  if (item.id === 'memory') markMemoriesSeen()
                }}
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
                  textAlign: 'left',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  {item.icon}
                  {isCollapsed && badgeCount > 0 && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -3,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-primary)',
                        boxShadow: '0 0 0 2px var(--bg-sidebar)'
                      }}
                    />
                  )}
                </span>
                {!isCollapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {!isCollapsed && badgeCount > 0 && (
                  <span
                    title={`${badgeCount} new ${badgeCount === 1 ? 'memory' : 'memories'} saved`}
                    style={{
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 9,
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--bg-app)',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {!isCollapsed && (
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
              Recents
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
                    onClick={() => openConversation(conv.id)}
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
                        onClick={() => {
                          setDeleteError(null)
                          setPendingDelete({ id: conv.id, title: conv.title })
                        }}
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
        </>
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

    <ConfirmDialog
      open={pendingDelete !== null}
      icon={<Trash2 size={18} className="delete-model-icon" />}
      title="Delete conversation"
      message={
        <>
          Delete <strong>{pendingDelete?.title || DEFAULT_CONVERSATION_TITLE}</strong>? Its messages,
          attached context and artifacts go with it. This cannot be undone.
        </>
      }
      confirmLabel="Delete"
      busyLabel="Deleting…"
      isBusy={isDeleting}
      error={deleteError}
      onConfirm={confirmDelete}
      onCancel={() => {
        if (isDeleting) return
        setPendingDelete(null)
        setDeleteError(null)
      }}
    />
    </>
  )
}

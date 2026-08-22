import React, { useEffect, useMemo, useState } from 'react'
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
  Briefcase,
  UserPlus,
  Kanban
} from 'lucide-react'
import { useSidebarStore, ActiveTab } from '../../stores/sidebarStore'
import { useChatStore } from '../../stores/chatStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useOfficeStore } from '../../stores/officeStore'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { DEFAULT_CONVERSATION_TITLE } from '../../../shared/conversation-title'
import { isOfficeConversationId } from '../../../shared/office-achievements'

export const Sidebar: React.FC = () => {
  const { isCollapsed, activeTab, topTab, toggleCollapsed, setActiveTab, setTopTab } =
    useSidebarStore()
  const {
    agents: officeAgents,
    selectedAgentId,
    setSelectedAgentId,
    setIsHireModalOpen,
    setIsBlackboardOpen
  } = useOfficeStore()
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
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<'darwin' | 'win32' | 'linux'>('darwin')
  const { settings, fetchSettings } = useSettingsStore()

  useEffect(() => {
    fetchSettings()
    if (window.goltiAPI?.getPlatform) {
      window.goltiAPI
        .getPlatform()
        .then((p: 'darwin' | 'win32' | 'linux') => {
          if (p) setDetectedPlatform(p)
        })
        .catch(() => {})
    }
  }, [fetchSettings])

  const effectiveOS =
    settings?.osPlatformOverride && settings.osPlatformOverride !== 'auto'
      ? settings.osPlatformOverride
      : detectedPlatform

  const searchShortcut = effectiveOS === 'darwin' ? '⌘⇧F' : 'Ctrl+Shift+F'

  const displayedConversations = useMemo(() => {
    // Office agents own real conversations; they belong to the Office view,
    // not Recents. The inspector links straight to them when you want one.
    const visible = conversations.filter(
      (c) => !isOfficeConversationId(c.id) || c.id === currentConversationId
    )

    if (searchHits.length > 0 && localQuery.trim()) {
      const ids = new Set(searchHits.map((h) => h.conversationId))
      return visible.filter((c) => ids.has(c.id))
    }
    if (localQuery.trim() && searchHits.length === 0) {
      return []
    }
    return visible.filter(
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
          className="shell-icon-btn"
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ padding: 'var(--space-2)' }}
        >
          {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>

      </div>

      {/* Top-level switch. Rendered collapsed too, otherwise the Office
          becomes unreachable once the sidebar is narrowed. */}
      <div className={`sidebar-toptabs ${isCollapsed ? 'is-collapsed' : ''}`} role="tablist">
        {(['home', 'office'] as const).map((t) => {
          const isActive = topTab === t
          const label = t === 'home' ? 'Home' : 'Office'
          return (
            <button
              key={t}
              role="tab"
              aria-selected={isActive}
              className={`sidebar-toptab ${isActive ? 'is-active' : ''}`}
              onClick={() => setTopTab(t)}
              title={isCollapsed ? label : undefined}
            >
              {t === 'home' ? <Home size={16} /> : <Briefcase size={16} />}
              {!isCollapsed && <span>{label}</span>}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {topTab === 'office' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!isCollapsed && (
              <>
                <button
                  onClick={() => setIsHireModalOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, rgba(224, 108, 117, 0.15), rgba(97, 175, 239, 0.15))',
                    color: 'var(--text-primary)',
                    border: '1px solid rgba(224, 108, 117, 0.3)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  <UserPlus size={16} color="var(--accent-primary)" />
                  <span>Hire New Agent</span>
                </button>

                <button
                  className="shell-row shell-row-card"
                  onClick={() => setIsBlackboardOpen(true)}
                >
                  <Kanban size={16} color="var(--accent-yellow)" />
                  <span>Studio Blackboard</span>
                </button>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-muted)',
                    padding: '12px 6px 4px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>Active Roster</span>
                  <span style={{ fontSize: '10px', color: 'var(--accent-blue)' }}>
                    {officeAgents.length} Agents
                  </span>
                </div>
              </>
            )}

            <div className="office-sidebar-roster">
              {officeAgents.map((ag) => {
                const isSelected = selectedAgentId === ag.id
                return (
                  <div
                    key={ag.id}
                    className={`office-roster-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedAgentId(ag.id)}
                    title={`${ag.name} (${ag.roleTitle}) - ${ag.status}`}
                    style={{
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      padding: isCollapsed ? '8px' : '8px 10px'
                    }}
                  >
                    <div
                      className="roster-avatar-dot"
                      style={{
                        backgroundColor: ag.avatar.outfitColor || 'var(--bg-card)',
                        color: '#fff'
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700 }}>
                        {ag.name.slice(0, 1)}
                      </span>
                      <div className={`roster-status-indicator status-dot-${ag.status}`} />
                    </div>

                    {!isCollapsed && (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {ag.name}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: 'var(--accent-yellow)'
                            }}
                          >
                            L{ag.level}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {ag.statusMessage || ag.roleTitle}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            className="shell-row"
            onClick={startNewConversation}
            title={isCollapsed ? 'New Chat' : undefined}
            style={{
              padding: isCollapsed ? '10px' : '8px 12px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              borderLeft: '3px solid transparent'
            }}
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
                aria-current={isActive ? 'page' : undefined}
                className={`shell-row ${isActive ? 'is-active' : ''}`}
                style={{
                  padding: isCollapsed ? '10px' : '8px 12px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderLeft: isActive ? undefined : '3px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                  position: 'relative'
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

            <div className="conv-search" style={{ position: 'relative' }}>
              <input
                value={localQuery}
                onChange={(e) => {
                  setLocalQuery(e.target.value)
                  searchConversations(e.target.value)
                }}
                placeholder="Search chats…"
                aria-label="Search conversations"
                style={{ paddingRight: effectiveOS === 'darwin' ? '50px' : '75px' }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '10px',
                  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, var(--font-sans)",
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  padding: '1px 4px',
                  pointerEvents: 'none',
                  lineHeight: '1.2',
                  userSelect: 'none'
                }}
              >
                {searchShortcut}
              </span>
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
          className={`shell-row ${activeTab === 'settings' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title={isCollapsed ? 'Settings' : undefined}
          aria-current={activeTab === 'settings' ? 'page' : undefined}
          style={{
            padding: isCollapsed ? '10px' : '8px 12px',
            justifyContent: isCollapsed ? 'center' : 'flex-start'
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

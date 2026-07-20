import React from 'react'
import {
  MessageSquare,
  Search,
  Bot,
  Brain,
  FileText,
  Mail,
  GitCompare,
  BookOpen,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Trash2
} from 'lucide-react'
import { useSidebarStore, ActiveTab } from '../../stores/sidebarStore'
import { useChatStore } from '../../stores/chatStore'

export const Sidebar: React.FC = () => {
  const { isCollapsed, activeTab, toggleCollapsed, setActiveTab } = useSidebarStore()
  const { conversations, currentConversationId, selectConversation, newConversation, deleteConversation } = useChatStore()

  const mainNavItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'AI Chat', icon: <MessageSquare size={18} /> },
    { id: 'research', label: 'Deep Research', icon: <Search size={18} /> },
    { id: 'agents', label: 'Autonomous Agents', icon: <Bot size={18} /> },
    { id: 'memory', label: 'Brain & Memory', icon: <Brain size={18} /> },
    { id: 'docs', label: 'Document Editor', icon: <FileText size={18} /> },
    { id: 'email', label: 'Email & Calendar', icon: <Mail size={18} /> },
    { id: 'compare', label: 'Model Comparison', icon: <GitCompare size={18} /> },
    { id: 'cookbook', label: 'Hardware Cookbook', icon: <BookOpen size={18} /> }
  ]

  return (
    <aside style={{
      width: isCollapsed ? 'var(--width-sidebar-collapsed)' : 'var(--width-sidebar-expanded)',
      backgroundColor: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      transition: 'width var(--transition-normal)',
      userSelect: 'none',
      overflow: 'hidden'
    }}>
      {/* Top Controls: Collapse toggle & New Chat */}
      <div style={{
        padding: 'var(--space-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'space-between',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <button
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          style={{
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
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
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-primary-glow)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent-primary-alpha)'}
          >
            <Plus size={16} /> New Chat
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {mainNavItems.map(item => {
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
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span>{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </div>

        {/* Conversation List (shown under Chat tab) */}
        {!isCollapsed && activeTab === 'chat' && (
          <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              padding: '0 8px 8px 8px'
            }}>
              Recent Chats
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {conversations.map(conv => {
                const isSelected = conv.id === currentConversationId
                return (
                  <div
                    key={conv.id}
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
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <span style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: 1
                    }}>
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteConversation(conv.id)
                      }}
                      title="Delete conversation"
                      style={{
                        padding: '2px',
                        color: 'var(--text-muted)',
                        borderRadius: 'var(--radius-xs)',
                        opacity: 0.7
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#e06c75'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Settings Tab */}
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
          onMouseEnter={e => {
            if (activeTab !== 'settings') e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
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

import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Search, MessageSquare, MessageCircle, Brain, X, ArrowRight, CornerDownLeft } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import type { ConversationSearchHit, MessageSearchHit, MemorySearchHit } from '../../../shared/types'

interface GlobalSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

type SearchTab = 'all' | 'messages' | 'conversations' | 'memories'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { setActiveTab } = useSidebarStore()
  const { selectConversation, setHighlightedMessageId, searchMessages } = useChatStore()

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTabFilter] = useState<SearchTab>('all')
  const [loading, setLoading] = useState(false)
  const [convHits, setConvHits] = useState<ConversationSearchHit[]>([])
  const [msgHits, setMsgHits] = useState<MessageSearchHit[]>([])
  const [memHits, setMemHits] = useState<MemorySearchHit[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setConvHits([])
      setMsgHits([])
      setMemHits([])
      setSelectedIndex(0)
    }
  }, [isOpen])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setConvHits([])
      setMsgHits([])
      setMemHits([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const [cHits, mHits, mems] = await Promise.all([
          window.goltiAPI.searchConversations(q),
          searchMessages(q),
          window.goltiAPI.searchMemories(q)
        ])
        setConvHits(cHits || [])
        setMsgHits(mHits || [])
        setMemHits(mems || [])
      } catch (err) {
        console.warn('[GlobalSearchModal] Search error:', err)
      } finally {
        setLoading(false)
      }
    }, 120)

    return () => clearTimeout(timer)
  }, [query, searchMessages])

  type HitItem =
    | { type: 'msg'; id: string; hit: MessageSearchHit }
    | { type: 'conv'; id: string; hit: ConversationSearchHit }
    | { type: 'mem'; id: string; hit: MemorySearchHit }

  const combinedItems: HitItem[] = useMemo(() => {
    const items: HitItem[] = []
    if (activeTab === 'all' || activeTab === 'messages') {
      msgHits.forEach((m) => items.push({ type: 'msg', id: `msg_${m.messageId}`, hit: m }))
    }
    if (activeTab === 'all' || activeTab === 'conversations') {
      convHits.forEach((c) => items.push({ type: 'conv', id: `conv_${c.conversationId}`, hit: c }))
    }
    if (activeTab === 'all' || activeTab === 'memories') {
      memHits.forEach((m) => items.push({ type: 'mem', id: `mem_${m.id}`, hit: m }))
    }
    return items
  }, [activeTab, msgHits, convHits, memHits])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, activeTab])

  const handleSelectHit = async (item: HitItem) => {
    onClose()
    if (item.type === 'msg') {
      setActiveTab('chat')
      await selectConversation(item.hit.conversationId)
      setHighlightedMessageId(item.hit.messageId)
    } else if (item.type === 'conv') {
      setActiveTab('chat')
      await selectConversation(item.hit.conversationId)
    } else if (item.type === 'mem') {
      setActiveTab('memory')
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, combinedItems.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + combinedItems.length) % Math.max(1, combinedItems.length))
      } else if (e.key === 'Enter') {
        if (combinedItems[selectedIndex]) {
          e.preventDefault()
          handleSelectHit(combinedItems[selectedIndex])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, combinedItems, selectedIndex, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: 'var(--bg-surface, #1e1e24)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-input, #141418)'
          }}
        >
          <Search size={20} style={{ color: 'var(--accent-primary, #6366f1)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search messages, conversations, and memories (Cmd+Shift+F)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '16px',
              fontWeight: 500
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          )}
          <span
            style={{
              fontSize: '11px',
              padding: '3px 6px',
              borderRadius: '4px',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            ESC
          </span>
        </div>

        {/* Tab Filters Bar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-app)'
          }}
        >
          {[
            { id: 'all', label: `All (${msgHits.length + convHits.length + memHits.length})` },
            { id: 'messages', label: `Messages (${msgHits.length})` },
            { id: 'conversations', label: `Conversations (${convHits.length})` },
            { id: 'memories', label: `Memories (${memHits.length})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabFilter(tab.id as SearchTab)}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                borderRadius: 'var(--radius-sm)',
                background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                border: activeTab === tab.id ? '1px solid var(--border-medium)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            maxHeight: '440px',
            overflowY: 'auto',
            padding: '8px 0'
          }}
        >
          {loading && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Searching across workspace...
            </div>
          )}

          {!loading && query.trim() && combinedItems.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              No matches found for "{query}"
            </div>
          )}

          {!loading && !query.trim() && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Type a keyword to search all chat messages, titles, and distilled memories.
            </div>
          )}

          {!loading &&
            combinedItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectHit(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 20px',
                    backgroundColor: isSelected ? 'var(--bg-card)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease'
                  }}
                >
                  <div style={{ marginTop: '2px', color: 'var(--accent-primary)' }}>
                    {item.type === 'msg' && <MessageSquare size={16} />}
                    {item.type === 'conv' && <MessageCircle size={16} />}
                    {item.type === 'mem' && <Brain size={16} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.type === 'msg' && `${item.hit.conversationTitle}`}
                        {item.type === 'conv' && item.hit.title}
                        {item.type === 'mem' && item.hit.title}
                      </span>

                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {item.type === 'msg' && `${item.hit.role} · ${timeAgo(item.hit.createdAt)}`}
                        {item.type === 'conv' && timeAgo(item.hit.updatedAt)}
                        {item.type === 'mem' && timeAgo(item.hit.updatedAt)}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        marginTop: '4px',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {item.type === 'msg' && (item.hit.contentSnippet || 'Matched message content')}
                      {item.type === 'conv' && (item.hit.snippet || 'Conversation thread')}
                      {item.type === 'mem' && item.hit.summary}
                    </div>
                  </div>

                  {isSelected && (
                    <CornerDownLeft size={14} style={{ color: 'var(--text-muted)', marginTop: '4px', flexShrink: 0 }} />
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}

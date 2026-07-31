import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Download } from 'lucide-react'
import {
  useInspectorStore,
  InspectorTab,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_MAX_WIDTH
} from '../../stores/inspectorStore'
import { useChatStore } from '../../stores/chatStore'
import { ShellEditor } from './ShellEditor'

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'context', label: 'Context' },
  { id: 'thread', label: 'Thread' },
  { id: 'shells', label: 'Shells' }
]

export const InspectorPanel: React.FC = () => {
  const {
    isOpen,
    activeTab,
    setTab,
    setOpen,
    selectedShellId,
    selectShell,
    width,
    setWidth,
    resetWidth
  } = useInspectorStore()
  const {
    contextItems,
    artifacts: shells,
    citations,
    visibleMessages,
    currentConversationId,
    conversations,
    updateConversationSystemPrompt,
    toggleContextItem,
    removeContextItem,
    exportConversation
  } = useChatStore()

  const conv = conversations.find((c) => c.id === currentConversationId)
  const [systemPrompt, setSystemPrompt] = useState(conv?.systemPrompt || '')

  useEffect(() => {
    setSystemPrompt(conv?.systemPrompt || '')
  }, [conv?.id, conv?.systemPrompt])

  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLElement | null>(null)

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      setIsResizing(true)

      const move = (ev: PointerEvent) => {
        const right = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth
        setWidth(right - ev.clientX)
      }
      const stop = () => {
        setIsResizing(false)
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', stop)
        handle.removeEventListener('pointercancel', stop)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', stop)
      handle.addEventListener('pointercancel', stop)
    },
    [setWidth]
  )

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 16
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setWidth(width + step)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setWidth(width - step)
    } else if (e.key === 'Home') {
      e.preventDefault()
      resetWidth()
    }
  }

  return (
    <aside
      ref={panelRef}
      className={`inspector ${isOpen ? '' : 'is-collapsed'} ${isResizing ? 'is-resizing' : ''}`}
      style={isOpen ? { width } : undefined}
      aria-label="Chat inspector"
      aria-hidden={!isOpen}
    >
      <div
        className="inspector-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        aria-valuenow={width}
        aria-valuemin={INSPECTOR_MIN_WIDTH}
        aria-valuemax={INSPECTOR_MAX_WIDTH}
        tabIndex={isOpen ? 0 : -1}
        onPointerDown={startResize}
        onKeyDown={onHandleKeyDown}
        onDoubleClick={resetWidth}
      />
      <div className="inspector-header">
        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Inspector</strong>
        <button className="chat-icon-btn" onClick={() => setOpen(false)} aria-label="Close inspector">
          <X size={16} />
        </button>
      </div>

      <div className="inspector-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`inspector-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {activeTab === 'context' && (
          <>
            <div className="inspector-section-title">Thread system prompt</div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              onBlur={() => updateConversationSystemPrompt(systemPrompt)}
              placeholder="Optional override for this thread…"
              aria-label="Thread system prompt"
              style={{
                width: '100%',
                minHeight: 72,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                padding: 8,
                fontSize: 12,
                marginBottom: 16,
                resize: 'vertical'
              }}
            />

            <div className="inspector-section-title">Attached context</div>
            {contextItems.length === 0 ? (
              <p className="inspector-empty">
                Attach files, folders, pasted text, or URLs from the composer. Nothing is indexed
                automatically.
              </p>
            ) : (
              <div className="inspector-list">
                {contextItems.map((item) => (
                  <div key={item.id} className="inspector-item">
                    <div className="inspector-item-row">
                      <span className="inspector-item-name">{item.name}</span>
                      <span className="inspector-item-meta">{item.tokenEstimate} tok</span>
                    </div>
                    <div className="inspector-item-row">
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) => toggleContextItem(item.id, e.target.checked)}
                        />
                        Enabled
                      </label>
                      <button className="chat-ghost-btn" onClick={() => removeContextItem(item.id)}>
                        Remove
                      </button>
                    </div>
                    {item.error && (
                      <span style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>{item.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'thread' && (
          <>
            <div className="inspector-section-title">Outline</div>
            {visibleMessages.length === 0 ? (
              <p className="inspector-empty">Messages in the active branch will appear here.</p>
            ) : (
              <div className="inspector-list">
                {visibleMessages.map((m, i) => (
                  <div key={m.id} className="inspector-item">
                    <div className="inspector-item-row">
                      <span className="inspector-item-name">
                        {i + 1}. {m.role}
                      </span>
                      <span className="inspector-item-meta">
                        {m.tokensOut || m.tokensIn || '-'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {m.content.slice(0, 80)}
                      {m.content.length > 80 ? '…' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="inspector-section-title" style={{ marginTop: 16 }}>
              Sources
            </div>
            {citations.length === 0 ? (
              <p className="inspector-empty">Enable web search on a prompt to collect citations.</p>
            ) : (
              <div className="inspector-list">
                {citations.map((c) => (
                  <a
                    key={c.id}
                    className="inspector-item"
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="inspector-item-name">{c.title}</span>
                    <span className="inspector-item-meta">{c.url}</span>
                  </a>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="primary-btn" onClick={() => exportConversation('markdown')}>
                <Download size={14} /> Export MD
              </button>
              <button className="chat-ghost-btn" onClick={() => exportConversation('json')}>
                Export JSON
              </button>
            </div>
          </>
        )}

        {(activeTab === 'shells' || activeTab === 'artifacts') && (
          <>
            {selectedShellId ? (
              <ShellEditor
                shellId={selectedShellId}
                onBack={() => selectShell(null)}
              />
            ) : shells.length === 0 ? (
              <p className="inspector-empty">
                Code and Markdown documents from assistant replies will show up here for editing and
                versioning.
              </p>
            ) : (
              <div className="inspector-list">
                {shells.map((s) => (
                  <button
                    key={s.id}
                    className="inspector-item"
                    onClick={() => selectShell(s.id)}
                    style={{ textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div className="inspector-item-row">
                      <span className="inspector-item-name">{s.title}</span>
                      <span className="inspector-item-meta">v{s.version}</span>
                    </div>
                    <span className="inspector-item-meta">
                      {s.language || s.type} · {s.content.split('\n').length} lines
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

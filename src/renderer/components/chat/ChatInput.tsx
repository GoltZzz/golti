import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Paperclip,
  Link2,
  Globe,
  Search,
  SlidersHorizontal,
  Square,
  Undo2,
  Redo2
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSearchRuntimeStore } from '../../stores/searchRuntimeStore'
import { ContextTray } from './ContextTray'
import { UsageMeter } from './UsageMeter'
import { Tooltip } from './Tooltip'

export const ChatInput: React.FC = () => {
  const {
    draft,
    setDraft,
    sendMessage,
    isGenerating,
    stopGeneration,
    webSearchEnabled,
    setWebSearchEnabled,
    forceWebSearchNext,
    setForceWebSearchNext,
    deepResearchEnabled,
    setDeepResearchEnabled,
    searchSetupError,
    addContext,
    addContextPaths,
    addContextUrl,
    addContextText,
    undoDraft,
    redoDraft,
    draftUndoStack,
    draftRedoStack,
    generationSettings,
    setGenerationSettings,
    tokenBudget
  } = useChatStore()
  const { runtimeState, progress, setupListeners } = useSearchRuntimeStore()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlPrompt, setUrlPrompt] = useState(false)
  const [urlValue, setUrlValue] = useState('')

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [draft])

  useEffect(() => setupListeners(), [setupListeners])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoDraft()
      return
    }
    if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      redoDraft()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (draft.trim() && !isGenerating && !tokenBudget?.overflow) {
        sendMessage()
      }
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    const paths = files.map((f: any) => f.path).filter(Boolean)
    if (paths.length) {
      await addContextPaths(paths)
    } else if (files.length) {
      for (const file of files) {
        const text = await file.text()
        await addContextText(file.name, text)
      }
    }
  }

  const showRuntimeBusy =
    webSearchEnabled &&
    (runtimeState.status === 'downloading' ||
      runtimeState.status === 'starting' ||
      Boolean(progress && progress.percent < 100))

  return (
    <div className="composer">
      <div className="composer-inner">
        <ContextTray />

        <div
          className={`composer-box ${dragOver ? 'is-dragover' : ''} ${tokenBudget?.overflow ? 'is-overflow' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="composer-toolbar">
            <Tooltip label="Attach files or folders">
              <button className="chat-icon-btn" onClick={() => addContext()} aria-label="Attach files or folders">
                <Paperclip size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Add URL">
              <button
                className="chat-icon-btn"
                onClick={() => setUrlPrompt((v) => !v)}
                aria-label="Add URL context"
              >
                <Link2 size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Toggle web search">
              <button
                className={`chat-ghost-btn ${webSearchEnabled ? 'is-active' : ''}`}
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                aria-label="Toggle web search"
                aria-pressed={webSearchEnabled}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 28,
                  padding: '0 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: webSearchEnabled ? 'rgba(86, 182, 194, 0.15)' : 'transparent',
                  borderColor: webSearchEnabled ? 'rgba(86, 182, 194, 0.4)' : 'var(--border-subtle)',
                  color: webSearchEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)'
                }}
              >
                <Globe size={13} />
                <span>Web Search</span>
              </button>
            </Tooltip>
            {webSearchEnabled && (
              <Tooltip label="Force search this message">
                <button
                  className={`chat-ghost-btn ${forceWebSearchNext ? 'is-active' : ''}`}
                  onClick={() => setForceWebSearchNext(!forceWebSearchNext)}
                  aria-label="Force web search for next message"
                  aria-pressed={forceWebSearchNext}
                  style={{
                    height: 28,
                    padding: '0 8px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: forceWebSearchNext ? 'rgba(224, 108, 117, 0.15)' : 'transparent',
                    borderColor: forceWebSearchNext ? 'var(--border-accent)' : 'var(--border-subtle)',
                    color: forceWebSearchNext ? 'var(--accent-primary)' : 'var(--text-muted)'
                  }}
                >
                  Force
                </button>
              </Tooltip>
            )}
            <Tooltip label="Deep Research mode">
              <button
                className={`chat-ghost-btn ${deepResearchEnabled ? 'is-active' : ''}`}
                onClick={() => setDeepResearchEnabled(!deepResearchEnabled)}
                aria-label="Toggle deep research mode"
                aria-pressed={deepResearchEnabled}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 28,
                  padding: '0 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: deepResearchEnabled ? 'rgba(198, 120, 221, 0.15)' : 'transparent',
                  borderColor: deepResearchEnabled ? 'rgba(198, 120, 221, 0.4)' : 'var(--border-subtle)',
                  color: deepResearchEnabled ? 'var(--accent-purple)' : 'var(--text-muted)'
                }}
              >
                <Search size={13} />
                <span>Deep Research</span>
              </button>
            </Tooltip>
            <Tooltip label="Generation settings">
              <button
                className={`chat-icon-btn ${showSettings ? 'is-active' : ''}`}
                onClick={() => setShowSettings((v) => !v)}
                aria-label="Generation settings"
                aria-expanded={showSettings}
              >
                <SlidersHorizontal size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Undo" shortcut="⌘Z">
              <button
                className="chat-icon-btn"
                onClick={undoDraft}
                disabled={draftUndoStack.length === 0}
                aria-label="Undo draft"
              >
                <Undo2 size={14} />
              </button>
            </Tooltip>
            <Tooltip label="Redo" shortcut="⌘⇧Z">
              <button
                className="chat-icon-btn"
                onClick={redoDraft}
                disabled={draftRedoStack.length === 0}
                aria-label="Redo draft"
              >
                <Redo2 size={14} />
              </button>
            </Tooltip>
          </div>

          {urlPrompt && (
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px 0' }}>
              <input
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://…"
                aria-label="Context URL"
                style={{
                  flex: 1,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  padding: '6px 8px',
                  fontSize: 12
                }}
              />
              <button
                className="primary-btn"
                onClick={async () => {
                  if (!urlValue.trim()) return
                  await addContextUrl(urlValue.trim())
                  setUrlValue('')
                  setUrlPrompt(false)
                }}
              >
                Add
              </button>
            </div>
          )}

          {(showRuntimeBusy || searchSetupError) && (
            <div
              style={{
                margin: '8px 12px 0',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: searchSetupError
                  ? 'rgba(224, 108, 117, 0.12)'
                  : 'rgba(97, 175, 239, 0.12)',
                color: searchSetupError ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: 12
              }}
            >
              {searchSetupError ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span>{searchSetupError}</span>
                  <button
                    className="chat-ghost-btn"
                    onClick={() => setWebSearchEnabled(true)}
                    style={{ fontSize: 11 }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <span>
                  Setting up Web Search
                  {progress ? `… ${progress.percent}%` : '…'}
                </span>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Golti anything… (Shift+Enter for newline)"
            rows={1}
            disabled={false}
            aria-label="Message input"
          />

          {showSettings && (
            <div className="gen-settings" style={{ padding: '0 12px' }}>
              <label>
                <div className="gen-label-row">
                  <span>Temperature</span>
                  <Tooltip
                    position="top"
                    multiline
                    maxWidth={300}
                    label="Controls creativity & randomness. Lower values (0.2) give precise, factual answers (code, math). Higher values (0.8) are more creative for writing."
                  >
                    <span className="info-icon" aria-label="Temperature help">ⓘ</span>
                  </Tooltip>
                </div>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={generationSettings.temperature ?? 0.7}
                  onChange={(e) => setGenerationSettings({ temperature: Number(e.target.value) })}
                />
              </label>
              <label>
                <div className="gen-label-row">
                  <span>Top P</span>
                  <Tooltip
                    position="top"
                    multiline
                    maxWidth={300}
                    label="Controls word choice variety. Lower values stick to common words; higher values allow more unique phrasing. Default (0.9) works best for most uses."
                  >
                    <span className="info-icon" aria-label="Top P help">ⓘ</span>
                  </Tooltip>
                </div>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={generationSettings.topP ?? 0.9}
                  onChange={(e) => setGenerationSettings({ topP: Number(e.target.value) })}
                />
              </label>
              <label>
                <div className="gen-label-row">
                  <span>Max tokens</span>
                  <Tooltip
                    position="top"
                    multiline
                    maxWidth={300}
                    label="Limits maximum response length (~100 tokens ≈ 75 words). Increase if long responses get cut off early."
                  >
                    <span className="info-icon" aria-label="Max tokens help">ⓘ</span>
                  </Tooltip>
                </div>
                <input
                  type="number"
                  min={64}
                  max={128000}
                  step={64}
                  value={generationSettings.maxTokens ?? 2048}
                  onChange={(e) => setGenerationSettings({ maxTokens: Number(e.target.value) })}
                />
              </label>
            </div>
          )}

          <div className="composer-footer">
            <div className="composer-footer-left">
              <UsageMeter compact />
              {deepResearchEnabled ? (
                <span style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 500 }}>
                  Deep Research mode active
                </span>
              ) : webSearchEnabled && (
                <span style={{ fontSize: 11, color: 'var(--accent-cyan)' }}>
                  {forceWebSearchNext ? 'Will search this message' : 'Web Search on'}
                </span>
              )}
              {tokenBudget?.overflow && (
                <span style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>
                  Context over budget — remove context or shorten draft
                </span>
              )}
            </div>

            {isGenerating ? (
              <Tooltip label="Stop generation">
                <button
                  className="composer-send is-stop"
                  onClick={() => stopGeneration()}
                  aria-label="Stop generation"
                >
                  <Square size={14} />
                </button>
              </Tooltip>
            ) : (
              <Tooltip label="Send message" shortcut="Enter">
                <button
                  className={`composer-send ${draft.trim() && !tokenBudget?.overflow ? 'is-ready' : ''}`}
                  onClick={() => sendMessage()}
                  disabled={!draft.trim() || Boolean(tokenBudget?.overflow)}
                  aria-label="Send message"
                >
                  <ArrowUp size={16} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

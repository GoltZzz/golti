import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Paperclip,
  FolderOpen,
  Link2,
  Globe,
  SlidersHorizontal,
  Square,
  Undo2,
  Redo2
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { ContextTray } from './ContextTray'
import { UsageMeter } from './UsageMeter'

export const ChatInput: React.FC = () => {
  const {
    draft,
    setDraft,
    sendMessage,
    isGenerating,
    stopGeneration,
    webSearchEnabled,
    setWebSearchEnabled,
    addContextFiles,
    addContextFolder,
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
      // Fallback: read as text in renderer when path unavailable
      for (const file of files) {
        const text = await file.text()
        await addContextText(file.name, text)
      }
    }
  }

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
            <button className="chat-icon-btn" onClick={() => addContextFiles()} title="Attach files" aria-label="Attach files">
              <Paperclip size={16} />
            </button>
            <button className="chat-icon-btn" onClick={() => addContextFolder()} title="Attach folder" aria-label="Attach folder">
              <FolderOpen size={16} />
            </button>
            <button
              className="chat-icon-btn"
              onClick={() => setUrlPrompt((v) => !v)}
              title="Add URL"
              aria-label="Add URL context"
            >
              <Link2 size={16} />
            </button>
            <button
              className={`chat-icon-btn ${webSearchEnabled ? 'is-active' : ''}`}
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              title="Web search"
              aria-label="Toggle web search"
              aria-pressed={webSearchEnabled}
            >
              <Globe size={16} />
            </button>
            <button
              className={`chat-icon-btn ${showSettings ? 'is-active' : ''}`}
              onClick={() => setShowSettings((v) => !v)}
              title="Generation settings"
              aria-label="Generation settings"
              aria-expanded={showSettings}
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              className="chat-icon-btn"
              onClick={undoDraft}
              disabled={draftUndoStack.length === 0}
              title="Undo draft"
              aria-label="Undo draft"
            >
              <Undo2 size={14} />
            </button>
            <button
              className="chat-icon-btn"
              onClick={redoDraft}
              disabled={draftRedoStack.length === 0}
              title="Redo draft"
              aria-label="Redo draft"
            >
              <Redo2 size={14} />
            </button>
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
                Temperature
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
                Top P
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
                Max tokens
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
              {webSearchEnabled && (
                <span style={{ fontSize: 11, color: 'var(--accent-cyan)' }}>Web search on</span>
              )}
              {tokenBudget?.overflow && (
                <span style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>
                  Context over budget — remove context or shorten draft
                </span>
              )}
            </div>

            {isGenerating ? (
              <button
                className="composer-send is-stop"
                onClick={() => stopGeneration()}
                aria-label="Stop generation"
                title="Stop"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className={`composer-send ${draft.trim() && !tokenBudget?.overflow ? 'is-ready' : ''}`}
                onClick={() => sendMessage()}
                disabled={!draft.trim() || Boolean(tokenBudget?.overflow)}
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

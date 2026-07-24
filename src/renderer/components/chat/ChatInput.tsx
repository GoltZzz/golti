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
  Redo2,
  Plus,
  MessageSquare,
  Bot
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSearchRuntimeStore } from '../../stores/searchRuntimeStore'
import { getResearchPhaseLabel } from '../../../shared/research-progress'
import { ContextTray } from './ContextTray'
import { UsageMeter } from './UsageMeter'
import { Tooltip } from './Tooltip'
import { ModelSelector } from './ModelSelector'
import { CommandPalette, CommandItem } from './CommandPalette'

interface ChatInputProps {
  isLanding?: boolean
}

export const ChatInput: React.FC<ChatInputProps> = ({ isLanding = false }) => {
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
    composerMode,
    cycleComposerMode,
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
    tokenBudget,
    visibleMessages,
    researchProgressByMessageId
  } = useChatStore()
  const { runtimeState, progress, setupListeners } = useSearchRuntimeStore()

  const activeResearchProgress = (() => {
    if (!isGenerating) return null
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const msg = visibleMessages[i]
      if (msg.role !== 'assistant') continue
      const progress = researchProgressByMessageId[msg.id]
      if (progress && progress.phase !== 'done' && progress.phase !== 'error') {
        return progress
      }
    }
    return null
  })()
  const researchFooterLabel = activeResearchProgress
    ? getResearchPhaseLabel(activeResearchProgress)
    : deepResearchEnabled
      ? 'Deep Research mode'
      : null

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlPrompt, setUrlPrompt] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [draft])

  useEffect(() => setupListeners(), [setupListeners])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setDraft(val)

    // Check for @ trigger
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = val.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1 && (lastAtIndex === 0 || /\s/.test(textBeforeCursor[lastAtIndex - 1]))) {
      const query = textBeforeCursor.slice(lastAtIndex + 1)
      if (!query.includes(' ')) {
        setCommandFilter(query)
        setShowCommandPalette(true)
        return
      }
    }
    if (showCommandPalette) {
      setShowCommandPalette(false)
    }
  }

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
    if (e.key === 'Tab' && e.shiftKey && !showCommandPalette) {
      e.preventDefault()
      cycleComposerMode()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !showCommandPalette) {
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

  const removeAtQueryFromDraft = () => {
    if (!textareaRef.current) return
    const cursorPos = textareaRef.current.selectionStart
    const textBeforeCursor = draft.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      const newDraft = draft.slice(0, lastAtIndex) + draft.slice(cursorPos)
      setDraft(newDraft)
    }
  }

  const availableCommands: CommandItem[] = [
    {
      id: 'attach',
      label: 'Attach Files',
      description: 'Add local files or folders as context',
      icon: <Paperclip size={14} />,
      action: () => {
        removeAtQueryFromDraft()
        addContext()
      }
    },
    {
      id: 'url',
      label: 'Add URL Context',
      description: 'Fetch and attach web page content',
      icon: <Link2 size={14} />,
      action: () => {
        removeAtQueryFromDraft()
        setUrlPrompt(true)
      }
    },
    {
      id: 'websearch',
      label: 'Toggle Web Search',
      description: webSearchEnabled ? 'Web search is currently active' : 'Enable live web search capability',
      icon: <Globe size={14} />,
      isActive: webSearchEnabled,
      action: () => {
        removeAtQueryFromDraft()
        setWebSearchEnabled(!webSearchEnabled)
      }
    },
    {
      id: 'deepresearch',
      label: 'Toggle Deep Research',
      description: deepResearchEnabled ? 'Deep research mode is active' : 'Multi-step web research & synthesis',
      icon: <Search size={14} />,
      isActive: deepResearchEnabled,
      action: () => {
        removeAtQueryFromDraft()
        setDeepResearchEnabled(!deepResearchEnabled)
      }
    },
    {
      id: 'settings',
      label: 'Generation Settings',
      description: 'Adjust temperature, top-p, and max tokens',
      icon: <SlidersHorizontal size={14} />,
      isActive: showSettings,
      action: () => {
        removeAtQueryFromDraft()
        setShowSettings(!showSettings)
      }
    },
    {
      id: 'undo',
      label: 'Undo Draft',
      description: 'Revert last draft edit',
      icon: <Undo2 size={14} />,
      shortcut: '⌘Z',
      action: () => {
        removeAtQueryFromDraft()
        undoDraft()
      }
    },
    {
      id: 'redo',
      label: 'Redo Draft',
      description: 'Restore previous draft edit',
      icon: <Redo2 size={14} />,
      shortcut: '⌘⇧Z',
      action: () => {
        removeAtQueryFromDraft()
        redoDraft()
      }
    }
  ]

  const handleSelectCommand = (cmd: CommandItem) => {
    setShowCommandPalette(false)
    cmd.action()
  }

  const showRuntimeBusy =
    webSearchEnabled &&
    (runtimeState.status === 'downloading' ||
      runtimeState.status === 'starting' ||
      Boolean(progress && progress.percent < 100))

  return (
    <div className={`composer ${isLanding ? 'is-landing' : ''}`}>
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
          {showCommandPalette && (
            <CommandPalette
              filter={commandFilter}
              commands={availableCommands}
              onClose={() => setShowCommandPalette(false)}
              onSelect={handleSelectCommand}
            />
          )}

          <div className="composer-model-row">
            <ModelSelector />
          </div>

          {urlPrompt && (
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px 0' }}>
              <input
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://…"
                aria-label="Context URL"
                autoFocus
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
              <button
                className="chat-ghost-btn"
                onClick={() => setUrlPrompt(false)}
              >
                Cancel
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
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={
              composerMode === 'agent'
                ? isLanding
                  ? 'Describe a task for the agent… (@ for tools)'
                  : 'Tell the agent what to do…'
                : isLanding
                  ? 'Plan, Build, / for skills, @ for context'
                  : 'Ask Golti anything… (@ for tools, Shift+Enter for newline)'
            }
            rows={1}
            disabled={false}
            aria-label="Message input"
          />

          {showSettings && (
            <div className="gen-settings" style={{ padding: '0 12px 8px' }}>
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
              <Tooltip label="Tools & Context (@)">
                <button
                  className={`chat-icon-btn composer-plus-btn ${showCommandPalette ? 'is-active' : ''}`}
                  onClick={() => {
                    setCommandFilter('')
                    setShowCommandPalette((prev) => !prev)
                  }}
                  aria-label="Add context or tools"
                >
                  <Plus size={16} />
                </button>
              </Tooltip>
              <Tooltip label="Switch mode" shortcut="⇧Tab">
                <button
                  type="button"
                  className={`composer-mode-pill ${composerMode === 'agent' ? 'is-agent' : 'is-chat'}`}
                  onClick={() => cycleComposerMode()}
                  aria-label={`Composer mode: ${composerMode === 'agent' ? 'Agent' : 'Chat'}. Press Shift+Tab to switch.`}
                >
                  {composerMode === 'agent' ? <Bot size={12} /> : <MessageSquare size={12} />}
                  <span>{composerMode === 'agent' ? 'Agent' : 'Chat'}</span>
                </button>
              </Tooltip>
              <UsageMeter compact />
              {researchFooterLabel ? (
                <span style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 500 }}>
                  {researchFooterLabel}
                </span>
              ) : webSearchEnabled && (
                <span style={{ fontSize: 11, color: 'var(--accent-cyan)' }}>
                  {forceWebSearchNext ? 'Force search next' : 'Web Search on'}
                </span>
              )}
              {tokenBudget?.overflow && (
                <span style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>
                  Context over budget
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

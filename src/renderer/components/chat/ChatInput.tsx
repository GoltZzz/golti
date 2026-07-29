import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Paperclip,
  Globe,
  Search,
  SlidersHorizontal,
  Square,
  Undo2,
  Redo2,
  Plus,
  MessageSquare,
  HelpCircle,
  Sparkles,
  Wand2
} from 'lucide-react'
import { EggLogo } from '../brand/EggLogo'
import { useChatStore } from '../../stores/chatStore'
import { useSkillStore } from '../../stores/skillStore'
import { useSearchRuntimeStore } from '../../stores/searchRuntimeStore'
import { useSidebarStore } from '../../stores/sidebarStore'
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
    repairWebSearchSetup,
    addContext,
    addContextPaths,
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
  const openSettings = useSidebarStore((s) => s.openSettings)
  const skills = useSkillStore((s) => s.skills)
  const fetchSkills = useSkillStore((s) => s.fetchSkills)

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

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
  const highlightRef = useRef<HTMLDivElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const [paletteTrigger, setPaletteTrigger] = useState<'@' | '/'>('@')

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

    // Check for @ (tools/context) and / (skills) triggers
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = val.slice(0, cursorPos)

    for (const trigger of ['@', '/'] as const) {
      const idx = textBeforeCursor.lastIndexOf(trigger)
      if (idx === -1) continue
      if (idx !== 0 && !/\s/.test(textBeforeCursor[idx - 1])) continue
      const query = textBeforeCursor.slice(idx + 1)
      if (query.includes(' ')) continue
      setPaletteTrigger(trigger)
      setCommandFilter(query)
      setShowCommandPalette(true)
      return
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

  /** Remove the in-progress trigger query, optionally replacing it with text. */
  const removeAtQueryFromDraft = (replacement = '') => {
    if (!textareaRef.current) return
    const cursorPos = textareaRef.current.selectionStart
    const textBeforeCursor = draft.slice(0, cursorPos)
    const idx = textBeforeCursor.lastIndexOf(paletteTrigger)
    if (idx !== -1) {
      setDraft(draft.slice(0, idx) + replacement + draft.slice(cursorPos))
    } else if (replacement) {
      setDraft(draft + replacement)
    }
  }

  const skillCommands: CommandItem[] = [
    {
      id: '__new-skill',
      label: 'skill',
      description: 'Describe a skill and Golti will create it, e.g. /skill ask me questions before answering',
      icon: <Wand2 size={14} />,
      action: () => {
        removeAtQueryFromDraft('/skill ')
        textareaRef.current?.focus()
      }
    },
    ...skills.map((s) => ({
      id: s.id,
      label: s.name,
      description: s.description || 'Custom skill',
      icon: s.name === 'grill-me' ? <HelpCircle size={14} /> : <Sparkles size={14} />,
      action: () => {
        removeAtQueryFromDraft(`/${s.name} `)
        textareaRef.current?.focus()
      }
    }))
  ]

  const toolCommands: CommandItem[] = [
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

  const availableCommands = paletteTrigger === '/' ? skillCommands : toolCommands

  const activeSkill = skills.find((s) => draft === `/${s.name}` || draft.startsWith(`/${s.name} `))
  const skillToken = activeSkill ? `/${activeSkill.name}` : ''

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
              trigger={paletteTrigger}
              commands={availableCommands}
              onClose={() => setShowCommandPalette(false)}
              onSelect={handleSelectCommand}
            />
          )}

          <div className="composer-model-row">
            <ModelSelector />
          </div>

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
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="chat-ghost-btn"
                      onClick={() => setWebSearchEnabled(true)}
                      style={{ fontSize: 11 }}
                    >
                      Retry
                    </button>
                    <button
                      className="chat-ghost-btn"
                      onClick={() => repairWebSearchSetup()}
                      style={{ fontSize: 11 }}
                    >
                      Repair
                    </button>
                    <button
                      className="chat-ghost-btn"
                      onClick={() => openSettings('general')}
                      style={{ fontSize: 11 }}
                    >
                      Settings
                    </button>
                  </div>
                </div>
              ) : (
                <span>
                  {progress?.speed === 'Downloading…'
                    ? 'Downloading Web Search'
                    : progress?.speed === 'Installing…' || progress?.speed === 'Extracting…'
                      ? 'Installing Web Search'
                      : 'Setting up Web Search'}
                  {progress ? `… ${progress.percent}%` : '…'}
                </span>
              )}
            </div>
          )}

          <div className={`composer-input-wrap ${activeSkill ? 'has-skill' : ''}`}>
            {activeSkill && (
              <div ref={highlightRef} className="composer-highlight" aria-hidden="true">
                <span className="composer-skill-token">{skillToken}</span>
                {draft.slice(skillToken.length)}
              </div>
            )}
            <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={draft}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onScroll={(e) => {
              if (highlightRef.current) highlightRef.current.scrollTop = e.currentTarget.scrollTop
            }}
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
          </div>

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
                    label="Limits maximum response length (~100 tokens ≈ 75 words). Leave empty for Auto, which sizes the limit to the model and its context window."
                  >
                    <span className="info-icon" aria-label="Max tokens help">ⓘ</span>
                  </Tooltip>
                </div>
                <input
                  type="number"
                  min={64}
                  max={128000}
                  step={64}
                  placeholder="Auto"
                  value={generationSettings.maxTokens ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    setGenerationSettings({ maxTokens: raw === '' ? undefined : Number(raw) })
                  }}
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
                  {composerMode === 'agent' ? <EggLogo size={12} /> : <MessageSquare size={12} />}
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
              {tokenBudget?.overflow ? (
                <span style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>
                  This message alone exceeds the context window — shorten it, remove attached
                  context, or raise the context size in Settings.
                </span>
              ) : tokenBudget && tokenBudget.trimmedMessages > 0 ? (
                <span style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>
                  {tokenBudget.trimmedMessages} older message
                  {tokenBudget.trimmedMessages === 1 ? '' : 's'} will be left out to fit the context
                  window
                </span>
              ) : null}
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

import { create } from 'zustand'
import type {
  Artifact,
  Citation,
  ComposerMode,
  ContextItem,
  Conversation,
  GenerationSettings,
  Message,
  ModelInfo,
  StreamChunkPayload,
  TokenBudget,
  WebSearchStatus
} from '../../shared/types'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_RESERVED_OUTPUT,
  getActiveLeaf,
  getBranchPath
} from '../../shared/chat-utils'
import {
  createPlanningProgress,
  seedPendingStepsFromPlan,
  type ResearchProgress
} from '../../shared/research-progress'
import { useInspectorStore } from './inspectorStore'

declare global {
  interface Window {
    goltiAPI: any
  }
}

interface UndoEntry {
  id: string
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  visibleMessages: Message[]
  models: ModelInfo[]
  selectedModel: ModelInfo | null
  isLoadingModels: boolean
  isLoadingConversation: boolean
  conversationError: string | null
  isGenerating: boolean
  activeGenerationId: string | null
  contextItems: ContextItem[]
  artifacts: Artifact[]
  citations: Citation[]
  tokenBudget: TokenBudget | null
  webSearchEnabled: boolean
  forceWebSearchNext: boolean
  deepResearchEnabled: boolean
  composerMode: ComposerMode
  searchSetupError: string | null
  searchStatusByMessageId: Record<string, WebSearchStatus>
  researchProgressByMessageId: Record<string, ResearchProgress>
  generationSettings: GenerationSettings
  draft: string
  draftUndoStack: string[]
  draftRedoStack: string[]
  actionUndoStack: UndoEntry[]
  actionRedoStack: UndoEntry[]
  searchQuery: string
  searchHits: Array<{ conversationId: string; title: string; snippet: string }>

  fetchConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  pinConversation: (id: string, pinned: boolean) => Promise<void>
  archiveConversation: (id: string) => Promise<void>
  exportConversation: (format: 'markdown' | 'json') => Promise<void>
  searchConversations: (query: string) => Promise<void>
  sendMessage: (content?: string, options?: { forceWebSearch?: boolean }) => Promise<void>
  stopGeneration: () => Promise<void>
  regenerate: (assistantMessageId: string) => Promise<void>
  editAndResend: (userMessageId: string, content: string) => Promise<void>
  selectBranch: (messageId: string) => Promise<void>
  fetchModels: () => Promise<void>
  setSelectedModel: (model: ModelInfo) => void
  setupStreamListener: () => () => void
  refreshContext: () => Promise<void>
  refreshArtifacts: () => Promise<void>
  refreshBudget: (draft?: string) => Promise<void>
  addContext: () => Promise<void>
  addContextFiles: () => Promise<void>
  addContextFolder: () => Promise<void>
  addContextPaths: (paths: string[]) => Promise<void>
  addContextText: (name: string, content: string) => Promise<void>
  addContextUrl: (url: string) => Promise<void>
  toggleContextItem: (id: string, enabled: boolean) => Promise<void>
  removeContextItem: (id: string) => Promise<void>
  setDraft: (text: string, pushHistory?: boolean) => void
  undoDraft: () => void
  redoDraft: () => void
  undoAction: () => Promise<void>
  redoAction: () => Promise<void>
  setWebSearchEnabled: (enabled: boolean) => Promise<void>
  repairWebSearchSetup: () => Promise<void>
  setForceWebSearchNext: (force: boolean) => void
  setDeepResearchEnabled: (enabled: boolean) => Promise<void>
  setComposerMode: (mode: ComposerMode) => void
  cycleComposerMode: () => void
  setGenerationSettings: (settings: Partial<GenerationSettings>) => void
  updateArtifactContent: (id: string, content: string) => Promise<void>
  restoreArtifactVersion: (id: string, version: number) => Promise<void>
  updateConversationSystemPrompt: (prompt: string) => Promise<void>
  hydrateWebSearchPreference: () => Promise<void>
  createOrSelectShell: (shellData: {
    conversationId: string
    messageId: string
    title: string
    language: string
    content: string
    type: 'code' | 'markdown'
  }) => string
}

function recomputeVisible(messages: Message[], activeLeafId?: string | null): Message[] {
  const leaf = getActiveLeaf(messages, activeLeafId)
  return getBranchPath(messages, leaf)
}

function emptyBudget(): TokenBudget {
  return {
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    usedTokens: 0,
    reservedOutputTokens: DEFAULT_RESERVED_OUTPUT,
    availableTokens: DEFAULT_CONTEXT_WINDOW - DEFAULT_RESERVED_OUTPUT,
    overflow: false,
    items: []
  }
}

function newClientId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function conversationScopedReset() {
  return {
    messages: [] as Message[],
    visibleMessages: [] as Message[],
    contextItems: [] as ContextItem[],
    artifacts: [] as Artifact[],
    citations: [] as Citation[],
    tokenBudget: emptyBudget(),
    draft: '',
    draftUndoStack: [] as string[],
    draftRedoStack: [] as string[],
    isGenerating: false,
    activeGenerationId: null as string | null,
    searchStatusByMessageId: {} as Record<string, WebSearchStatus>,
    researchProgressByMessageId: {} as Record<string, ResearchProgress>,
    conversationError: null as string | null
  }
}

/** Monotonic tokens so async loads cannot overwrite a newer selection. */
let selectSeq = 0
let budgetSeq = 0
let contextSeq = 0
let artifactsSeq = 0

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  visibleMessages: [],
  models: [],
  selectedModel: null,
  isLoadingModels: false,
  isLoadingConversation: false,
  conversationError: null,
  isGenerating: false,
  activeGenerationId: null,
  contextItems: [],
  artifacts: [],
  citations: [],
  tokenBudget: emptyBudget(),
  webSearchEnabled: false,
  forceWebSearchNext: false,
  deepResearchEnabled: false,
  composerMode: 'chat',
  searchSetupError: null,
  searchStatusByMessageId: {},
  researchProgressByMessageId: {},
  generationSettings: { temperature: 0.7, topP: 0.9, maxTokens: 2048 },
  draft: '',
  draftUndoStack: [],
  draftRedoStack: [],
  actionUndoStack: [],
  actionRedoStack: [],
  searchQuery: '',
  searchHits: [],

  hydrateWebSearchPreference: async () => {
    try {
      const settings = await window.goltiAPI.getSettings()
      if (typeof settings?.deepResearchEnabled === 'boolean') {
        set({ deepResearchEnabled: settings.deepResearchEnabled })
      }
      if (settings?.composerMode === 'chat' || settings?.composerMode === 'agent') {
        set({ composerMode: settings.composerMode })
      }
      if (typeof settings?.webSearchEnabled === 'boolean') {
        set({ webSearchEnabled: settings.webSearchEnabled })
        return
      }
      // Migrate legacy Off/Auto/On preference
      const legacy = settings?.defaultWebSearchMode
      set({ webSearchEnabled: legacy === 'auto' || legacy === 'on' })
    } catch {
      // keep default
    }
  },

  fetchConversations: async () => {
    try {
      const convs = await window.goltiAPI.getConversations()
      const currentId = get().currentConversationId
      set({ conversations: convs })
      if (convs.length > 0 && !currentId) {
        await get().selectConversation(convs[0].id)
      } else if (currentId && !convs.some((c: Conversation) => c.id === currentId)) {
        if (convs.length > 0) await get().selectConversation(convs[0].id)
        else set({ currentConversationId: null, ...conversationScopedReset() })
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
      set({ conversationError: 'Failed to load conversations' })
    }
  },

  selectConversation: async (id: string) => {
    const seq = ++selectSeq
    set({
      ...conversationScopedReset(),
      currentConversationId: id,
      isLoadingConversation: true,
      // keep generation settings until we load conversation-specific ones
      generationSettings: get().generationSettings
    })

    try {
      const msgs: Message[] = await window.goltiAPI.getMessages(id)
      if (seq !== selectSeq || get().currentConversationId !== id) return

      const conv =
        get().conversations.find((c) => c.id === id) || (await window.goltiAPI.getConversation(id))
      if (seq !== selectSeq || get().currentConversationId !== id) return

      const visible = recomputeVisible(msgs, conv?.activeLeafId)
      set({
        messages: msgs,
        visibleMessages: visible,
        generationSettings: {
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2048,
          ...conv?.generationSettings
        },
        isLoadingConversation: false
      })

      if (conv) {
        const matchingModel = get().models.find(
          (m) =>
            (m.providerId === conv.providerId && m.name === conv.model) || m.name === conv.model
        )
        if (matchingModel) set({ selectedModel: matchingModel })
      }

      await Promise.all([get().refreshContext(), get().refreshArtifacts(), get().refreshBudget()])
      if (seq !== selectSeq || get().currentConversationId !== id) return

      const citations = await window.goltiAPI.listCitations(id)
      if (seq !== selectSeq || get().currentConversationId !== id) return
      set({ citations })
    } catch (err) {
      console.error('Failed to fetch messages:', err)
      if (seq === selectSeq && get().currentConversationId === id) {
        set({
          isLoadingConversation: false,
          conversationError: 'Failed to load conversation'
        })
      }
    }
  },

  newConversation: async () => {
    const selected = get().selectedModel
    const newConv: Conversation = {
      id: newClientId('conv'),
      title: 'New Conversation',
      model: selected ? selected.name : 'llama3:latest',
      providerId: selected ? selected.providerId : 'ollama-local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      archived: false,
      activeLeafId: null
    }

    // Optimistic: show immediately and clear scoped state before async work
    set((state) => ({
      ...conversationScopedReset(),
      conversations: [newConv, ...state.conversations.filter((c) => c.id !== newConv.id)],
      currentConversationId: newConv.id,
      isLoadingConversation: false,
      generationSettings: { temperature: 0.7, topP: 0.9, maxTokens: 2048 }
    }))
    selectSeq += 1

    try {
      await window.goltiAPI.createConversation(newConv)
      // Refresh list without auto-selecting a different conversation
      const convs = await window.goltiAPI.getConversations()
      if (get().currentConversationId === newConv.id) {
        set({
          conversations: convs.some((c: Conversation) => c.id === newConv.id)
            ? convs
            : [newConv, ...convs]
        })
        await get().refreshBudget()
      }
    } catch (err) {
      console.error('Failed to create conversation:', err)
      set({ conversationError: 'Failed to create conversation' })
    }

    return newConv.id
  },

  deleteConversation: async (id: string) => {
    await window.goltiAPI.deleteConversation(id)
    const convs = get().conversations.filter((c) => c.id !== id)
    set({ conversations: convs })
    if (get().currentConversationId === id) {
      if (convs.length > 0) {
        await get().selectConversation(convs[0].id)
      } else {
        set({
          currentConversationId: null,
          ...conversationScopedReset()
        })
      }
    }
  },

  pinConversation: async (id: string, pinned: boolean) => {
    const prev = get().conversations.find((c) => c.id === id)?.pinned
    await window.goltiAPI.updateConversation(id, { pinned })
    await get().fetchConversations()
    get().actionUndoStack.push({
      id: `pin_${Date.now()}`,
      label: pinned ? 'Pin conversation' : 'Unpin conversation',
      undo: async () => {
        await window.goltiAPI.updateConversation(id, { pinned: Boolean(prev) })
        await get().fetchConversations()
      },
      redo: async () => {
        await window.goltiAPI.updateConversation(id, { pinned })
        await get().fetchConversations()
      }
    })
    set({ actionRedoStack: [] })
  },

  archiveConversation: async (id: string) => {
    await window.goltiAPI.updateConversation(id, { archived: true })
    await get().fetchConversations()
    if (get().currentConversationId === id) {
      const convs = get().conversations
      if (convs.length > 0) await get().selectConversation(convs[0].id)
      else set({ currentConversationId: null, ...conversationScopedReset() })
    }
  },

  exportConversation: async (format) => {
    const id = get().currentConversationId
    if (!id) return
    await window.goltiAPI.exportConversation({ conversationId: id, format })
  },

  searchConversations: async (query: string) => {
    set({ searchQuery: query })
    if (!query.trim()) {
      set({ searchHits: [] })
      return
    }
    const hits = await window.goltiAPI.searchConversations(query)
    set({ searchHits: hits })
  },

  sendMessage: async (content, options) => {
    const text = (content ?? get().draft).trim()
    if (!text || get().isGenerating) return

    let convId = get().currentConversationId
    if (!convId) {
      convId = await get().newConversation()
    }

    const selected = get().selectedModel
    const modelName = selected ? selected.name : 'llama3:latest'
    const providerId = selected ? selected.providerId : 'ollama-local'
    const conv = get().conversations.find((c) => c.id === convId)
    const settings = await window.goltiAPI.getSettings()
    const forceWebSearch = Boolean(options?.forceWebSearch || get().forceWebSearchNext)

    if (conv && conv.title === 'New Conversation') {
      const truncatedTitle = text.slice(0, 30) + (text.length > 30 ? '...' : '')
      await window.goltiAPI.updateConversation(convId, {
        title: truncatedTitle,
        model: modelName,
        providerId
      })
      get().fetchConversations()
    }

    const now = Date.now()
    const tempUserMsg: Message = {
      id: `temp_u_${now}`,
      conversationId: convId,
      role: 'user',
      content: text,
      createdAt: now,
      parentId: conv?.activeLeafId ?? null
    }
    const deepResearchEnabled = get().deepResearchEnabled
    const tempAssistantMsg: Message = {
      id: `temp_a_${now}`,
      conversationId: convId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      isStreaming: true,
      parentId: tempUserMsg.id,
      isDeepResearch: deepResearchEnabled || undefined
    }

    set((state) => {
      const messages = [...state.messages, tempUserMsg, tempAssistantMsg]
      const researchProgressByMessageId = deepResearchEnabled
        ? {
            ...state.researchProgressByMessageId,
            [tempAssistantMsg.id]: createPlanningProgress(text)
          }
        : state.researchProgressByMessageId
      return {
        messages,
        visibleMessages: recomputeVisible(messages, tempAssistantMsg.id),
        isGenerating: true,
        draft: '',
        draftUndoStack: [],
        draftRedoStack: [],
        forceWebSearchNext: false,
        searchSetupError: null,
        researchProgressByMessageId
      }
    })

    const result = await window.goltiAPI.sendMessage({
      conversationId: convId,
      content: text,
      model: modelName,
      providerId,
      systemPrompt: conv?.systemPrompt || settings?.systemPrompt,
      parentId: conv?.activeLeafId ?? null,
      webSearchEnabled: get().webSearchEnabled,
      forceWebSearch,
      deepResearchEnabled,
      composerMode: get().composerMode,
      contextItemIds: get()
        .contextItems.filter((c) => c.enabled)
        .map((c) => c.id),
      generationSettings: get().generationSettings
    })

    set((state) => {
      const idMap = new Map<string, string>()
      if (result.userMsgId) idMap.set(tempUserMsg.id, result.userMsgId)
      idMap.set(tempAssistantMsg.id, result.assistantMsgId)

      const messages = state.messages.map((m) => {
        const nextId = idMap.get(m.id) || m.id
        const nextParent =
          m.parentId && idMap.has(m.parentId) ? idMap.get(m.parentId)! : m.parentId
        return {
          ...m,
          id: nextId,
          parentId: nextParent,
          generationId: m.id === tempAssistantMsg.id ? result.generationId : m.generationId
        }
      })

      const searchStatusByMessageId = { ...state.searchStatusByMessageId }
      const pendingSearch = searchStatusByMessageId[tempAssistantMsg.id]
      if (pendingSearch) {
        delete searchStatusByMessageId[tempAssistantMsg.id]
        searchStatusByMessageId[result.assistantMsgId] = pendingSearch
      }

      const researchProgressByMessageId = { ...state.researchProgressByMessageId }
      const pendingResearch = researchProgressByMessageId[tempAssistantMsg.id]
      if (pendingResearch) {
        delete researchProgressByMessageId[tempAssistantMsg.id]
        researchProgressByMessageId[result.assistantMsgId] = pendingResearch
      }

      return {
        messages,
        visibleMessages: recomputeVisible(messages, result.assistantMsgId),
        activeGenerationId: result.generationId,
        searchStatusByMessageId,
        researchProgressByMessageId,
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, activeLeafId: result.assistantMsgId } : c
        )
      }
    })
  },

  stopGeneration: async () => {
    const genId = get().activeGenerationId
    if (!genId) return
    await window.goltiAPI.cancelGeneration(genId)
    set((state) => {
      const messages = state.messages.map((msg) =>
        msg.isStreaming || msg.generationId === genId
          ? { ...msg, isStreaming: false }
          : msg
      )
      let researchProgressByMessageId = state.researchProgressByMessageId
      for (const [messageId, progress] of Object.entries(researchProgressByMessageId)) {
        if (progress.phase !== 'done' && progress.phase !== 'error') {
          researchProgressByMessageId = {
            ...researchProgressByMessageId,
            [messageId]: { ...progress, phase: 'done' }
          }
        }
      }
      return {
        messages,
        visibleMessages: recomputeVisible(
          messages,
          state.conversations.find((c) => c.id === state.currentConversationId)?.activeLeafId
        ),
        isGenerating: false,
        activeGenerationId: null,
        researchProgressByMessageId
      }
    })
  },

  regenerate: async (assistantMessageId: string) => {
    const convId = get().currentConversationId
    if (!convId || get().isGenerating) return
    const selected = get().selectedModel
    const settings = await window.goltiAPI.getSettings()
    const conv = get().conversations.find((c) => c.id === convId)

    set({ isGenerating: true })
    const result = await window.goltiAPI.regenerateMessage({
      conversationId: convId,
      content: '',
      model: selected?.name || 'llama3:latest',
      providerId: selected?.providerId || 'ollama-local',
      systemPrompt: conv?.systemPrompt || settings?.systemPrompt,
      messageId: assistantMessageId,
      webSearchEnabled: get().webSearchEnabled,
      forceWebSearch: get().forceWebSearchNext,
      deepResearchEnabled: get().deepResearchEnabled,
      composerMode: get().composerMode,
      generationSettings: get().generationSettings
    })
    set({ forceWebSearchNext: false })

    const msgs = await window.goltiAPI.getMessages(convId)
    if (get().currentConversationId !== convId) return
    set({
      messages: msgs,
      visibleMessages: recomputeVisible(msgs, result.assistantMsgId),
      activeGenerationId: result.generationId,
      isGenerating: true,
      conversations: get().conversations.map((c) =>
        c.id === convId ? { ...c, activeLeafId: result.assistantMsgId } : c
      )
    })
  },

  editAndResend: async (userMessageId: string, content: string) => {
    const convId = get().currentConversationId
    if (!convId || get().isGenerating) return
    const selected = get().selectedModel
    const settings = await window.goltiAPI.getSettings()
    const conv = get().conversations.find((c) => c.id === convId)
    const prev = get().messages.find((m) => m.id === userMessageId)?.content

    set({ isGenerating: true })
    const result = await window.goltiAPI.sendMessage({
      conversationId: convId,
      content,
      model: selected?.name || 'llama3:latest',
      providerId: selected?.providerId || 'ollama-local',
      systemPrompt: conv?.systemPrompt || settings?.systemPrompt,
      editMessageId: userMessageId,
      webSearchEnabled: get().webSearchEnabled,
      forceWebSearch: get().forceWebSearchNext,
      deepResearchEnabled: get().deepResearchEnabled,
      composerMode: get().composerMode,
      generationSettings: get().generationSettings
    })
    set({ forceWebSearchNext: false })

    get().actionUndoStack.push({
      id: `edit_${Date.now()}`,
      label: 'Edit message',
      undo: async () => {
        if (prev != null) await window.goltiAPI.updateMessage(userMessageId, { content: prev })
        await get().selectConversation(convId)
      },
      redo: async () => {
        await window.goltiAPI.updateMessage(userMessageId, { content })
        await get().selectConversation(convId)
      }
    })

    const msgs = await window.goltiAPI.getMessages(convId)
    if (get().currentConversationId !== convId) return
    set({
      messages: msgs,
      visibleMessages: recomputeVisible(msgs, result.assistantMsgId),
      activeGenerationId: result.generationId,
      actionRedoStack: []
    })
  },

  selectBranch: async (messageId: string) => {
    const convId = get().currentConversationId
    if (!convId) return
    const prevLeaf = get().conversations.find((c) => c.id === convId)?.activeLeafId
    await window.goltiAPI.setActiveLeaf(convId, messageId)
    const msgs = await window.goltiAPI.getMessages(convId)
    if (get().currentConversationId !== convId) return
    set((state) => ({
      messages: msgs,
      visibleMessages: recomputeVisible(msgs, messageId),
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, activeLeafId: messageId } : c
      )
    }))
    get().actionUndoStack.push({
      id: `branch_${Date.now()}`,
      label: 'Switch branch',
      undo: async () => {
        if (prevLeaf) {
          await window.goltiAPI.setActiveLeaf(convId, prevLeaf)
          await get().selectConversation(convId)
        }
      },
      redo: async () => {
        await window.goltiAPI.setActiveLeaf(convId, messageId)
        await get().selectConversation(convId)
      }
    })
    set({ actionRedoStack: [] })
    await get().refreshBudget()
  },

  fetchModels: async () => {
    set({ isLoadingModels: true })
    try {
      const modelsList: ModelInfo[] = await window.goltiAPI.getModels()
      set({ models: modelsList, isLoadingModels: false })

      const currentConvId = get().currentConversationId
      const currentConv = get().conversations.find((c) => c.id === currentConvId)

      if (currentConv) {
        const matchingModel = modelsList.find(
          (m) =>
            (m.providerId === currentConv.providerId && m.name === currentConv.model) ||
            m.name === currentConv.model
        )
        if (matchingModel) {
          set({ selectedModel: matchingModel })
          return
        }
      }

      if (modelsList.length > 0 && !get().selectedModel) {
        set({ selectedModel: modelsList[0] })
      }
    } catch (err) {
      console.error('Failed to fetch models:', err)
      set({ isLoadingModels: false })
    }
  },

  setSelectedModel: (model: ModelInfo) => {
    set({ selectedModel: model })
    const convId = get().currentConversationId
    if (convId) {
      window.goltiAPI.updateConversation(convId, { model: model.name, providerId: model.providerId })
    }
  },

  setupStreamListener: () => {
    return window.goltiAPI.onStreamChunk((chunk: StreamChunkPayload) => {
      const {
        conversationId,
        messageId,
        contentDelta,
        correctedContent,
        reasoningContent: chunkReasoningContent,
        thinkingDelta,
        thinkingDurationMs,
        done,
        error,
        usage,
        citation,
        shell,
        artifact,
        searchStatus,
        researchPlan,
        researchStep
      } = chunk
      if (get().currentConversationId !== conversationId) return

      set((state) => {
        const messages = state.messages.map((msg) => {
          if (msg.id === messageId) {
            const reasoningContent =
              chunkReasoningContent || (msg.reasoningContent || '') + (thinkingDelta || '')
            const nextContent =
              correctedContent !== undefined ? correctedContent : msg.content + (contentDelta || '')
            return {
              ...msg,
              content: nextContent,
              reasoningContent: reasoningContent || msg.reasoningContent,
              thinkingDurationMs: thinkingDurationMs ?? msg.thinkingDurationMs,
              isStreaming: !done,
              error: error || msg.error,
              tokensIn: usage?.promptTokens ?? msg.tokensIn,
              tokensOut: usage?.completionTokens ?? msg.tokensOut
            }
          }
          return msg
        })

        const citations = citation ? [...state.citations, citation] : state.citations
        const activeShell = shell || artifact
        const artifacts = activeShell
          ? [...state.artifacts.filter((a) => a.id !== activeShell.id), activeShell]
          : state.artifacts

        const searchStatusByMessageId = searchStatus
          ? { ...state.searchStatusByMessageId, [messageId]: searchStatus }
          : state.searchStatusByMessageId

        let researchProgressByMessageId = state.researchProgressByMessageId
        if (researchPlan) {
          researchProgressByMessageId = {
            ...researchProgressByMessageId,
            [messageId]: {
              plan: researchPlan,
              steps: seedPendingStepsFromPlan(researchPlan),
              phase: 'searching'
            }
          }
        }
        if (researchStep) {
          const current = researchProgressByMessageId[messageId] || {
            steps: [],
            phase: 'searching' as const
          }
          const existingSteps = current.steps
          const idx = existingSteps.findIndex((s) => s.stepIndex === researchStep.stepIndex)
          const newSteps =
            idx >= 0
              ? existingSteps.map((s, i) => (i === idx ? researchStep : s))
              : [...existingSteps, researchStep]
          researchProgressByMessageId = {
            ...researchProgressByMessageId,
            [messageId]: {
              ...current,
              steps: newSteps,
              phase: current.phase === 'planning' ? 'searching' : current.phase
            }
          }
        }

        const existingResearch = researchProgressByMessageId[messageId]
        if (
          existingResearch &&
          (contentDelta || correctedContent !== undefined) &&
          (existingResearch.phase === 'searching' || existingResearch.phase === 'planning')
        ) {
          researchProgressByMessageId = {
            ...researchProgressByMessageId,
            [messageId]: { ...existingResearch, phase: 'synthesizing' }
          }
        }
        if (existingResearch && done) {
          researchProgressByMessageId = {
            ...researchProgressByMessageId,
            [messageId]: {
              ...researchProgressByMessageId[messageId],
              phase: error ? 'error' : 'done'
            }
          }
        }

        return {
          messages,
          visibleMessages: recomputeVisible(
            messages,
            get().conversations.find((c) => c.id === conversationId)?.activeLeafId || messageId
          ),
          citations,
          artifacts,
          searchStatusByMessageId,
          researchProgressByMessageId,
          isGenerating: !done,
          activeGenerationId: done ? null : state.activeGenerationId
        }
      })

      if (done) {
        get().fetchConversations()
        get().refreshBudget()
        get().refreshArtifacts()
      }
    })
  },

  refreshContext: async () => {
    const id = get().currentConversationId
    if (!id) {
      set({ contextItems: [] })
      return
    }
    const seq = ++contextSeq
    const items = await window.goltiAPI.listContext(id)
    if (seq !== contextSeq || get().currentConversationId !== id) return
    set({ contextItems: items })
  },

  refreshArtifacts: async () => {
    const id = get().currentConversationId
    if (!id) {
      set({ artifacts: [] })
      return
    }
    const seq = ++artifactsSeq
    const arts = await window.goltiAPI.listArtifacts(id)
    if (seq !== artifactsSeq || get().currentConversationId !== id) return
    set({ artifacts: arts })
  },

  createOrSelectShell: (shellData) => {
    const existing = get().artifacts.find(
      (a) =>
        a.messageId === shellData.messageId &&
        (a.content.trim() === shellData.content.trim() || a.language === shellData.language)
    )
    if (existing) {
      useInspectorStore.getState().selectShell(existing.id)
      return existing.id
    }

    const newShell: Artifact = {
      id: `art_dyn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      conversationId: shellData.conversationId,
      messageId: shellData.messageId,
      type: shellData.type,
      title: shellData.title,
      language: shellData.language,
      content: shellData.content,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    set((state) => ({
      artifacts: [...state.artifacts, newShell]
    }))

    useInspectorStore.getState().selectShell(newShell.id)
    return newShell.id
  },

  refreshBudget: async (draft) => {
    const id = get().currentConversationId
    if (!id) {
      set({ tokenBudget: emptyBudget() })
      return
    }
    const seq = ++budgetSeq
    const draftText = draft ?? get().draft
    try {
      const budget = await window.goltiAPI.getTokenBudget(id, draftText)
      if (seq !== budgetSeq || get().currentConversationId !== id) return
      set({ tokenBudget: budget })
    } catch (err) {
      console.error('Failed to refresh token budget:', err)
      if (seq === budgetSeq && get().currentConversationId === id) {
        set({ tokenBudget: emptyBudget() })
      }
    }
  },

  addContext: async () => {
    const id = get().currentConversationId || (await get().newConversation())
    await window.goltiAPI.pickContext(id)
    await get().refreshContext()
    await get().refreshBudget()
  },

  addContextFiles: async () => {
    const id = get().currentConversationId || (await get().newConversation())
    await window.goltiAPI.pickContextFiles(id)
    await get().refreshContext()
    await get().refreshBudget()
  },

  addContextFolder: async () => {
    const id = get().currentConversationId || (await get().newConversation())
    await window.goltiAPI.pickContextFolder(id)
    await get().refreshContext()
    await get().refreshBudget()
  },

  addContextPaths: async (paths: string[]) => {
    const id = get().currentConversationId || (await get().newConversation())
    await window.goltiAPI.addContextPaths(id, paths)
    await get().refreshContext()
    await get().refreshBudget()
  },

  addContextText: async (name, content) => {
    const id = get().currentConversationId || (await get().newConversation())
    const item = await window.goltiAPI.addContextText(id, name, content)
    await get().refreshContext()
    await get().refreshBudget()
    get().actionUndoStack.push({
      id: `ctx_${Date.now()}`,
      label: 'Add context',
      undo: async () => {
        await window.goltiAPI.deleteContext(item.id)
        await get().refreshContext()
      },
      redo: async () => {
        await window.goltiAPI.addContextText(id, name, content)
        await get().refreshContext()
      }
    })
  },

  addContextUrl: async (url) => {
    const id = get().currentConversationId || (await get().newConversation())
    await window.goltiAPI.addContextUrl(id, url)
    await get().refreshContext()
    await get().refreshBudget()
  },

  toggleContextItem: async (id, enabled) => {
    await window.goltiAPI.updateContext(id, { enabled })
    await get().refreshContext()
    await get().refreshBudget()
  },

  removeContextItem: async (id) => {
    const item = get().contextItems.find((c) => c.id === id)
    await window.goltiAPI.deleteContext(id)
    await get().refreshContext()
    await get().refreshBudget()
    if (item) {
      get().actionUndoStack.push({
        id: `rmctx_${Date.now()}`,
        label: 'Remove context',
        undo: async () => {
          const convId = get().currentConversationId
          if (!convId) return
          await window.goltiAPI.addContextText(convId, item.name, item.content)
          await get().refreshContext()
        },
        redo: async () => {
          await window.goltiAPI.deleteContext(id)
          await get().refreshContext()
        }
      })
    }
  },

  setDraft: (text, pushHistory = true) => {
    if (pushHistory) {
      const prev = get().draft
      if (prev !== text) {
        set((s) => ({
          draft: text,
          draftUndoStack: [...s.draftUndoStack.slice(-49), prev],
          draftRedoStack: []
        }))
        get().refreshBudget(text)
        return
      }
    }
    set({ draft: text })
    get().refreshBudget(text)
  },

  undoDraft: () => {
    const stack = get().draftUndoStack
    if (stack.length === 0) return
    const prev = stack[stack.length - 1]
    set((s) => ({
      draft: prev,
      draftUndoStack: s.draftUndoStack.slice(0, -1),
      draftRedoStack: [...s.draftRedoStack, s.draft]
    }))
    get().refreshBudget(prev)
  },

  redoDraft: () => {
    const stack = get().draftRedoStack
    if (stack.length === 0) return
    const next = stack[stack.length - 1]
    set((s) => ({
      draft: next,
      draftRedoStack: s.draftRedoStack.slice(0, -1),
      draftUndoStack: [...s.draftUndoStack, s.draft]
    }))
    get().refreshBudget(next)
  },

  undoAction: async () => {
    const stack = get().actionUndoStack
    if (stack.length === 0) return
    const entry = stack[stack.length - 1]
    set((s) => ({
      actionUndoStack: s.actionUndoStack.slice(0, -1),
      actionRedoStack: [...s.actionRedoStack, entry]
    }))
    await entry.undo()
  },

  redoAction: async () => {
    const stack = get().actionRedoStack
    if (stack.length === 0) return
    const entry = stack[stack.length - 1]
    set((s) => ({
      actionRedoStack: s.actionRedoStack.slice(0, -1),
      actionUndoStack: [...s.actionUndoStack, entry]
    }))
    await entry.redo()
  },

  setWebSearchEnabled: async (enabled) => {
    set({ webSearchEnabled: enabled, searchSetupError: null, deepResearchEnabled: enabled ? get().deepResearchEnabled : false })
    window.goltiAPI
      .updateSettings({
        webSearchEnabled: enabled,
        defaultWebSearchMode: enabled ? 'auto' : 'off',
        deepResearchEnabled: enabled ? get().deepResearchEnabled : false
      })
      .catch(() => {})

    if (!enabled) return

    // First enable: install/start local search runtime automatically
    try {
      const status = await window.goltiAPI.getSearchRuntimeStatus()
      if (status.status === 'running' && status.apiHealthy) return
      const next =
        status.status === 'not-installed' || status.status === 'error'
          ? await window.goltiAPI.installSearchRuntime()
          : await window.goltiAPI.startSearchRuntime()
      if (next.status === 'error' || !next.apiHealthy) {
        set({
          searchSetupError: next.error || 'Web Search could not start. Please try again.'
        })
      }
    } catch (err: any) {
      set({
        searchSetupError: err?.message || 'Web Search could not start. Please try again.'
      })
    }
  },

  repairWebSearchSetup: async () => {
    set({ searchSetupError: null, webSearchEnabled: true })
    window.goltiAPI
      .updateSettings({
        webSearchEnabled: true,
        defaultWebSearchMode: 'auto'
      })
      .catch(() => {})
    try {
      const next = await window.goltiAPI.repairSearchRuntime()
      if (next.status === 'error' || !next.apiHealthy) {
        set({
          searchSetupError: next.error || 'Web Search could not start. Please try again.'
        })
      }
    } catch (err: any) {
      set({
        searchSetupError: err?.message || 'Web Search could not start. Please try again.'
      })
    }
  },

  setForceWebSearchNext: (force) => set({ forceWebSearchNext: force }),

  setComposerMode: (mode) => {
    set({ composerMode: mode })
    window.goltiAPI.updateSettings({ composerMode: mode }).catch(() => {})
  },

  cycleComposerMode: () => {
    const next = get().composerMode === 'chat' ? 'agent' : 'chat'
    get().setComposerMode(next)
  },

  setDeepResearchEnabled: async (enabled) => {
    set({ deepResearchEnabled: enabled })
    window.goltiAPI.updateSettings({ deepResearchEnabled: enabled }).catch(() => {})
    if (enabled && !get().webSearchEnabled) {
      await get().setWebSearchEnabled(true)
    }
  },

  setGenerationSettings: (settings) => {
    set((s) => ({ generationSettings: { ...s.generationSettings, ...settings } }))
    const id = get().currentConversationId
    if (id) {
      window.goltiAPI.updateConversation(id, {
        generationSettings: { ...get().generationSettings, ...settings }
      })
    }
  },

  updateArtifactContent: async (id, content) => {
    await window.goltiAPI.updateArtifact(id, content)
    await get().refreshArtifacts()
  },

  restoreArtifactVersion: async (id, version) => {
    await window.goltiAPI.restoreArtifactVersion(id, version)
    await get().refreshArtifacts()
  },

  updateShellContent: async (id: string, content: string) => {
    await window.goltiAPI.updateArtifact(id, content)
    await get().refreshArtifacts()
  },

  restoreShellVersion: async (id: string, version: number) => {
    await window.goltiAPI.restoreArtifactVersion(id, version)
    await get().refreshArtifacts()
  },

  updateConversationSystemPrompt: async (prompt) => {
    const id = get().currentConversationId
    if (!id) return
    await window.goltiAPI.updateConversation(id, { systemPrompt: prompt })
    await get().fetchConversations()
    await get().refreshBudget()
  }
}))

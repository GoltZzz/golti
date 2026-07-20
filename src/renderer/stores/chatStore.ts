import { create } from 'zustand'
import type {
  Artifact,
  Citation,
  ContextItem,
  Conversation,
  GenerationSettings,
  Message,
  ModelInfo,
  StreamChunkPayload,
  TokenBudget
} from '../../shared/types'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_RESERVED_OUTPUT,
  getActiveLeaf,
  getBranchPath
} from '../../shared/chat-utils'

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
  isGenerating: boolean
  activeGenerationId: string | null
  contextItems: ContextItem[]
  artifacts: Artifact[]
  citations: Citation[]
  tokenBudget: TokenBudget | null
  webSearchEnabled: boolean
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
  sendMessage: (content?: string) => Promise<void>
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
  setWebSearchEnabled: (enabled: boolean) => void
  setGenerationSettings: (settings: Partial<GenerationSettings>) => void
  updateArtifactContent: (id: string, content: string) => Promise<void>
  restoreArtifactVersion: (id: string, version: number) => Promise<void>
  updateConversationSystemPrompt: (prompt: string) => Promise<void>
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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  visibleMessages: [],
  models: [],
  selectedModel: null,
  isLoadingModels: false,
  isGenerating: false,
  activeGenerationId: null,
  contextItems: [],
  artifacts: [],
  citations: [],
  tokenBudget: emptyBudget(),
  webSearchEnabled: false,
  generationSettings: { temperature: 0.7, topP: 0.9, maxTokens: 2048 },
  draft: '',
  draftUndoStack: [],
  draftRedoStack: [],
  actionUndoStack: [],
  actionRedoStack: [],
  searchQuery: '',
  searchHits: [],

  fetchConversations: async () => {
    try {
      const convs = await window.goltiAPI.getConversations()
      set({ conversations: convs })
      if (convs.length > 0 && !get().currentConversationId) {
        await get().selectConversation(convs[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    }
  },

  selectConversation: async (id: string) => {
    try {
      set({ currentConversationId: id, isGenerating: false, activeGenerationId: null })
      const msgs: Message[] = await window.goltiAPI.getMessages(id)
      const conv = get().conversations.find((c) => c.id === id) || (await window.goltiAPI.getConversation(id))
      const visible = recomputeVisible(msgs, conv?.activeLeafId)
      set({
        messages: msgs,
        visibleMessages: visible,
        generationSettings: {
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2048,
          ...conv?.generationSettings
        }
      })

      if (conv) {
        const matchingModel = get().models.find(
          (m) =>
            (m.providerId === conv.providerId && m.name === conv.model) || m.name === conv.model
        )
        if (matchingModel) set({ selectedModel: matchingModel })
      }

      await Promise.all([get().refreshContext(), get().refreshArtifacts(), get().refreshBudget()])
      const citations = await window.goltiAPI.listCitations(id)
      set({ citations })
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    }
  },

  newConversation: async () => {
    const selected = get().selectedModel
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      title: 'New Conversation',
      model: selected ? selected.name : 'llama3:latest',
      providerId: selected ? selected.providerId : 'ollama-local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      archived: false,
      activeLeafId: null
    }

    await window.goltiAPI.createConversation(newConv)
    await get().fetchConversations()
    await get().selectConversation(newConv.id)
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
          messages: [],
          visibleMessages: [],
          contextItems: [],
          artifacts: [],
          citations: []
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
      else set({ currentConversationId: null, messages: [], visibleMessages: [] })
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

  sendMessage: async (content) => {
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
    const tempAssistantMsg: Message = {
      id: `temp_a_${now}`,
      conversationId: convId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      isStreaming: true,
      parentId: tempUserMsg.id
    }

    set((state) => {
      const messages = [...state.messages, tempUserMsg, tempAssistantMsg]
      return {
        messages,
        visibleMessages: recomputeVisible(messages, tempAssistantMsg.id),
        isGenerating: true,
        draft: '',
        draftUndoStack: [],
        draftRedoStack: []
      }
    })

    const result = await window.goltiAPI.sendMessage({
      conversationId: convId,
      content: text,
      model: modelName,
      providerId,
      systemPrompt: conv?.systemPrompt || settings?.systemPrompt,
      parentId: conv?.activeLeafId ?? null,
      webSearch: get().webSearchEnabled,
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
      return {
        messages,
        visibleMessages: recomputeVisible(messages, result.assistantMsgId),
        activeGenerationId: result.generationId
      }
    })
  },

  stopGeneration: async () => {
    const genId = get().activeGenerationId
    if (!genId) return
    await window.goltiAPI.cancelGeneration(genId)
    set({ isGenerating: false, activeGenerationId: null })
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
      webSearch: get().webSearchEnabled,
      generationSettings: get().generationSettings
    })

    const msgs = await window.goltiAPI.getMessages(convId)
    set({
      messages: msgs,
      visibleMessages: recomputeVisible(msgs, result.assistantMsgId),
      activeGenerationId: result.generationId,
      isGenerating: true
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
      webSearch: get().webSearchEnabled,
      generationSettings: get().generationSettings
    })

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
      const { conversationId, messageId, contentDelta, done, error, usage, citation, artifact } = chunk
      if (get().currentConversationId !== conversationId) return

      set((state) => {
        let messages = state.messages.map((msg) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              content: msg.content + (contentDelta || ''),
              isStreaming: !done,
              error: error || msg.error,
              tokensIn: usage?.promptTokens ?? msg.tokensIn,
              tokensOut: usage?.completionTokens ?? msg.tokensOut
            }
          }
          return msg
        })

        const citations = citation ? [...state.citations, citation] : state.citations
        const artifacts = artifact ? [...state.artifacts.filter((a) => a.id !== artifact.id), artifact] : state.artifacts

        return {
          messages,
          visibleMessages: recomputeVisible(
            messages,
            get().conversations.find((c) => c.id === conversationId)?.activeLeafId || messageId
          ),
          citations,
          artifacts,
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
    const items = await window.goltiAPI.listContext(id)
    set({ contextItems: items })
  },

  refreshArtifacts: async () => {
    const id = get().currentConversationId
    if (!id) {
      set({ artifacts: [] })
      return
    }
    const arts = await window.goltiAPI.listArtifacts(id)
    set({ artifacts: arts })
  },

  refreshBudget: async (draft) => {
    const id = get().currentConversationId
    if (!id) {
      set({ tokenBudget: emptyBudget() })
      return
    }
    const budget = await window.goltiAPI.getTokenBudget(id, draft ?? get().draft)
    set({ tokenBudget: budget })
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

  setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),

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

  updateConversationSystemPrompt: async (prompt) => {
    const id = get().currentConversationId
    if (!id) return
    await window.goltiAPI.updateConversation(id, { systemPrompt: prompt })
    await get().fetchConversations()
    await get().refreshBudget()
  }
}))

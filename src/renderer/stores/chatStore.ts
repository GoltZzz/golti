import { create } from 'zustand'
import { Conversation, Message, ModelInfo } from '../../shared/types'

declare global {
  interface Window {
    goltiAPI: any
  }
}

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  models: ModelInfo[]
  selectedModel: ModelInfo | null
  isLoadingModels: boolean
  isGenerating: boolean

  fetchConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  fetchModels: () => Promise<void>
  setSelectedModel: (model: ModelInfo) => void
  setupStreamListener: () => () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  models: [],
  selectedModel: null,
  isLoadingModels: false,
  isGenerating: false,

  fetchConversations: async () => {
    try {
      const convs = await window.goltiAPI.getConversations()
      set({ conversations: convs })
      if (convs.length > 0 && !get().currentConversationId) {
        get().selectConversation(convs[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    }
  },

  selectConversation: async (id: string) => {
    try {
      set({ currentConversationId: id, isGenerating: false })
      const msgs = await window.goltiAPI.getMessages(id)
      set({ messages: msgs })
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
      archived: false
    }

    await window.goltiAPI.createConversation(newConv)
    await get().fetchConversations()
    await get().selectConversation(newConv.id)
    return newConv.id
  },

  deleteConversation: async (id: string) => {
    await window.goltiAPI.deleteConversation(id)
    const convs = get().conversations.filter(c => c.id !== id)
    set({ conversations: convs })
    if (get().currentConversationId === id) {
      if (convs.length > 0) {
        get().selectConversation(convs[0].id)
      } else {
        set({ currentConversationId: null, messages: [] })
      }
    }
  },

  sendMessage: async (content: string) => {
    let convId = get().currentConversationId
    if (!convId) {
      convId = await get().newConversation()
    }

    const selected = get().selectedModel
    const modelName = selected ? selected.name : 'llama3:latest'
    const providerId = selected ? selected.providerId : 'ollama-local'

    // Update conversation title if first message
    const currentConv = get().conversations.find(c => c.id === convId)
    if (currentConv && currentConv.title === 'New Conversation') {
      const truncatedTitle = content.slice(0, 30) + (content.length > 30 ? '...' : '')
      await window.goltiAPI.updateConversation(convId, { title: truncatedTitle })
      get().fetchConversations()
    }

    // Optimistic user & assistant messages in state
    const now = Date.now()
    const tempUserMsg: Message = {
      id: `temp_u_${now}`,
      conversationId: convId,
      role: 'user',
      content,
      createdAt: now
    }
    const tempAssistantMsg: Message = {
      id: `temp_a_${now}`,
      conversationId: convId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      isStreaming: true
    }

    set(state => ({
      messages: [...state.messages, tempUserMsg, tempAssistantMsg],
      isGenerating: true
    }))

    const settings = await window.goltiAPI.getSettings()

    const { assistantMsgId } = await window.goltiAPI.sendMessage({
      conversationId: convId,
      content,
      model: modelName,
      providerId,
      systemPrompt: settings?.systemPrompt
    })

    // Update assistant message id in state
    set(state => ({
      messages: state.messages.map(m => (m.id === tempAssistantMsg.id ? { ...m, id: assistantMsgId } : m))
    }))
  },

  fetchModels: async () => {
    set({ isLoadingModels: true })
    try {
      const modelsList = await window.goltiAPI.getModels()
      set({ models: modelsList, isLoadingModels: false })
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
  },

  setupStreamListener: () => {
    return window.goltiAPI.onStreamChunk((chunk: { conversationId: string; messageId: string; contentDelta: string; done: boolean; error?: string }) => {
      const { conversationId, messageId, contentDelta, done } = chunk
      if (get().currentConversationId !== conversationId) return

      set(state => ({
        messages: state.messages.map(msg => {
          if (msg.id === messageId) {
            return {
              ...msg,
              content: msg.content + contentDelta,
              isStreaming: !done
            }
          }
          return msg
        }),
        isGenerating: !done
      }))

      if (done) {
        get().fetchConversations()
      }
    })
  }
}))

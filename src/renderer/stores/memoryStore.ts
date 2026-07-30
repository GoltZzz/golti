import { create } from 'zustand'
import { Memory, MemorySearchHit } from '../../shared/types'

interface MemoryState {
  memories: Memory[]
  loading: boolean
  error: string | null
  searchQuery: string
  searchResults: MemorySearchHit[] | null
  searching: boolean
  unseenCount: number

  fetchMemories: () => Promise<void>
  createMemory: (input: { category: string; title: string; summary: string; details: string[] }) => Promise<void>
  updateMemory: (id: string, input: { category?: string; title?: string; summary?: string; details?: string[] }) => Promise<void>
  deleteMemory: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  runSearch: () => Promise<void>
  clearSearch: () => void
  addSavedMemories: (memories: Memory[]) => void
  markSeen: () => void
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  loading: false,
  error: null,
  searchQuery: '',
  searchResults: null,
  searching: false,
  unseenCount: 0,

  fetchMemories: async () => {
    set({ loading: true, error: null })
    try {
      const memories = await window.goltiAPI.listMemories()
      set({ memories, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load memories'
      set({ loading: false, error: message })
    }
  },

  createMemory: async (input) => {
    try {
      const created = await window.goltiAPI.createMemory(input)
      if (created) {
        set((state) => ({
          memories: [created, ...state.memories]
        }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create memory'
      set({ error: message })
    }
  },

  updateMemory: async (id, input) => {
    try {
      const updated = await window.goltiAPI.updateMemory(id, input)
      if (updated) {
        set((state) => ({
          memories: state.memories.map((m) => (m.id === id ? updated : m))
        }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update memory'
      set({ error: message })
    }
  },

  deleteMemory: async (id: string) => {
    try {
      await window.goltiAPI.deleteMemory(id)
      set((state) => ({
        memories: state.memories.filter((m) => m.id !== id),
        searchResults: state.searchResults?.filter((m) => m.id !== id) ?? null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory'
      set({ error: message })
    }
  },

  setSearchQuery: (searchQuery: string) => set({ searchQuery }),

  runSearch: async () => {
    const query = get().searchQuery.trim()
    if (!query) {
      set({ searchResults: null })
      return
    }
    set({ searching: true })
    try {
      const searchResults = await window.goltiAPI.searchMemories(query)
      set({ searchResults, searching: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      set({ searching: false, error: message })
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: null }),

  addSavedMemories: (incoming: Memory[]) => {
    if (!incoming.length) return
    set((state) => {
      const existingIds = new Set(state.memories.map((m) => m.id))
      const fresh = incoming.filter((m) => !existingIds.has(m.id))
      if (!fresh.length) return state
      return {
        memories: [...fresh, ...state.memories],
        unseenCount: state.unseenCount + fresh.length
      }
    })
  },

  markSeen: () => set({ unseenCount: 0 })
}))

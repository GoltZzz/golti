import { create } from 'zustand'
import { SystemInfoFull, ModelUseCase, ModelFamily, ModelSizeTier, QuantizationType, PullProgress } from '../../shared/types'
import { useChatStore } from './chatStore'

interface CookbookFilters {
  useCases: ModelUseCase[]
  families: ModelFamily[]
  sizeTiers: ModelSizeTier[]
  quantizations: QuantizationType[]
  compatibleOnly: boolean
}

interface CookbookState {
  systemInfo: SystemInfoFull | null
  loadingInfo: boolean
  scanError: string | null
  ollamaOnline: boolean
  checkingOllama: boolean
  installedModels: string[]
  fetchingInstalled: boolean
  filters: CookbookFilters
  sortBy: 'name' | 'size' | 'compatibility' | 'family'
  searchQuery: string
  pullingModel: string | null // ollamaTag of model being pulled
  pullProgress: PullProgress | null
  pullError: string | null
  deletingOllamaTag: string | null
  deleteError: string | null

  scanHardware: () => Promise<void>
  checkOllama: () => Promise<void>
  fetchInstalled: () => Promise<void>
  pullModel: (ollamaTag: string) => Promise<void>
  deleteOllamaModel: (ollamaTag: string) => Promise<{ success: boolean; error?: string }>
  setFilter: <K extends keyof CookbookFilters>(key: K, value: CookbookFilters[K]) => void
  resetFilters: () => void
  isHardwareCardCollapsed: boolean
  toggleHardwareCardCollapsed: () => void
  setSort: (sortBy: CookbookState['sortBy']) => void
  setSearch: (query: string) => void
  setPullingModel: (model: string | null) => void
  setPullProgress: (progress: PullProgress | null) => void
  clearDeleteError: () => void
}

export const useCookbookStore = create<CookbookState>((set, get) => {
  // Listen for progress updates from IPC
  let cleanupListener: (() => void) | null = null

  return {
    systemInfo: null,
    loadingInfo: false,
    scanError: null,
    ollamaOnline: false,
    checkingOllama: false,
    installedModels: [],
    fetchingInstalled: false,
    isHardwareCardCollapsed: false,
    filters: {
      useCases: [],
      families: [],
      sizeTiers: [],
      quantizations: [],
      compatibleOnly: false
    },
    sortBy: 'compatibility',
    searchQuery: '',
    pullingModel: null,
    pullProgress: null,
    pullError: null,
    deletingOllamaTag: null,
    deleteError: null,

    scanHardware: async () => {
      set({ loadingInfo: true, scanError: null })
      try {
        const info = await window.goltiAPI.getSystemInfoFull()
        set({ systemInfo: info, loadingInfo: false, scanError: null })
      } catch (err) {
        console.error('Failed to scan hardware:', err)
        const message =
          err instanceof Error ? err.message : 'Failed to scan system hardware'
        set({ loadingInfo: false, scanError: message })
      }
    },

    checkOllama: async () => {
      set({ checkingOllama: true })
      try {
        const status = await window.goltiAPI.getOllamaStatus()
        set({ ollamaOnline: status.online, checkingOllama: false })
      } catch (err) {
        set({ ollamaOnline: false, checkingOllama: false })
      }
    },

    fetchInstalled: async () => {
      set({ fetchingInstalled: true })
      try {
        const list = await window.goltiAPI.getInstalledModels()
        set({ installedModels: list, fetchingInstalled: false })
      } catch (err) {
        console.error('Failed to get installed models:', err)
        set({ fetchingInstalled: false })
      }
    },

    pullModel: async (ollamaTag: string) => {
      if (get().pullingModel) return

      set({ pullingModel: ollamaTag, pullProgress: null, pullError: null })

      // Setup listener
      if (cleanupListener) cleanupListener()

      cleanupListener = window.goltiAPI.onPullProgress((data: any) => {
        if (data.modelTag === ollamaTag) {
          if (data.status === 'success') {
            set({
              pullingModel: null,
              pullProgress: null,
              pullError: null
            })
            // Refetch installed models
            get().fetchInstalled()
            useChatStore.getState().fetchModels()
            if (cleanupListener) {
              cleanupListener()
              cleanupListener = null
            }
          } else if (data.status === 'error') {
            set({
              pullingModel: null,
              pullProgress: null,
              pullError: data.error || 'Failed to download model'
            })
            if (cleanupListener) {
              cleanupListener()
              cleanupListener = null
            }
          } else {
            set({
              pullProgress: {
                modelTag: data.modelTag,
                status: data.status,
                completed: data.completed,
                total: data.total,
                percent: data.percent
              }
            })
          }
        }
      })

      try {
        const result = await window.goltiAPI.pullOllamaModel(ollamaTag)
        if (!result.success) {
          set({
            pullingModel: null,
            pullError: result.error || 'Failed to start pull'
          })
          if (cleanupListener) {
            cleanupListener()
            cleanupListener = null
          }
        }
      } catch (err: any) {
        set({
          pullingModel: null,
          pullError: err.message || 'Error occurred during pull request'
        })
        if (cleanupListener) {
          cleanupListener()
          cleanupListener = null
        }
      }
    },

    deleteOllamaModel: async (ollamaTag: string) => {
      if (get().deletingOllamaTag) {
        return { success: false, error: 'Another model is currently being deleted' }
      }

      set({ deletingOllamaTag: ollamaTag, deleteError: null })
      try {
        const result = await window.goltiAPI.deleteOllamaModel(ollamaTag)
        if (result?.success) {
          await get().fetchInstalled()
          useChatStore.getState().fetchModels()
          set({ deletingOllamaTag: null, deleteError: null })
          return { success: true }
        }
        const error = result?.error || 'Failed to delete Ollama model'
        set({ deletingOllamaTag: null, deleteError: error })
        return { success: false, error }
      } catch (err: any) {
        const error = err.message || 'Failed to delete Ollama model'
        set({ deletingOllamaTag: null, deleteError: error })
        return { success: false, error }
      }
    },

    clearDeleteError: () => set({ deleteError: null }),

    setFilter: (key, value) => {
      set((state) => ({
        filters: {
          ...state.filters,
          [key]: value
        }
      }))
    },

    resetFilters: () => {
      set({
        filters: {
          useCases: [],
          families: [],
          sizeTiers: [],
          quantizations: [],
          compatibleOnly: false
        }
      })
    },

    toggleHardwareCardCollapsed: () => {
      set((state) => ({ isHardwareCardCollapsed: !state.isHardwareCardCollapsed }))
    },

    setSort: (sortBy) => set({ sortBy }),
    setSearch: (searchQuery) => set({ searchQuery }),
    setPullingModel: (pullingModel) => set({ pullingModel }),
    setPullProgress: (pullProgress) => set({ pullProgress })
  }
})

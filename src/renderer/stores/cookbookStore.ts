import { create } from 'zustand'
import { SystemInfoFull, ModelUseCase, ModelFamily, ModelSizeTier, QuantizationType, InstalledLocalModelInfo } from '../../shared/types'
import { useChatStore } from './chatStore'
import { useEngineStore } from './engineStore'

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
  installedModels: string[]
  detailedInstalledModels: InstalledLocalModelInfo[]
  fetchingInstalled: boolean
  filters: CookbookFilters
  sortBy: 'name' | 'size' | 'compatibility' | 'family'
  searchQuery: string
  deletingModel: string | null
  deleteError: string | null

  scanHardware: () => Promise<void>
  fetchInstalled: () => Promise<void>
  deleteLocalEngineModel: (filename: string) => Promise<{ success: boolean; error?: string }>
  setFilter: <K extends keyof CookbookFilters>(key: K, value: CookbookFilters[K]) => void
  resetFilters: () => void
  isHardwareCardCollapsed: boolean
  toggleHardwareCardCollapsed: () => void
  setSort: (sortBy: CookbookState['sortBy']) => void
  setSearch: (query: string) => void
  clearDeleteError: () => void
}

export const useCookbookStore = create<CookbookState>((set, get) => {
  return {
    systemInfo: null,
    loadingInfo: false,
    scanError: null,
    installedModels: [],
    detailedInstalledModels: [],
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
    deletingModel: null,
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

    fetchInstalled: async () => {
      set({ fetchingInstalled: true })
      try {
        const detailed = (await window.goltiAPI.getDetailedInstalledModels?.()) || []
        set({
          installedModels: detailed.map((m: InstalledLocalModelInfo) => m.tag),
          detailedInstalledModels: detailed,
          fetchingInstalled: false
        })
      } catch (err) {
        console.error('Failed to get installed models:', err)
        set({ fetchingInstalled: false })
      }
    },

    deleteLocalEngineModel: async (filename: string) => {
      set({ deletingModel: filename, deleteError: null })
      try {
        const result = await window.goltiAPI.deleteLocalModel(filename)
        if (result?.success) {
          await get().fetchInstalled()
          useChatStore.getState().fetchModels()
          useEngineStore.getState().setupListeners()
          set({ deletingModel: null, deleteError: null })
          return { success: true }
        }
        const error = result?.error || 'Failed to delete Golti Engine model'
        set({ deletingModel: null, deleteError: error })
        return { success: false, error }
      } catch (err: any) {
        const error = err.message || 'Failed to delete Golti Engine model'
        set({ deletingModel: null, deleteError: error })
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
    setSearch: (searchQuery) => set({ searchQuery })
  }
})

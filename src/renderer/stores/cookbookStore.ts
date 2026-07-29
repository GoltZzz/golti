import { create } from 'zustand'
import { SystemInfoFull, InstalledLocalModelInfo, VramReading } from '../../shared/types'
import { ModelFilters, ModelFilterListKey, EMPTY_MODEL_FILTERS } from '../../shared/model-filter'
import { useChatStore } from './chatStore'
import { useEngineStore } from './engineStore'

interface CookbookState {
  systemInfo: SystemInfoFull | null
  /** Live driver VRAM reading; null when no vendor tool could report one. */
  vramReading: VramReading | null
  fetchVram: () => Promise<void>
  loadingInfo: boolean
  scanError: string | null
  installedModels: string[]
  detailedInstalledModels: InstalledLocalModelInfo[]
  fetchingInstalled: boolean
  filters: ModelFilters
  sortBy: 'name' | 'size' | 'compatibility' | 'family'
  searchQuery: string
  deletingModel: string | null
  deleteError: string | null

  scanHardware: () => Promise<void>
  fetchInstalled: () => Promise<void>
  deleteLocalEngineModel: (filename: string) => Promise<{ success: boolean; error?: string }>
  setFilter: <K extends keyof ModelFilters>(key: K, value: ModelFilters[K]) => void
  toggleFilterValue: <K extends ModelFilterListKey>(key: K, value: ModelFilters[K][number]) => void
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
    vramReading: null,
    loadingInfo: false,
    scanError: null,
    installedModels: [],
    detailedInstalledModels: [],
    fetchingInstalled: false,
    isHardwareCardCollapsed: false,
    filters: { ...EMPTY_MODEL_FILTERS },
    sortBy: 'compatibility',
    searchQuery: '',
    deletingModel: null,
    deleteError: null,

    fetchVram: async () => {
      try {
        set({ vramReading: await window.goltiAPI.getVramReading() })
      } catch {
        // Keep the previous reading: dropping it would imply the card emptied.
      }
    },

    scanHardware: async () => {
      set({ loadingInfo: true, scanError: null })
      try {
        const info = await window.goltiAPI.getSystemInfoFull()
        set({ systemInfo: info, loadingInfo: false, scanError: null })
        get().fetchVram()
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

    toggleFilterValue: (key, value) => {
      set((state) => {
        const list = state.filters[key] as string[]
        const next = list.includes(value as string)
          ? list.filter((v) => v !== value)
          : [...list, value]
        return {
          filters: {
            ...state.filters,
            [key]: next
          }
        }
      })
    },

    resetFilters: () => {
      set({
        filters: { ...EMPTY_MODEL_FILTERS },
        searchQuery: ''
      })
    },

    toggleHardwareCardCollapsed: () => {
      set((state) => ({ isHardwareCardCollapsed: !state.isHardwareCardCollapsed }))
    },

    setSort: (sortBy) => set({ sortBy }),
    setSearch: (searchQuery) => set({ searchQuery })
  }
})

import { create } from 'zustand'
import { SystemInfoFull, ModelUseCase, ModelFamily, ModelSizeTier, QuantizationType, PullProgress, InstalledLocalModelInfo } from '../../shared/types'
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
  ollamaOnline: boolean
  checkingOllama: boolean
  installedModels: string[]
  detailedInstalledModels: InstalledLocalModelInfo[]
  fetchingInstalled: boolean
  filters: CookbookFilters
  sortBy: 'name' | 'size' | 'compatibility' | 'family'
  searchQuery: string
  pullingModels: Record<string, PullProgress>
  pullErrors: Record<string, string>
  deletingOllamaTag: string | null
  deleteError: string | null

  scanHardware: () => Promise<void>
  checkOllama: () => Promise<void>
  fetchInstalled: () => Promise<void>
  pullModel: (ollamaTag: string) => Promise<void>
  cancelPull: (ollamaTag: string) => Promise<void>
  clearPullState: (ollamaTag: string) => void
  deleteOllamaModel: (ollamaTag: string) => Promise<{ success: boolean; error?: string }>
  deleteLocalEngineModel: (filename: string) => Promise<{ success: boolean; error?: string }>
  setFilter: <K extends keyof CookbookFilters>(key: K, value: CookbookFilters[K]) => void
  resetFilters: () => void
  isHardwareCardCollapsed: boolean
  toggleHardwareCardCollapsed: () => void
  setSort: (sortBy: CookbookState['sortBy']) => void
  setSearch: (query: string) => void
  setupPullListeners: () => () => void
  clearDeleteError: () => void
}

function removePullEntry(
  pullingModels: Record<string, PullProgress>,
  pullErrors: Record<string, string>,
  tag: string
) {
  const nextPulling = { ...pullingModels }
  delete nextPulling[tag]
  const nextErrors = { ...pullErrors }
  delete nextErrors[tag]
  return { pullingModels: nextPulling, pullErrors: nextErrors }
}

export const useCookbookStore = create<CookbookState>((set, get) => {
  let cleanupListener: (() => void) | null = null

  return {
    systemInfo: null,
    loadingInfo: false,
    scanError: null,
    ollamaOnline: false,
    checkingOllama: false,
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
    pullingModels: {},
    pullErrors: {},
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
        const detailed = (await window.goltiAPI.getDetailedInstalledModels?.()) || []
        set({ installedModels: list, detailedInstalledModels: detailed, fetchingInstalled: false })
      } catch (err) {
        console.error('Failed to get installed models:', err)
        set({ fetchingInstalled: false })
      }
    },

    setupPullListeners: () => {
      // Keep a single long-lived listener so in-flight pulls still settle
      // if the user leaves the Cookbook tab mid-download.
      if (cleanupListener) {
        return () => {}
      }

      cleanupListener = window.goltiAPI.onPullProgress((data: any) => {
        const tag = data.modelTag as string
        if (!tag) return

        if (data.status === 'success') {
          set((state) => removePullEntry(state.pullingModels, state.pullErrors, tag))
          get().fetchInstalled()
          useChatStore.getState().fetchModels()
        } else if (data.status === 'error') {
          set((state) => {
            const nextErrors = {
              ...state.pullErrors,
              [tag]: data.error || 'Failed to download model'
            }
            return {
              pullingModels: {
                ...state.pullingModels,
                [tag]: {
                  modelTag: tag,
                  status: 'error',
                  completed: data.completed || state.pullingModels[tag]?.completed || 0,
                  total: data.total || state.pullingModels[tag]?.total || 0,
                  percent: data.percent || state.pullingModels[tag]?.percent || 0
                }
              },
              pullErrors: nextErrors
            }
          })
        } else if (data.status === 'cancelled') {
          // Keep last progress so Resume can show where we left off
          set((state) => {
            const nextErrors = { ...state.pullErrors }
            delete nextErrors[tag]
            return {
              pullingModels: {
                ...state.pullingModels,
                [tag]: {
                  modelTag: tag,
                  status: 'cancelled',
                  completed: data.completed || state.pullingModels[tag]?.completed || 0,
                  total: data.total || state.pullingModels[tag]?.total || 0,
                  percent: data.percent || state.pullingModels[tag]?.percent || 0
                }
              },
              pullErrors: nextErrors
            }
          })
        } else {
          set((state) => ({
            pullingModels: {
              ...state.pullingModels,
              [tag]: {
                modelTag: tag,
                status: data.status,
                completed: data.completed,
                total: data.total,
                percent: data.percent
              }
            }
          }))
        }
      })

      return () => {}
    },

    pullModel: async (ollamaTag: string) => {
      const existing = get().pullingModels[ollamaTag]
      // Block only while an active pull is in flight (allow resume after cancelled/error)
      if (existing && existing.status !== 'cancelled' && existing.status !== 'error') return

      set((state) => {
        const nextErrors = { ...state.pullErrors }
        delete nextErrors[ollamaTag]
        return {
          pullingModels: {
            ...state.pullingModels,
            [ollamaTag]: {
              modelTag: ollamaTag,
              status: 'starting',
              completed: existing?.completed || 0,
              total: existing?.total || 0,
              percent: existing?.percent || 0
            }
          },
          pullErrors: nextErrors
        }
      })

      // Ensure a long-lived listener is attached even if CookbookView hasn't mounted yet
      if (!cleanupListener) {
        get().setupPullListeners()
      }

      try {
        const result = await window.goltiAPI.pullOllamaModel(ollamaTag)
        if (!result.success) {
          set((state) => {
            const { pullingModels } = removePullEntry(state.pullingModels, state.pullErrors, ollamaTag)
            return {
              pullingModels,
              pullErrors: {
                ...state.pullErrors,
                [ollamaTag]: result.error || 'Failed to start pull'
              }
            }
          })
        }
      } catch (err: any) {
        set((state) => {
          const { pullingModels } = removePullEntry(state.pullingModels, state.pullErrors, ollamaTag)
          return {
            pullingModels,
            pullErrors: {
              ...state.pullErrors,
              [ollamaTag]: err.message || 'Error occurred during pull request'
            }
          }
        })
      }
    },

    cancelPull: async (ollamaTag: string) => {
      try {
        await window.goltiAPI.cancelOllamaPull(ollamaTag)
      } catch (err: any) {
        console.warn('[CookbookStore] Failed to cancel pull:', err)
      }
    },

    clearPullState: (ollamaTag: string) => {
      set((state) => removePullEntry(state.pullingModels, state.pullErrors, ollamaTag))
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

    deleteLocalEngineModel: async (filename: string) => {
      set({ deletingOllamaTag: filename, deleteError: null })
      try {
        const result = await window.goltiAPI.deleteLocalModel(filename)
        if (result?.success) {
          await get().fetchInstalled()
          useChatStore.getState().fetchModels()
          useEngineStore.getState().setupListeners()
          set({ deletingOllamaTag: null, deleteError: null })
          return { success: true }
        }
        const error = result?.error || 'Failed to delete Golti Engine model'
        set({ deletingOllamaTag: null, deleteError: error })
        return { success: false, error }
      } catch (err: any) {
        const error = err.message || 'Failed to delete Golti Engine model'
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
    setSearch: (searchQuery) => set({ searchQuery })
  }
})

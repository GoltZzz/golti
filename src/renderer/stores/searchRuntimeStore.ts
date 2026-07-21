import { create } from 'zustand'
import type { SearchRuntimeProgress, SearchRuntimeState } from '../../shared/types'

interface SearchRuntimeStore {
  runtimeState: SearchRuntimeState
  progress: SearchRuntimeProgress | null
  error: string | null
  fetchStatus: () => Promise<void>
  install: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  repair: () => Promise<void>
  setupListeners: () => () => void
}

const initialState: SearchRuntimeState = {
  status: 'not-installed',
  apiHealthy: false,
  searxHealthy: false
}

export const useSearchRuntimeStore = create<SearchRuntimeStore>((set, get) => ({
  runtimeState: initialState,
  progress: null,
  error: null,

  fetchStatus: async () => {
    try {
      const state = await window.goltiAPI.getSearchRuntimeStatus()
      set({ runtimeState: state })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to read Web Search status' })
    }
  },

  install: async () => {
    set({ error: null, progress: { name: 'Web Search', completed: 0, total: 100, percent: 1 } })
    try {
      const state = await window.goltiAPI.installSearchRuntime()
      set({ runtimeState: state, progress: null })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to set up Web Search', progress: null })
      throw err
    }
  },

  start: async () => {
    set({ error: null })
    try {
      const state = await window.goltiAPI.startSearchRuntime()
      set({ runtimeState: state })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to start Web Search' })
      throw err
    }
  },

  stop: async () => {
    set({ error: null })
    try {
      const state = await window.goltiAPI.stopSearchRuntime()
      set({ runtimeState: state })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to stop Web Search' })
    }
  },

  repair: async () => {
    set({ error: null, progress: { name: 'Web Search', completed: 0, total: 100, percent: 1 } })
    try {
      const state = await window.goltiAPI.repairSearchRuntime()
      set({ runtimeState: state, progress: null })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to repair Web Search', progress: null })
      throw err
    }
  },

  setupListeners: () => {
    const unsubProgress = window.goltiAPI.onSearchRuntimeProgress((progress: SearchRuntimeProgress) => {
      set({ progress })
    })
    const unsubStatus = window.goltiAPI.onSearchRuntimeStatusChange((state: SearchRuntimeState) => {
      set({ runtimeState: state })
    })
    get().fetchStatus()
    return () => {
      unsubProgress?.()
      unsubStatus?.()
    }
  }
}))

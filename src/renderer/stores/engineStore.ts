import { create } from 'zustand'
import { EngineState, EngineDownloadProgress } from '../../shared/types'
import { useChatStore } from './chatStore'

declare global {
  interface Window {
    goltiAPI: any
  }
}

interface EngineStore {
  engineState: EngineState
  downloadProgress: EngineDownloadProgress | null
  localModels: { filename: string; filepath: string; sizeBytes: number; sizeGB: number }[]
  downloadingModelFilename: string | null
  isInstallingBinary: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  installEngine: () => Promise<void>
  startEngine: () => Promise<void>
  stopEngine: () => Promise<void>
  downloadModel: (url: string, filename: string) => Promise<void>
  fetchLocalModels: () => Promise<void>
  deleteLocalModel: (filename: string) => Promise<{ success: boolean; error?: string }>
  loadModel: (ggufPath: string) => Promise<void>
  setupListeners: () => () => void
}

export const useEngineStore = create<EngineStore>((set, get) => ({
  engineState: {
    status: 'not-installed',
    port: 8391
  },
  downloadProgress: null,
  localModels: [],
  downloadingModelFilename: null,
  isInstallingBinary: false,
  error: null,

  fetchStatus: async () => {
    try {
      const state = await window.goltiAPI.getEngineStatus()
      set({ engineState: state })
    } catch (err: any) {
      console.warn('[EngineStore] Failed to fetch engine status:', err)
    }
  },

  installEngine: async () => {
    set({ isInstallingBinary: true, error: null })
    try {
      await window.goltiAPI.installEngine()
      set({ isInstallingBinary: false })
      await get().startEngine()
    } catch (err: any) {
      set({ isInstallingBinary: false, error: err.message || String(err) })
    }
  },

  startEngine: async () => {
    set({ error: null })
    try {
      const state = await window.goltiAPI.startEngine()
      set({ engineState: state })
    } catch (err: any) {
      set({ error: err.message || String(err) })
    }
  },

  stopEngine: async () => {
    set({ error: null })
    try {
      const state = await window.goltiAPI.stopEngine()
      set({ engineState: state })
    } catch (err: any) {
      set({ error: err.message || String(err) })
    }
  },

  downloadModel: async (url: string, filename: string) => {
    set({ downloadingModelFilename: filename, error: null })
    try {
      await window.goltiAPI.downloadModel(url, filename)
      set({ downloadingModelFilename: null, downloadProgress: null })
      await get().fetchLocalModels()
      useChatStore.getState().fetchModels()
    } catch (err: any) {
      set({ downloadingModelFilename: null, downloadProgress: null, error: err.message || String(err) })
    }
  },


  fetchLocalModels: async () => {
    try {
      const models = await window.goltiAPI.listLocalModels()
      set({ localModels: models || [] })
    } catch (err: any) {
      console.warn('[EngineStore] Failed to fetch local models:', err)
    }
  },

  deleteLocalModel: async (filename: string) => {
    try {
      const result = await window.goltiAPI.deleteLocalModel(filename)
      if (result && typeof result === 'object' && 'success' in result) {
        if (!result.success) {
          const error = result.error || 'Failed to delete model'
          set({ error })
          return { success: false, error }
        }
        await get().fetchLocalModels()
        useChatStore.getState().fetchModels()
        return { success: true }
      }
      // Legacy boolean return
      await get().fetchLocalModels()
      useChatStore.getState().fetchModels()
      return { success: !!result }
    } catch (err: any) {
      const error = err.message || String(err)
      set({ error })
      return { success: false, error }
    }
  },

  loadModel: async (ggufPath: string) => {
    set({ error: null })
    try {
      const state = await window.goltiAPI.loadEngineModel(ggufPath)
      set({ engineState: state })
    } catch (err: any) {
      set({ error: err.message || String(err) })
    }
  },

  setupListeners: () => {
    const unsubProgress = window.goltiAPI.onEngineProgress((progress: EngineDownloadProgress) => {
      set({ downloadProgress: progress })
    })

    const unsubStatus = window.goltiAPI.onEngineStatusChange((state: EngineState) => {
      set({ engineState: state })
    })

    get().fetchStatus()
    get().fetchLocalModels()

    return () => {
      unsubProgress?.()
      unsubStatus?.()
    }
  }
}))

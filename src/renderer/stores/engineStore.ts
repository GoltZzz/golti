import { create } from 'zustand'
import { EngineState, EngineDownloadProgress, ModelDownloadResult } from '../../shared/types'
import { useChatStore } from './chatStore'

declare global {
  interface Window {
    goltiAPI: any
  }
}

function isActivelyDownloading(progress?: EngineDownloadProgress): boolean {
  if (!progress) return false
  return !progress.status || progress.status === 'downloading'
}

interface EngineStore {
  engineState: EngineState
  downloadingModels: Record<string, EngineDownloadProgress>
  downloadErrors: Record<string, string>
  binaryDownloadProgress: EngineDownloadProgress | null
  localModels: { filename: string; filepath: string; sizeBytes: number; sizeGB: number }[]
  isInstallingBinary: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  installEngine: () => Promise<void>
  startEngine: () => Promise<void>
  stopEngine: () => Promise<void>
  downloadModel: (url: string, filename: string) => Promise<void>
  pauseDownload: (filename: string) => Promise<void>
  resumeDownload: (url: string, filename: string) => Promise<void>
  cancelDownload: (filename: string) => Promise<void>
  clearDownload: (filename: string) => Promise<void>
  fetchLocalModels: () => Promise<void>
  deleteLocalModel: (filename: string) => Promise<{ success: boolean; error?: string }>
  loadModel: (ggufPath: string) => Promise<void>
  setupListeners: () => () => void
}

function removeDownloadingModel(
  downloadingModels: Record<string, EngineDownloadProgress>,
  filename: string
) {
  const next = { ...downloadingModels }
  delete next[filename]
  return next
}

function removeDownloadError(downloadErrors: Record<string, string>, filename: string) {
  const next = { ...downloadErrors }
  delete next[filename]
  return next
}

let engineListenersAttached = false

export const useEngineStore = create<EngineStore>((set, get) => ({
  engineState: {
    status: 'not-installed',
    port: 8391
  },
  downloadingModels: {},
  downloadErrors: {},
  binaryDownloadProgress: null,
  localModels: [],
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
    set({ isInstallingBinary: true, binaryDownloadProgress: null, error: null })
    try {
      await window.goltiAPI.installEngine()
      set({ isInstallingBinary: false, binaryDownloadProgress: null })
      await get().startEngine()
    } catch (err: any) {
      set({
        isInstallingBinary: false,
        binaryDownloadProgress: null,
        error: err.message || String(err)
      })
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
    const existing = get().downloadingModels[filename]
    if (isActivelyDownloading(existing)) return

    set((state) => ({
      downloadingModels: {
        ...state.downloadingModels,
        [filename]: {
          type: 'model',
          name: filename,
          completed: existing?.completed || 0,
          total: existing?.total || 0,
          percent: existing?.percent || 0,
          speed: 'Starting...',
          status: 'downloading'
        }
      },
      downloadErrors: removeDownloadError(state.downloadErrors, filename),
      error: null
    }))

    try {
      const result = (await window.goltiAPI.downloadModel(url, filename)) as ModelDownloadResult

      if (result?.status === 'complete') {
        set((state) => ({
          downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
          downloadErrors: removeDownloadError(state.downloadErrors, filename)
        }))
        await get().fetchLocalModels()
        useChatStore.getState().fetchModels()
        return
      }

      // paused / cancelled — progress listener already updated status
      if (result?.status === 'cancelled') {
        set((state) => ({
          downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
          downloadErrors: removeDownloadError(state.downloadErrors, filename)
        }))
      }
    } catch (err: any) {
      const message = err.message || String(err)
      set((state) => ({
        downloadingModels: {
          ...state.downloadingModels,
          [filename]: {
            ...(state.downloadingModels[filename] || {
              type: 'model',
              name: filename,
              completed: 0,
              total: 0,
              percent: 0
            }),
            status: 'error',
            speed: 'Error',
            error: message
          }
        },
        downloadErrors: {
          ...state.downloadErrors,
          [filename]: message
        },
        error: message
      }))
    }
  },

  pauseDownload: async (filename: string) => {
    try {
      await window.goltiAPI.pauseModelDownload(filename)
    } catch (err: any) {
      console.warn('[EngineStore] Failed to pause download:', err)
    }
  },

  resumeDownload: async (url: string, filename: string) => {
    await get().downloadModel(url, filename)
  },

  cancelDownload: async (filename: string) => {
    try {
      await window.goltiAPI.cancelModelDownload(filename)
      set((state) => ({
        downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
        downloadErrors: removeDownloadError(state.downloadErrors, filename)
      }))
    } catch (err: any) {
      console.warn('[EngineStore] Failed to cancel download:', err)
    }
  },

  clearDownload: async (filename: string) => {
    try {
      await window.goltiAPI.deletePartialModel?.(filename)
    } catch (err: any) {
      console.warn('[EngineStore] Failed to delete partial download:', err)
    }
    set((state) => ({
      downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
      downloadErrors: removeDownloadError(state.downloadErrors, filename)
    }))
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
        set((state) => ({
          downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
          downloadErrors: removeDownloadError(state.downloadErrors, filename)
        }))
        await get().fetchLocalModels()
        useChatStore.getState().fetchModels()
        return { success: true }
      }
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
    // Keep listeners for the app lifetime so in-flight model downloads still
    // receive progress if the user leaves the Cookbook tab.
    if (engineListenersAttached) {
      return () => {}
    }
    engineListenersAttached = true

    window.goltiAPI.onEngineProgress((progress: EngineDownloadProgress) => {
      if (progress.type === 'binary') {
        set({ binaryDownloadProgress: progress })
        return
      }

      if (progress.type === 'model' && progress.name) {
        set((state) => {
          const nextErrors = { ...state.downloadErrors }
          if (progress.status === 'error' && progress.error) {
            nextErrors[progress.name] = progress.error
          } else if (progress.status !== 'error') {
            delete nextErrors[progress.name]
          }

          if (progress.status === 'cancelled') {
            return {
              downloadingModels: removeDownloadingModel(state.downloadingModels, progress.name),
              downloadErrors: removeDownloadError(state.downloadErrors, progress.name)
            }
          }

          if (progress.status === 'complete') {
            return {
              downloadingModels: removeDownloadingModel(state.downloadingModels, progress.name),
              downloadErrors: removeDownloadError(state.downloadErrors, progress.name)
            }
          }

          return {
            downloadingModels: {
              ...state.downloadingModels,
              [progress.name]: progress
            },
            downloadErrors: nextErrors
          }
        })
      }
    })

    window.goltiAPI.onEngineStatusChange((state: EngineState) => {
      set({ engineState: state })
    })

    get().fetchStatus()
    get().fetchLocalModels()

    return () => {}
  }
}))

export { isActivelyDownloading }

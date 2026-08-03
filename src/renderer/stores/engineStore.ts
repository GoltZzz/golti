import { create } from 'zustand'
import { EngineState, EngineDownloadProgress, ModelDownloadResult, QuantizationType } from '../../shared/types'
import type { ModelGeometry } from '../../shared/gpu-offload'
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

export interface ProjectorTarget {
  filename: string
  url: string
  sizeBytes: number
}

export interface ResolvedModelRef {
  ggufUrl: string
  ggufFilename: string
  repoId?: string
}

interface EngineStore {
  engineState: EngineState
  downloadingModels: Record<string, EngineDownloadProgress>
  downloadErrors: Record<string, string>
  binaryDownloadProgress: EngineDownloadProgress | null
  localModels: {
    filename: string
    filepath: string
    sizeBytes: number
    sizeGB: number
    /** GGUF geometry, present when the header could be read. */
    geometry?: ModelGeometry
  }[]
  isInstallingBinary: boolean
  isCompacting: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  installEngine: () => Promise<void>
  reinstallEngine: () => Promise<void>
  startEngine: () => Promise<void>
  stopEngine: () => Promise<void>
  downloadModel: (url: string, filename: string) => Promise<void>
  resolveAndDownload: (ollamaTag: string, quantization?: QuantizationType) => Promise<void>
  resolving: Record<string, boolean>
  resolvedModels: Record<string, ResolvedModelRef>
  resolveErrors: Record<string, string>
  clearResolveError: (ollamaTag: string) => void
  pauseDownload: (filename: string) => Promise<void>
  resumeDownload: (url: string, filename: string) => Promise<void>
  cancelDownload: (filename: string) => Promise<void>
  clearDownload: (filename: string) => Promise<void>
  fetchLocalModels: () => Promise<void>
  deleteLocalModel: (filename: string) => Promise<{ success: boolean; error?: string }>
  loadModel: (ggufPath: string) => Promise<void>
  compactKvCache: () => Promise<void>
  projectors: Record<string, string | null>
  projectorBusy: Record<string, boolean>
  projectorErrors: Record<string, string>
  /** Projector file being fetched for a model, so its progress row can be found. */
  projectorTargets: Record<string, ProjectorTarget>
  fetchProjectorFor: (modelFilename: string) => Promise<void>
  installProjector: (modelFilename: string) => Promise<void>
  removeProjector: (modelFilename: string) => Promise<void>
  clearProjectorDownload: (modelFilename: string) => Promise<void>
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

function removeResolveError(resolveErrors: Record<string, string>, ollamaTag: string) {
  const next = { ...resolveErrors }
  delete next[ollamaTag]
  return next
}

const RESOLVED_MODELS_KEY = 'golti.engine.resolvedModels'

function loadResolvedModels(): Record<string, ResolvedModelRef> {
  try {
    const raw = localStorage.getItem(RESOLVED_MODELS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveResolvedModels(map: Record<string, ResolvedModelRef>): void {
  try {
    localStorage.setItem(RESOLVED_MODELS_KEY, JSON.stringify(map))
  } catch {
    // storage unavailable; in-memory map still works for this session
  }
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
  isCompacting: false,
  resolving: {},
  resolvedModels: loadResolvedModels(),
  resolveErrors: {},
  projectors: {},
  projectorBusy: {},
  projectorErrors: {},
  projectorTargets: {},
  error: null,

  fetchProjectorFor: async (modelFilename: string) => {
    try {
      const path = await window.goltiAPI.getProjectorFor(modelFilename)
      set((state) => ({ projectors: { ...state.projectors, [modelFilename]: path ?? null } }))
    } catch {
      set((state) => ({ projectors: { ...state.projectors, [modelFilename]: null } }))
    }
  },

  installProjector: async (modelFilename: string) => {
    if (get().projectorBusy[modelFilename]) return

    set((state) => ({
      projectorBusy: { ...state.projectorBusy, [modelFilename]: true },
      projectorErrors: removeDownloadError(state.projectorErrors, modelFilename)
    }))

    const settle = (message?: string) => {
      set((state) => ({
        projectorBusy: { ...state.projectorBusy, [modelFilename]: false },
        projectorErrors: message
          ? { ...state.projectorErrors, [modelFilename]: message }
          : removeDownloadError(state.projectorErrors, modelFilename)
      }))
    }

    try {
      // A resume reuses the known target rather than repeating the lookup.
      let target = get().projectorTargets[modelFilename]
      if (!target) {
        const lookup = await window.goltiAPI.findProjectorForModel(modelFilename)
        const best = lookup?.projectors?.[0]
        if (!best) {
          settle(lookup?.error || 'No vision projector found for this model.')
          return
        }
        target = { filename: best.filename, url: best.url, sizeBytes: best.fileSizeBytes }
        set((state) => ({
          projectorTargets: { ...state.projectorTargets, [modelFilename]: target! }
        }))
      }

      const res = await window.goltiAPI.downloadProjector(target.url, target.filename, modelFilename)

      if (res?.status === 'paused') {
        settle()
        return
      }

      if (res?.status === 'cancelled') {
        set((state) => {
          const targets = { ...state.projectorTargets }
          delete targets[modelFilename]
          return { projectorTargets: targets }
        })
        settle()
        return
      }

      if (res?.status !== 'complete') {
        settle(res?.error || 'Projector download did not finish.')
        return
      }

      set((state) => {
        const targets = { ...state.projectorTargets }
        delete targets[modelFilename]
        return { projectorTargets: targets }
      })
      settle()
      await get().fetchProjectorFor(modelFilename)
      void useChatStore.getState().refreshModelCapabilities()
    } catch (err: any) {
      settle(err?.message || String(err))
    }
  },

  clearProjectorDownload: async (modelFilename: string) => {
    const target = get().projectorTargets[modelFilename]
    if (target) await get().clearDownload(target.filename)
    set((state) => {
      const targets = { ...state.projectorTargets }
      delete targets[modelFilename]
      return {
        projectorTargets: targets,
        projectorErrors: removeDownloadError(state.projectorErrors, modelFilename)
      }
    })
  },

  removeProjector: async (modelFilename: string) => {
    try {
      await window.goltiAPI.unpairProjector(modelFilename)
    } finally {
      await get().fetchProjectorFor(modelFilename)
      void useChatStore.getState().refreshModelCapabilities()
    }
  },

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
      try {
        await get().startEngine()
      } catch (e) {
        // startEngine will set state.error if no model or startup fails
      }
    } catch (err: any) {
      set({
        isInstallingBinary: false,
        binaryDownloadProgress: null,
        error: err.message || String(err)
      })
    }
  },

  reinstallEngine: async () => {
    set({ isInstallingBinary: true, binaryDownloadProgress: null, error: null })
    try {
      try {
        await get().stopEngine()
      } catch {}
      const fn = window.goltiAPI.reinstallEngine || window.goltiAPI.installEngine
      await fn()
      set({ isInstallingBinary: false, binaryDownloadProgress: null })
      await get().fetchStatus()
      try {
        await get().startEngine()
      } catch (e) {
        // startEngine will set state.error if no model or startup fails
      }
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
        void useChatStore.getState().refreshModelCapabilities()
        return
      }

      if (result?.status === 'cancelled') {
        set((state) => ({
          downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
          downloadErrors: removeDownloadError(state.downloadErrors, filename)
        }))
        return
      }

      if (result?.status === 'paused') {
        // Keep entry; progress listener / pauseDownload already set status
        set((state) => {
          const existing = state.downloadingModels[filename]
          if (!existing) return state
          return {
            downloadingModels: {
              ...state.downloadingModels,
              [filename]: {
                ...existing,
                status: 'paused',
                speed: existing.speed === 'Paused' ? existing.speed : 'Paused'
              }
            }
          }
        })
        return
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

  resolveAndDownload: async (ollamaTag: string, quantization?: QuantizationType) => {
    set((state) => ({
      resolving: { ...state.resolving, [ollamaTag]: true },
      resolveErrors: removeResolveError(state.resolveErrors, ollamaTag),
      error: null
    }))

    const stopResolving = (extra?: Partial<EngineStore>) =>
      set((state) => {
        const next = { ...state.resolving }
        delete next[ollamaTag]
        return { resolving: next, ...extra } as Partial<EngineStore>
      })

    try {
      const result = await window.goltiAPI.resolveModelGguf(ollamaTag, quantization)

      if (!result?.resolution) {
        const message = result?.error || `Could not find a GGUF download for "${ollamaTag}".`
        stopResolving()
        set((state) => ({
          resolveErrors: { ...state.resolveErrors, [ollamaTag]: message },
          error: message
        }))
        return
      }

      const { ggufUrl, ggufFilename, repoId } = result.resolution

      set((state) => {
        const resolvedModels = {
          ...state.resolvedModels,
          [ollamaTag]: { ggufUrl, ggufFilename, repoId }
        }
        saveResolvedModels(resolvedModels)
        const next = { ...state.resolving }
        delete next[ollamaTag]
        return { resolvedModels, resolving: next }
      })

      await get().downloadModel(ggufUrl, ggufFilename)
    } catch (err: any) {
      const message = err.message || String(err)
      stopResolving()
      set((state) => ({
        resolveErrors: { ...state.resolveErrors, [ollamaTag]: message },
        error: message
      }))
    }
  },

  clearResolveError: (ollamaTag: string) => {
    set((state) => ({ resolveErrors: removeResolveError(state.resolveErrors, ollamaTag) }))
  },

  pauseDownload: async (filename: string) => {
    try {
      const result = await window.goltiAPI.pauseModelDownload(filename)
      if (result?.success) {
        set((state) => {
          const existing = state.downloadingModels[filename]
          return {
            downloadingModels: {
              ...state.downloadingModels,
              [filename]: {
                ...(existing || {
                  type: 'model' as const,
                  name: filename,
                  completed: 0,
                  total: 0,
                  percent: 0
                }),
                status: 'paused' as const,
                speed: 'Paused'
              }
            },
            downloadErrors: removeDownloadError(state.downloadErrors, filename)
          }
        })
      } else {
        set((state) => ({
          downloadErrors: {
            ...state.downloadErrors,
            [filename]: 'Could not pause download - try again'
          }
        }))
      }
    } catch (err: any) {
      console.warn('[EngineStore] Failed to pause download:', err)
      set((state) => ({
        downloadErrors: {
          ...state.downloadErrors,
          [filename]: err.message || 'Could not pause download'
        }
      }))
    }
  },

  resumeDownload: async (url: string, filename: string) => {
    await get().downloadModel(url, filename)
  },

  cancelDownload: async (filename: string) => {
    try {
      const result = await window.goltiAPI.cancelModelDownload(filename)
      if (result?.success) {
        set((state) => ({
          downloadingModels: removeDownloadingModel(state.downloadingModels, filename),
          downloadErrors: removeDownloadError(state.downloadErrors, filename)
        }))
      } else {
        set((state) => ({
          downloadErrors: {
            ...state.downloadErrors,
            [filename]: 'Could not cancel download - try again'
          }
        }))
      }
    } catch (err: any) {
      console.warn('[EngineStore] Failed to cancel download:', err)
      set((state) => ({
        downloadErrors: {
          ...state.downloadErrors,
          [filename]: err.message || 'Could not cancel download'
        }
      }))
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
        void useChatStore.getState().refreshModelCapabilities()
        return { success: true }
      }
      await get().fetchLocalModels()
      useChatStore.getState().fetchModels()
      void useChatStore.getState().refreshModelCapabilities()
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

  compactKvCache: async () => {
    if (get().isCompacting) return
    set({ isCompacting: true, error: null })
    try {
      await window.goltiAPI.compactEngineKvCache()
    } catch (err: any) {
      set({ error: err.message || String(err) })
    } finally {
      set({ isCompacting: false })
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
      import('./settingsStore').then(({ useSettingsStore }) => {
        useSettingsStore.getState().fetchProviders()
      }).catch(() => {})
    })

    get().fetchStatus()
    get().fetchLocalModels()

    return () => {}
  }
}))

export { isActivelyDownloading }

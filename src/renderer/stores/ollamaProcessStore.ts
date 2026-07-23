import { create } from 'zustand'
import { OllamaState, EngineDownloadProgress } from '../../shared/types'

interface OllamaProcessState {
  processState: OllamaState
  isInstallingBinary: boolean
  downloadProgress: EngineDownloadProgress | null
  logs: string[]
  
  setupListeners: () => () => void
  fetchState: () => Promise<void>
  fetchLogs: () => Promise<void>
  installOllama: () => Promise<void>
  startOllama: () => Promise<void>
  stopOllama: () => Promise<void>
}

export const useOllamaProcessStore = create<OllamaProcessState>((set, get) => ({
  processState: { status: 'not-installed' },
  isInstallingBinary: false,
  downloadProgress: null,
  logs: [],

  setupListeners: () => {
    get().fetchState()

    const unsubState = window.goltiAPI.onOllamaStateChange((state: OllamaState) => {
      set({
        processState: state,
        logs: state.logs || get().logs
      })
    })

    const unsubProgress = window.goltiAPI.onOllamaProgress((progress: EngineDownloadProgress) => {
      set({ downloadProgress: progress })
    })

    return () => {
      unsubState()
      unsubProgress()
    }
  },

  fetchState: async () => {
    try {
      const state = await window.goltiAPI.getOllamaProcessState()
      set({
        processState: state,
        logs: state.logs || get().logs
      })
    } catch (err) {
      console.error('Failed to get Ollama process state', err)
    }
  },

  fetchLogs: async () => {
    try {
      const logs = await window.goltiAPI.getOllamaLogs()
      set({ logs })
    } catch (err) {
      console.error('Failed to fetch Ollama logs', err)
    }
  },

  installOllama: async () => {
    if (get().isInstallingBinary) return
    set({ isInstallingBinary: true, downloadProgress: null })
    try {
      await window.goltiAPI.installOllamaProcess()
      await get().fetchState()
      await get().startOllama()
    } catch (err: any) {
      console.error('Failed to install Ollama', err)
      set({ processState: { status: 'error', error: String(err?.message || err) } })
    } finally {
      set({ isInstallingBinary: false, downloadProgress: null })
    }
  },

  startOllama: async () => {
    try {
      set((s) => ({ processState: { ...s.processState, status: 'starting' } }))
      await window.goltiAPI.startOllamaProcess()
      await get().fetchState()
    } catch (err) {
      console.error('Failed to start Ollama', err)
    }
  },

  stopOllama: async () => {
    try {
      await window.goltiAPI.stopOllamaProcess()
      await get().fetchState()
    } catch (err) {
      console.error('Failed to stop Ollama', err)
    }
  }
}))

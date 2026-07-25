import { create } from 'zustand'
import { OllamaState, EngineDownloadProgress } from '../../shared/types'

interface OllamaProcessState {
  processState: OllamaState
  isInstallingBinary: boolean
  downloadProgress: EngineDownloadProgress | null
  logs: string[]
  customModelPath: string
  
  setupListeners: () => () => void
  fetchState: () => Promise<void>
  fetchLogs: () => Promise<void>
  setCustomModelPath: (path: string) => void
  installOllama: (customModelPath?: string) => Promise<void>
  cancelOllamaInstall: () => Promise<void>
  startOllama: (customModelPath?: string) => Promise<void>
  stopOllama: () => Promise<void>
}

export const useOllamaProcessStore = create<OllamaProcessState>((set, get) => ({
  processState: { status: 'not-installed' },
  isInstallingBinary: false,
  downloadProgress: null,
  logs: [],
  customModelPath: '',

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

  setCustomModelPath: (path: string) => {
    set({ customModelPath: path })
  },

  installOllama: async (customModelPath?: string) => {
    if (get().isInstallingBinary) return
    const targetPath = customModelPath || get().customModelPath
    set({ isInstallingBinary: true, downloadProgress: null })
    try {
      await window.goltiAPI.installOllamaProcess(targetPath)
      await get().fetchState()
      await get().startOllama(targetPath)
    } catch (err: any) {
      const errMsg = String(err?.message || err)
      if (errMsg.toLowerCase().includes('cancelled')) {
        set({ processState: { status: 'not-installed' } })
      } else {
        console.error('Failed to install Ollama', err)
        set({ processState: { status: 'error', error: `Installation failed: ${errMsg}. Check ollama-install.log in your selected folder for details.` } })
      }
    } finally {
      set({ isInstallingBinary: false, downloadProgress: null })
    }
  },

  cancelOllamaInstall: async () => {
    try {
      if (window.goltiAPI?.cancelOllamaInstallProcess) {
        await window.goltiAPI.cancelOllamaInstallProcess()
      }
    } catch (err) {
      console.error('Failed to cancel Ollama installation', err)
    } finally {
      set({
        isInstallingBinary: false,
        downloadProgress: null,
        processState: { status: 'not-installed' }
      })
    }
  },

  startOllama: async (customModelPath?: string) => {
    try {
      const targetPath = customModelPath || get().customModelPath
      set((s) => ({ processState: { ...s.processState, status: 'starting' } }))
      await window.goltiAPI.startOllamaProcess(targetPath)
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

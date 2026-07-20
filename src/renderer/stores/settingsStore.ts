import { create } from 'zustand'
import { Settings, AIProviderConfig } from '../../shared/types'

interface SettingsState {
  settings: Settings | null
  providers: AIProviderConfig[]
  isLoading: boolean
  fetchSettings: () => Promise<void>
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  fetchProviders: () => Promise<void>
  saveProvider: (provider: AIProviderConfig) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  providers: [],
  isLoading: false,

  fetchSettings: async () => {
    try {
      const s = await window.goltiAPI.getSettings()
      set({ settings: s })
    } catch (e) {
      console.error('Failed to fetch settings:', e)
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    await window.goltiAPI.updateSettings(newSettings)
    await get().fetchSettings()
  },

  fetchProviders: async () => {
    set({ isLoading: true })
    try {
      const p = await window.goltiAPI.getProviders()
      set({ providers: p, isLoading: false })
    } catch (e) {
      console.error('Failed to fetch providers:', e)
      set({ isLoading: false })
    }
  },

  saveProvider: async (provider: AIProviderConfig) => {
    await window.goltiAPI.saveProvider(provider)
    await get().fetchProviders()
  },

  deleteProvider: async (id: string) => {
    await window.goltiAPI.deleteProvider(id)
    await get().fetchProviders()
  }
}))

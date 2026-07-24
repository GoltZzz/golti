import { create } from 'zustand'

export type ActiveTab = 'chat' | 'memory' | 'docs' | 'email' | 'compare' | 'cookbook' | 'ollama' | 'settings'

export type SettingsSubTab = 'providers' | 'engine' | 'general' | 'about'

interface SidebarState {
  isCollapsed: boolean
  activeTab: ActiveTab
  /** When set, Settings opens on this sub-tab (e.g. from chat Web Search error). */
  settingsSubTab: SettingsSubTab | null
  toggleCollapsed: () => void
  setActiveTab: (tab: ActiveTab) => void
  openSettings: (subTab?: SettingsSubTab) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,
  activeTab: 'chat',
  settingsSubTab: null,
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setActiveTab: (tab: ActiveTab) => set({ activeTab: tab, settingsSubTab: null }),
  openSettings: (subTab = 'general') =>
    set({ activeTab: 'settings', settingsSubTab: subTab })
}))

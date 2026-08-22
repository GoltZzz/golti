import { create } from 'zustand'

export type ActiveTab = 'chat' | 'memory' | 'docs' | 'email' | 'compare' | 'cookbook' | 'settings'

export type TopTab = 'home' | 'office'

export type SettingsSubTab = 'providers' | 'engine' | 'skills' | 'general' | 'about'

interface SidebarState {
  isCollapsed: boolean
  topTab: TopTab
  activeTab: ActiveTab
  /** When set, Settings opens on this sub-tab (e.g. from chat Web Search error). */
  settingsSubTab: SettingsSubTab | null
  toggleCollapsed: () => void
  setTopTab: (tab: TopTab) => void
  setActiveTab: (tab: ActiveTab) => void
  openSettings: (subTab?: SettingsSubTab) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,
  topTab: 'home',
  activeTab: 'chat',
  settingsSubTab: null,
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setTopTab: (tab: TopTab) => set({ topTab: tab }),
  setActiveTab: (tab: ActiveTab) => set({ activeTab: tab, topTab: 'home', settingsSubTab: null }),
  openSettings: (subTab = 'general') =>
    set({ activeTab: 'settings', topTab: 'home', settingsSubTab: subTab })
}))


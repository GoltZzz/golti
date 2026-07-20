import { create } from 'zustand'

export type ActiveTab = 'chat' | 'research' | 'agents' | 'memory' | 'docs' | 'email' | 'compare' | 'cookbook' | 'settings'

interface SidebarState {
  isCollapsed: boolean
  activeTab: ActiveTab
  toggleCollapsed: () => void
  setActiveTab: (tab: ActiveTab) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,
  activeTab: 'chat',
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setActiveTab: (tab: ActiveTab) => set({ activeTab: tab })
}))

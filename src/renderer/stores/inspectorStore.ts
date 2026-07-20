import { create } from 'zustand'

export type InspectorTab = 'context' | 'thread' | 'artifacts' | 'usage'

interface InspectorState {
  isOpen: boolean
  activeTab: InspectorTab
  selectedArtifactId: string | null
  toggle: () => void
  setOpen: (open: boolean) => void
  setTab: (tab: InspectorTab) => void
  selectArtifact: (id: string | null) => void
}

export const useInspectorStore = create<InspectorState>((set) => ({
  isOpen: true,
  activeTab: 'context',
  selectedArtifactId: null,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setTab: (tab) => set({ activeTab: tab, isOpen: true }),
  selectArtifact: (id) =>
    set({ selectedArtifactId: id, activeTab: 'artifacts', isOpen: true })
}))

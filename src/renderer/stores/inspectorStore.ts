import { create } from 'zustand'

export type InspectorTab = 'context' | 'thread' | 'shells' | 'artifacts' | 'usage'

interface InspectorState {
  isOpen: boolean
  activeTab: InspectorTab
  selectedShellId: string | null
  selectedArtifactId: string | null
  toggle: () => void
  setOpen: (open: boolean) => void
  setTab: (tab: InspectorTab) => void
  selectShell: (id: string | null) => void
  selectArtifact: (id: string | null) => void
}

export const useInspectorStore = create<InspectorState>((set) => ({
  isOpen: true,
  activeTab: 'context',
  selectedShellId: null,
  get selectedArtifactId() {
    return this.selectedShellId
  },
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setTab: (tab) => set({ activeTab: tab, isOpen: true }),
  selectShell: (id) =>
    set({ selectedShellId: id, selectedArtifactId: id, activeTab: 'shells', isOpen: true }),
  selectArtifact: (id) =>
    set({ selectedShellId: id, selectedArtifactId: id, activeTab: 'shells', isOpen: true })
}))

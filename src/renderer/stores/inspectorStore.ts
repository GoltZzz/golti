import { create } from 'zustand'

export type InspectorTab = 'context' | 'thread' | 'shells' | 'artifacts' | 'usage'

export const INSPECTOR_MIN_WIDTH = 260
export const INSPECTOR_MAX_WIDTH = 720
export const INSPECTOR_DEFAULT_WIDTH = 340

const WIDTH_STORAGE_KEY = 'golti.inspector.width'

export const clampInspectorWidth = (width: number): number =>
  Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, Math.round(width)))

const readStoredWidth = (): number => {
  try {
    const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? clampInspectorWidth(parsed) : INSPECTOR_DEFAULT_WIDTH
  } catch {
    return INSPECTOR_DEFAULT_WIDTH
  }
}

const persistWidth = (width: number): void => {
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
  } catch {
    /* storage unavailable */
  }
}

interface InspectorState {
  isOpen: boolean
  width: number
  setWidth: (width: number) => void
  resetWidth: () => void
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
  width: readStoredWidth(),
  setWidth: (width) => {
    const next = clampInspectorWidth(width)
    persistWidth(next)
    set({ width: next })
  },
  resetWidth: () => {
    persistWidth(INSPECTOR_DEFAULT_WIDTH)
    set({ width: INSPECTOR_DEFAULT_WIDTH })
  },
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

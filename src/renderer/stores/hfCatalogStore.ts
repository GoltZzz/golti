import { create } from 'zustand'
import { CookbookModel } from '../../shared/types'
import { HFModelSummary } from '../../shared/hf-catalog'

interface HFDetailState {
  loading: boolean
  models: CookbookModel[]
  error: string | null
}

interface HFCatalogState {
  enabled: boolean
  results: HFModelSummary[]
  loading: boolean
  error: string | null
  stale: boolean
  lastQuery: string
  details: Record<string, HFDetailState>
  expanded: Record<string, boolean>

  setEnabled: (enabled: boolean) => void
  search: (query: string) => Promise<void>
  toggleExpanded: (repoId: string) => void
  loadDetail: (repoId: string) => Promise<void>
}

let searchToken = 0

export const useHFCatalogStore = create<HFCatalogState>((set, get) => ({
  enabled: true,
  results: [],
  loading: false,
  error: null,
  stale: false,
  lastQuery: '',
  details: {},
  expanded: {},

  setEnabled: (enabled) => {
    set({ enabled })
    if (enabled && get().results.length === 0 && !get().loading) {
      void get().search(get().lastQuery)
    }
  },

  search: async (query) => {
    const token = ++searchToken
    set({ loading: true, error: null, lastQuery: query })
    try {
      const result = await window.goltiAPI.searchHuggingFaceModels(query, 60)
      if (token !== searchToken) return
      set({
        results: result?.models ?? [],
        stale: !!result?.stale,
        error: result?.error ?? null,
        loading: false
      })
    } catch (error) {
      if (token !== searchToken) return
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to reach Hugging Face'
      })
    }
  },

  toggleExpanded: (repoId) => {
    const isOpen = !!get().expanded[repoId]
    set({ expanded: { ...get().expanded, [repoId]: !isOpen } })
    if (!isOpen && !get().details[repoId]) {
      void get().loadDetail(repoId)
    }
  },

  loadDetail: async (repoId) => {
    const existing = get().details[repoId]
    if (existing?.loading) return

    set({
      details: { ...get().details, [repoId]: { loading: true, models: [], error: null } }
    })

    try {
      const result = await window.goltiAPI.getHuggingFaceModelDetail(repoId)
      set({
        details: {
          ...get().details,
          [repoId]: {
            loading: false,
            models: result?.models ?? [],
            error: result?.error ?? null
          }
        }
      })
    } catch (error) {
      set({
        details: {
          ...get().details,
          [repoId]: {
            loading: false,
            models: [],
            error: error instanceof Error ? error.message : 'Failed to load model details'
          }
        }
      })
    }
  }
}))

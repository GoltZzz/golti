import { create } from 'zustand'

const STORAGE_KEY = 'golti.modelCapabilities'

interface StoredCapabilities {
  reasoning: string[]
}

interface ModelCapabilityState {
  reasoningModels: Record<string, true>
  markReasoning: (model?: string) => void
  isReasoningModel: (model?: string) => boolean
}

const loadReasoning = (): Record<string, true> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredCapabilities
    const map: Record<string, true> = {}
    for (const name of parsed.reasoning || []) map[name] = true
    return map
  } catch {
    return {}
  }
}

const persistReasoning = (map: Record<string, true>) => {
  try {
    const payload: StoredCapabilities = { reasoning: Object.keys(map) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* storage unavailable — capability detection stays in-memory for this session */
  }
}

export const useModelCapabilityStore = create<ModelCapabilityState>((set, get) => ({
  reasoningModels: loadReasoning(),

  markReasoning: (model) => {
    if (!model) return
    if (get().reasoningModels[model]) return
    set((state) => {
      const next = { ...state.reasoningModels, [model]: true as const }
      persistReasoning(next)
      return { reasoningModels: next }
    })
  },

  isReasoningModel: (model) => (model ? Boolean(get().reasoningModels[model]) : false)
}))

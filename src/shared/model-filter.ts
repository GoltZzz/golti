import { CookbookModel, ModelFamily, ModelSizeTier, ModelUseCase, QuantizationType, SystemInfoFull } from './types'
import { getCompatibility } from './compatibility'
import { sizeTierFor } from './model-taxonomy'

export interface ModelFilters {
  useCases: ModelUseCase[]
  families: ModelFamily[]
  sizeTiers: ModelSizeTier[]
  quantizations: QuantizationType[]
  compatibleOnly: boolean
}

export type ModelFilterListKey = 'useCases' | 'families' | 'sizeTiers' | 'quantizations'

export interface FilterOption<T extends string> {
  id: T
  label: string
}

export interface ModelFilterContext {
  filters: ModelFilters
  searchQuery: string
  systemInfo: SystemInfoFull | null
}

export const EMPTY_MODEL_FILTERS: ModelFilters = {
  useCases: [],
  families: [],
  sizeTiers: [],
  quantizations: [],
  compatibleOnly: false
}

export const SIZE_TIER_RANGES: { id: ModelSizeTier; minB: number; maxB: number | null }[] = [
  { id: 'tiny', minB: 0, maxB: 3 },
  { id: 'small', minB: 3, maxB: 10 },
  { id: 'medium', minB: 10, maxB: 20 },
  { id: 'large', minB: 20, maxB: 70 },
  { id: 'xl', minB: 70, maxB: 100 },
  { id: 'xxl', minB: 100, maxB: 500 },
  { id: 'datacenter', minB: 500, maxB: null }
]

export const USE_CASE_OPTIONS: FilterOption<ModelUseCase>[] = [
  { id: 'chat', label: 'Conversational' },
  { id: 'code', label: 'Coding' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'agentic', label: 'Agentic' },
  { id: 'vision', label: 'Vision' },
  { id: 'creative', label: 'Creative' }
]

export const FAMILY_OPTIONS: FilterOption<ModelFamily>[] = [
  { id: 'llama', label: 'Llama' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'gemma', label: 'Gemma' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'phi', label: 'Phi' },
  { id: 'glm', label: 'GLM' },
  { id: 'devstral', label: 'Devstral' },
  { id: 'falcon', label: 'Falcon' },
  { id: 'smollm', label: 'SmolLM' },
  { id: 'internlm', label: 'InternLM' },
  { id: 'command-r', label: 'Command-R' },
  { id: 'hermes', label: 'Hermes' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'codellama', label: 'CodeLlama' },
  { id: 'starcoder', label: 'StarCoder' },
  { id: 'yi', label: 'Yi' },
  { id: 'nomic', label: 'Nomic' },
  { id: 'other', label: 'Other' }
]

export const SIZE_TIER_OPTIONS: FilterOption<ModelSizeTier>[] = [
  { id: 'tiny', label: '<3B' },
  { id: 'small', label: '3B–9B' },
  { id: 'medium', label: '10B–19B' },
  { id: 'large', label: '20B–69B' },
  { id: 'xl', label: '70B–99B' },
  { id: 'xxl', label: '100B–499B' },
  { id: 'datacenter', label: '500B+' }
]

export const QUANTIZATION_OPTIONS: FilterOption<QuantizationType>[] = [
  { id: 'Q4_0', label: 'Q4_0' },
  { id: 'Q4_K_M', label: 'Q4_K_M' },
  { id: 'Q5_K_M', label: 'Q5_K_M' },
  { id: 'Q6_K', label: 'Q6_K' },
  { id: 'Q8_0', label: 'Q8_0' },
  { id: 'FP16', label: 'FP16' }
]

export function catalogFacets(models: CookbookModel[]): {
  useCases: Set<ModelUseCase>
  families: Set<ModelFamily>
  sizeTiers: Set<ModelSizeTier>
  quantizations: Set<QuantizationType>
} {
  const useCases = new Set<ModelUseCase>()
  const families = new Set<ModelFamily>()
  const sizeTiers = new Set<ModelSizeTier>()
  const quantizations = new Set<QuantizationType>()

  for (const model of models) {
    for (const uc of model.useCases) useCases.add(uc)
    families.add(model.family)
    sizeTiers.add(model.sizeTier)
    quantizations.add(model.quantization)
  }

  return { useCases, families, sizeTiers, quantizations }
}

export function availableOptions<T extends string>(
  options: FilterOption<T>[],
  present: Set<T>
): FilterOption<T>[] {
  return options.filter((opt) => present.has(opt.id))
}

export function matchesSearch(model: CookbookModel, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const q = trimmed.toLowerCase()
  return (
    model.name.toLowerCase().includes(q) ||
    model.description.toLowerCase().includes(q) ||
    model.family.toLowerCase().includes(q) ||
    model.ollamaTag.toLowerCase().includes(q)
  )
}

export function matchesModelFilters(model: CookbookModel, ctx: ModelFilterContext): boolean {
  const { filters, searchQuery, systemInfo } = ctx

  if (!matchesSearch(model, searchQuery)) return false

  if (filters.useCases.length > 0) {
    const hasOverlap = model.useCases.some((uc) => filters.useCases.includes(uc))
    if (!hasOverlap) return false
  }

  if (filters.families.length > 0) {
    if (!filters.families.includes(model.family)) return false
  }

  if (filters.sizeTiers.length > 0) {
    if (!filters.sizeTiers.includes(model.sizeTier)) return false
  }

  if (filters.quantizations.length > 0) {
    if (!filters.quantizations.includes(model.quantization)) return false
  }

  if (filters.compatibleOnly && systemInfo) {
    const comp = getCompatibility(systemInfo, model)
    if (comp === 'wont_fit') return false
  }

  return true
}

export function filterModels(models: CookbookModel[], ctx: ModelFilterContext): CookbookModel[] {
  return models.filter((model) => matchesModelFilters(model, ctx))
}

export function hasActiveFilters(filters: ModelFilters, searchQuery: string): boolean {
  return (
    filters.useCases.length > 0 ||
    filters.families.length > 0 ||
    filters.sizeTiers.length > 0 ||
    filters.quantizations.length > 0 ||
    filters.compatibleOnly ||
    searchQuery.trim().length > 0
  )
}

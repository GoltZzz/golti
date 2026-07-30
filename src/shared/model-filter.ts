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
  hint?: string
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
  { id: 'chat', label: 'Conversational', hint: 'General back-and-forth chat, questions, and everyday assistance.' },
  { id: 'code', label: 'Coding', hint: 'Tuned for writing, explaining, and debugging code.' },
  { id: 'reasoning', label: 'Reasoning', hint: 'Thinks step by step before answering — better at math, logic, and hard problems, but slower.' },
  { id: 'agentic', label: 'Agentic', hint: 'Good at tool calling and multi-step tasks that need following a plan.' },
  { id: 'vision', label: 'Vision', hint: 'Can read images as well as text — screenshots, photos, diagrams.' },
  { id: 'creative', label: 'Creative', hint: 'Leans toward storytelling, brainstorming, and open-ended writing.' }
]

export const FAMILY_OPTIONS: FilterOption<ModelFamily>[] = [
  { id: 'llama', label: 'Llama', hint: "Meta's open-weight family — a broad, well-supported all-rounder." },
  { id: 'deepseek', label: 'DeepSeek', hint: 'Strong reasoning and coding models from DeepSeek AI.' },
  { id: 'qwen', label: 'Qwen', hint: "Alibaba's family — wide size range and solid multilingual support." },
  { id: 'gemma', label: 'Gemma', hint: "Google's lightweight open models, built from the Gemini research." },
  { id: 'mistral', label: 'Mistral', hint: 'Efficient European models that punch above their size.' },
  { id: 'phi', label: 'Phi', hint: "Microsoft's small models trained on high-quality data — good on modest hardware." },
  { id: 'glm', label: 'GLM', hint: 'Zhipu AI bilingual (Chinese/English) models.' },
  { id: 'devstral', label: 'Devstral', hint: "Mistral's agent-focused coding models for real repositories." },
  { id: 'falcon', label: 'Falcon', hint: 'Open models from TII, Abu Dhabi.' },
  { id: 'smollm', label: 'SmolLM', hint: "Hugging Face's very small models for low-RAM machines." },
  { id: 'internlm', label: 'InternLM', hint: 'Shanghai AI Lab models with long-context strengths.' },
  { id: 'command-r', label: 'Command-R', hint: "Cohere's models tuned for retrieval and tool use." },
  { id: 'hermes', label: 'Hermes', hint: 'Nous Research fine-tunes focused on instruction following.' },
  { id: 'kimi', label: 'Kimi', hint: 'Moonshot AI models built for very long context.' },
  { id: 'codellama', label: 'CodeLlama', hint: 'Llama fine-tuned specifically for code completion.' },
  { id: 'starcoder', label: 'StarCoder', hint: 'BigCode models trained on permissively licensed source code.' },
  { id: 'yi', label: 'Yi', hint: '01.AI bilingual models.' },
  { id: 'nomic', label: 'Nomic', hint: 'Embedding models for search and retrieval, not chat.' },
  { id: 'other', label: 'Other', hint: "Models that don't belong to one of the listed families." }
]

export const SIZE_TIER_OPTIONS: FilterOption<ModelSizeTier>[] = [
  { id: 'tiny', label: '<3B', hint: 'Under 3 billion parameters. Fast and light, but simpler answers.' },
  { id: 'small', label: '3B–9B', hint: '3–9 billion parameters. The sweet spot for most laptops.' },
  { id: 'medium', label: '10B–19B', hint: '10–19 billion parameters. Noticeably sharper; wants ~16 GB RAM or more.' },
  { id: 'large', label: '20B–69B', hint: '20–69 billion parameters. Strong quality, needs a lot of memory.' },
  { id: 'xl', label: '70B–99B', hint: '70–99 billion parameters. Workstation territory.' },
  { id: 'xxl', label: '100B–499B', hint: '100–499 billion parameters. Multi-GPU rigs only.' },
  { id: 'datacenter', label: '500B+', hint: '500 billion parameters and up. Server hardware only.' }
]

export const QUANTIZATION_OPTIONS: FilterOption<QuantizationType>[] = [
  { id: 'Q4_0', label: 'Q4_0', hint: 'Older 4-bit compression. Smallest files, lowest quality — prefer Q4_K_M.' },
  { id: 'Q4_K_M', label: 'Q4_K_M', hint: '4-bit, the usual default. Best balance of size, speed, and quality.' },
  { id: 'Q5_K_M', label: 'Q5_K_M', hint: '5-bit. A bit larger than Q4_K_M for slightly better answers.' },
  { id: 'Q6_K', label: 'Q6_K', hint: '6-bit. Close to full quality, noticeably bigger download.' },
  { id: 'Q8_0', label: 'Q8_0', hint: '8-bit. Nearly identical to the original, about twice the size of Q4.' },
  { id: 'FP16', label: 'FP16', hint: 'No compression. Best quality, needs roughly 2 GB of RAM per billion parameters.' }
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

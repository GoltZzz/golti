import { CookbookModel, ModelFamily, ModelSizeTier, ModelUseCase, QuantizationType } from './types'
import { normalizeOllamaTag } from './ollama-tags'
import { sizeTierFor } from './model-taxonomy'

export { sizeTierFor }

export interface OllamaLibraryModel {
  name: string
  description: string
  capabilities: string[]
}

export interface OllamaLibraryTag {
  tag: string
  modelType: string
  fileType: string
  sizeBytes: number
  blobDigest?: string
  modelFamily?: string
  contextLabel?: string
  inputs?: string[]
}

export const OLLAMA_BLOB_BASE = 'https://registry.ollama.ai/v2/library'

export const MAX_GENERATED_DISK_GB = 64

export function buildBlobUrl(modelName: string, blobDigest: string): string {
  return `${OLLAMA_BLOB_BASE}/${modelName}/blobs/${blobDigest}`
}

export function ggufFilenameFor(modelName: string, tag: string, fileType: string): string {
  const slug = [modelName, tag, fileType]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}.gguf`
}

const FAMILY_PATTERNS: [RegExp, ModelFamily][] = [
  [/codellama/, 'codellama'],
  [/starcoder/, 'starcoder'],
  [/devstral/, 'devstral'],
  [/deepseek/, 'deepseek'],
  [/command-?[ar]/, 'command-r'],
  [/smollm/, 'smollm'],
  [/internlm/, 'internlm'],
  [/hermes/, 'hermes'],
  [/nomic/, 'nomic'],
  [/falcon/, 'falcon'],
  [/kimi/, 'kimi'],
  [/glm|chatglm/, 'glm'],
  [/gemma/, 'gemma'],
  [/qwen|qwq/, 'qwen'],
  [/phi/, 'phi'],
  [/mistral|mixtral|magistral|ministral/, 'mistral'],
  [/llama|llava/, 'llama'],
  [/(^|[^a-z])yi([^a-z]|$)/, 'yi']
]

export function mapFamily(name: string, modelFamily?: string): ModelFamily {
  const haystack = `${name} ${modelFamily ?? ''}`.toLowerCase()
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(haystack)) return family
  }
  return 'other'
}

export function mapQuantization(fileType: string): QuantizationType {
  const ft = fileType.trim().toUpperCase()
  if (/^(F16|FP16|BF16|F32|FP32|ALL_F32)$/.test(ft)) return 'FP16'
  if (ft.startsWith('Q8')) return 'Q8_0'
  if (ft.startsWith('Q6')) return 'Q6_K'
  if (ft.startsWith('Q5')) return 'Q5_K_M'
  if (/^Q4_K/.test(ft)) return 'Q4_K_M'
  if (ft.startsWith('Q4') || ft.startsWith('Q3') || ft.startsWith('Q2') || ft.startsWith('IQ')) {
    return 'Q4_0'
  }
  return 'Q4_K_M'
}

export function parseParameterBillions(modelType: string): number | null {
  const match = /^([\d.]+)\s*([bmk])?$/i.exec(modelType.trim())
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = (match[2] ?? 'b').toLowerCase()
  const billions = unit === 'b' ? value : unit === 'm' ? value / 1000 : value / 1_000_000
  return Math.round(billions * 1000) / 1000
}


const CODE_PATTERN = /cod(e|er|ing)|starcoder|devstral|sqlcoder|granite-code/

export function deriveUseCases(model: OllamaLibraryModel): ModelUseCase[] {
  const caps = model.capabilities.map((c) => c.toLowerCase())
  if (caps.includes('embedding')) return ['embedding']

  const useCases: ModelUseCase[] = ['chat']
  if (caps.includes('vision')) useCases.push('vision')
  if (caps.includes('thinking')) useCases.push('reasoning')
  if (caps.includes('tools')) useCases.push('agentic')
  if (CODE_PATTERN.test(`${model.name} ${model.description}`.toLowerCase())) useCases.push('code')
  return useCases
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function estimateRamGB(diskSizeGB: number): { required: number; recommended: number } {
  const required = roundTo(diskSizeGB * 1.05 + 0.5, 0.1)
  const recommended = Math.max(roundTo(required * 1.25, 0.5), required + 0.5)
  return { required: Math.round(required * 10) / 10, recommended }
}

const ACRONYMS = /^(gpt|glm|qwq|sql|nl|r1|olmo|exaone|llm|moe|tts|vl|oss|vlm|ocr)$/i

const NAME_CASING: Record<string, string> = {
  deepseek: 'DeepSeek',
  smollm: 'SmolLM',
  smollm2: 'SmolLM2',
  smollm3: 'SmolLM3',
  llava: 'LLaVA',
  tinyllama: 'TinyLlama',
  openchat: 'OpenChat',
  openhermes: 'OpenHermes',
  starcoder: 'StarCoder',
  starcoder2: 'StarCoder2',
  codellama: 'CodeLlama',
  minicpm: 'MiniCPM',
  internlm2: 'InternLM2',
  wizardlm: 'WizardLM',
  wizardlm2: 'WizardLM2',
  nomic: 'Nomic',
  bakllava: 'BakLLaVA'
}

function titleCase(name: string): string {
  return name
    .split(/[-_/]/)
    .map((part) => {
      if (!part) return part
      if (NAME_CASING[part.toLowerCase()]) return NAME_CASING[part.toLowerCase()]
      if (ACRONYMS.test(part)) return part.toUpperCase()
      if (/^\d/.test(part)) return part
      return part[0].toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function displayTag(tag: string): string {
  if (tag === 'latest') return ''
  return tag.replace(/(\d)([bm])\b/gi, (_, digits, unit) => `${digits}${unit.toUpperCase()}`)
}

function firstSentences(text: string, maxLength = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '))
  if (lastStop > 60) return cut.slice(0, lastStop + 1)
  return `${cut.replace(/[\s,;:]+$/, '')}…`
}

const CAPABILITY_HIGHLIGHTS: Record<string, string> = {
  tools: 'Tool calling',
  thinking: 'Reasoning / thinking mode',
  vision: 'Accepts images',
  embedding: 'Embeddings only — not for chat',
  completion: 'Text completion'
}

function formatDownloadSize(bytes: number): string {
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB download`
  return `${Math.round((bytes / 1e9) * 10) / 10} GB download`
}

function deriveHighlights(model: OllamaLibraryModel, tag: OllamaLibraryTag): string[] {
  const highlights: string[] = []
  if (tag.contextLabel) highlights.push(`${tag.contextLabel} context window`)
  for (const cap of model.capabilities) {
    const label = CAPABILITY_HIGHLIGHTS[cap.toLowerCase()]
    if (label && !highlights.includes(label)) highlights.push(label)
  }
  highlights.push(formatDownloadSize(tag.sizeBytes))
  return highlights.slice(0, 4)
}

export function deriveCatalogEntry(
  model: OllamaLibraryModel,
  tag: OllamaLibraryTag
): CookbookModel | null {
  const parameterBillions = parseParameterBillions(tag.modelType)
  if (parameterBillions === null) return null
  if (!Number.isFinite(tag.sizeBytes) || tag.sizeBytes <= 0) return null

  const useCases = deriveUseCases(model)
  if (!useCases.includes('chat')) return null

  const gb = tag.sizeBytes / 1e9
  if (gb > MAX_GENERATED_DISK_GB) return null

  const diskSizeGB = gb < 1 ? Math.round(gb * 100) / 100 : Math.round(gb * 10) / 10
  const quantization = mapQuantization(tag.fileType)
  const { required, recommended } = estimateRamGB(diskSizeGB)
  const suffix = displayTag(tag.tag)

  const gguf = tag.blobDigest
    ? {
        ggufUrl: buildBlobUrl(model.name, tag.blobDigest),
        ggufFilename: ggufFilenameFor(model.name, tag.tag, tag.fileType),
        ggufFileSize: tag.sizeBytes
      }
    : {}

  return {
    id: `${model.name}:${tag.tag}-${tag.fileType.toLowerCase()}`,
    name: [titleCase(model.name), suffix, `(${quantization})`].filter(Boolean).join(' '),
    family: mapFamily(model.name, tag.modelFamily),
    parameterBillions,
    sizeTier: sizeTierFor(parameterBillions),
    quantization,
    useCases,
    ramRequiredGB: required,
    ramRecommendedGB: recommended,
    diskSizeGB,
    ollamaTag: `${model.name}:${tag.tag}`,
    ...gguf,
    description: firstSentences(model.description),
    highlights: deriveHighlights(model, tag)
  }
}

/**
 * A curated entry with no download link borrows one from the generated entry
 * sharing its tag — but only at the same quantization, since the registry blob
 * is a specific file. The blob's byte count is authoritative, so the size and
 * RAM estimates are recomputed from it rather than kept.
 */
export function hydrateCurated(
  curated: CookbookModel[],
  generated: CookbookModel[]
): CookbookModel[] {
  const byTag = new Map(generated.map((m) => [normalizeOllamaTag(m.ollamaTag), m]))

  return curated.map((model) => {
    if (model.ggufUrl) return model

    const match = byTag.get(normalizeOllamaTag(model.ollamaTag))
    if (!match?.ggufUrl || !match.ggufFilename || !match.ggufFileSize) return model
    if (match.quantization !== model.quantization) return model

    const { required, recommended } = estimateRamGB(match.diskSizeGB)
    return {
      ...model,
      ggufUrl: match.ggufUrl,
      ggufFilename: match.ggufFilename,
      ggufFileSize: match.ggufFileSize,
      diskSizeGB: match.diskSizeGB,
      ramRequiredGB: required,
      ramRecommendedGB: recommended
    }
  })
}

export function mergeCatalog(
  rawCurated: CookbookModel[],
  generated: CookbookModel[]
): CookbookModel[] {
  const curated = hydrateCurated(rawCurated, generated)
  const seenTags = new Set(curated.map((m) => normalizeOllamaTag(m.ollamaTag)))
  const seenIds = new Set(curated.map((m) => m.id))
  const extras: CookbookModel[] = []

  for (const model of generated) {
    const tag = normalizeOllamaTag(model.ollamaTag)
    if (seenTags.has(tag) || seenIds.has(model.id)) continue
    seenTags.add(tag)
    seenIds.add(model.id)
    extras.push(model)
  }

  return [...curated, ...extras]
}

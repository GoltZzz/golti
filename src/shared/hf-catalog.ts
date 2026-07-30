import { CookbookModel, ModelUseCase, QuantizationType } from './types'
import { mapFamily, sizeTierFor } from './model-taxonomy'

export interface HFModelSummaryRaw {
  id: string
  downloads?: number
  likes?: number
  tags?: string[]
  pipeline_tag?: string
  lastModified?: string
  gated?: boolean | string
  private?: boolean
  disabled?: boolean
}

export interface HFTreeEntryRaw {
  path: string
  size?: number
  type?: string
  lfs?: { size?: number } | null
}

export interface HFGGUFMetaRaw {
  total?: number
  architecture?: string
  context_length?: number
}

export interface HFModelSummary {
  repoId: string
  author: string
  name: string
  downloads: number
  likes: number
  lastModified: string | null
  gated: boolean
  pipelineTag: string | null
}

export interface HFQuantVariant {
  quantization: QuantizationType
  quantLabel: string
  filename: string
  url: string
  fileSizeBytes: number
}

export interface HFModelDetail {
  repoId: string
  parameterBillions: number
  contextLength: number | null
  architecture: string | null
  variants: HFQuantVariant[]
}

const CHAT_PIPELINES = new Set(['text-generation', 'conversational', 'image-text-to-text'])

const EMBEDDING_TAGS = new Set([
  'feature-extraction',
  'sentence-similarity',
  'text-classification',
  'token-classification',
  'fill-mask',
  'image-classification',
  'automatic-speech-recognition',
  'text-to-speech',
  'text-to-image',
  'image-to-text',
  'object-detection',
  'reranker'
])

const NON_CHAT_NAME_PATTERN =
  /(^|[-_/])(embed|embedding|embeddings|bge|gte|e5|minilm|reranker|rerank|clip|siglip|whisper|wav2vec|bark|vits|sd-|stable-diffusion|flux|controlnet|vae|upscal)/i

const SHARD_PATTERN = /-\d{5}-of-\d{5}\.gguf$/i

const MMPROJ_PATTERN = /(^|[-_/])mmproj/i

export function isChatCapableRepo(raw: HFModelSummaryRaw): boolean {
  if (raw.private || raw.disabled) return false

  const tags = (raw.tags ?? []).map((t) => t.toLowerCase())
  if (!tags.includes('gguf')) return false

  const pipeline = (raw.pipeline_tag ?? '').toLowerCase()
  if (pipeline && !CHAT_PIPELINES.has(pipeline)) return false
  if (!pipeline && tags.some((t) => EMBEDDING_TAGS.has(t))) return false

  if (NON_CHAT_NAME_PATTERN.test(repoName(raw.id))) return false

  return true
}

function repoName(repoId: string): string {
  const slash = repoId.indexOf('/')
  return slash >= 0 ? repoId.slice(slash + 1) : repoId
}

function repoAuthor(repoId: string): string {
  const slash = repoId.indexOf('/')
  return slash >= 0 ? repoId.slice(0, slash) : ''
}

const QUANT_TOKEN = /(?:^|[-_.])((?:IQ|Q)\d+(?:_[A-Z0-9]+)*|BF16|FP16|F16|F32|FP32)(?=[-_.]|$)/i

export function parseQuantLabel(filename: string): string | null {
  const base = filename.replace(/\.gguf$/i, '')
  const match = QUANT_TOKEN.exec(base)
  return match ? match[1].toUpperCase() : null
}

export function normalizeQuant(label: string): QuantizationType {
  const q = label.toUpperCase()
  if (/^(F16|FP16|BF16|F32|FP32)$/.test(q)) return 'FP16'
  if (q.startsWith('Q8')) return 'Q8_0'
  if (q.startsWith('Q6')) return 'Q6_K'
  if (q.startsWith('Q5')) return 'Q5_K_M'
  if (/^Q4_K/.test(q)) return 'Q4_K_M'
  return 'Q4_0'
}

const QUANT_PREFERENCE = [
  'Q4_K_M',
  'Q4_K_S',
  'Q5_K_M',
  'Q5_K_S',
  'Q6_K',
  'Q8_0',
  'Q4_0',
  'Q3_K_L',
  'Q3_K_M',
  'IQ4_XS',
  'IQ4_NL',
  'F16',
  'BF16'
]

function quantRank(label: string): number {
  const index = QUANT_PREFERENCE.indexOf(label)
  return index === -1 ? QUANT_PREFERENCE.length : index
}

export function parseParamsFromRepoName(repoId: string): number | null {
  const name = repoName(repoId)
  const matches = [...name.matchAll(/(?:^|[-_.])(\d+(?:\.\d+)?)\s*([BM])(?=[-_.]|$)/gi)]
  if (matches.length === 0) return null
  const last = matches[matches.length - 1]
  const value = Number(last[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const billions = last[2].toUpperCase() === 'B' ? value : value / 1000
  return Math.round(billions * 1000) / 1000
}

export function deriveParameterBillions(
  repoId: string,
  gguf: HFGGUFMetaRaw | undefined
): number | null {
  const fromName = parseParamsFromRepoName(repoId)
  const total = gguf?.total
  const fromMeta =
    typeof total === 'number' && Number.isFinite(total) && total > 0
      ? Math.round((total / 1e9) * 1000) / 1000
      : null

  if (fromMeta === null) return fromName
  if (fromName === null) return fromMeta

  const ratio = fromMeta / fromName
  if (ratio < 0.65 || ratio > 1.55) return fromName

  return fromMeta
}

export function estimateRamGB(
  fileSizeBytes: number,
  contextLength: number | null
): { required: number; recommended: number } {
  const weightsGB = fileSizeBytes / 1e9
  const ctx = contextLength && contextLength > 0 ? Math.min(contextLength, 8192) : 4096
  const kvGB = (ctx / 4096) * 0.35
  const required = Math.round((weightsGB * 1.08 + kvGB + 0.6) * 10) / 10
  const recommended = Math.round(Math.max(required * 1.25, required + 0.5) * 10) / 10
  return { required, recommended }
}

export interface HFProjectorFile {
  filename: string
  url: string
  fileSizeBytes: number
}

const PROJECTOR_PATTERN = /(^|[-_/])(mmproj|clip|vision[-_]?(model|encoder)|projector)/i

/**
 * Vision towers ship beside the model as a separate GGUF that must not be
 * offered as a chat model. `selectQuantVariants` filters these out; this
 * surfaces them so a matching projector can be downloaded alongside.
 */
export function selectProjectorFiles(
  repoId: string,
  entries: HFTreeEntryRaw[],
  branch = 'main'
): HFProjectorFile[] {
  const found: HFProjectorFile[] = []

  for (const entry of entries) {
    if (entry.type === 'directory') continue
    const path = entry.path
    if (!/\.gguf$/i.test(path)) continue
    if (path.includes('/')) continue
    if (!PROJECTOR_PATTERN.test(path)) continue

    const size = entry.lfs?.size ?? entry.size
    if (typeof size !== 'number' || size <= 0) continue

    found.push({
      filename: path,
      url: `https://huggingface.co/${repoId}/resolve/${branch}/${encodeURIComponent(path)}`,
      fileSizeBytes: size
    })
  }

  // Prefer higher precision (F32 > F16 > quantized), which is the larger file.
  return found.sort((a, b) => b.fileSizeBytes - a.fileSizeBytes)
}

export function selectQuantVariants(
  repoId: string,
  entries: HFTreeEntryRaw[],
  branch = 'main'
): HFQuantVariant[] {
  const seen = new Map<string, HFQuantVariant>()

  for (const entry of entries) {
    if (entry.type === 'directory') continue
    const path = entry.path
    if (!/\.gguf$/i.test(path)) continue
    if (SHARD_PATTERN.test(path)) continue
    if (MMPROJ_PATTERN.test(path)) continue
    if (path.includes('/')) continue

    const size = entry.lfs?.size ?? entry.size
    if (typeof size !== 'number' || size <= 0) continue

    const label = parseQuantLabel(path)
    if (!label) continue

    const variant: HFQuantVariant = {
      quantization: normalizeQuant(label),
      quantLabel: label,
      filename: path,
      url: `https://huggingface.co/${repoId}/resolve/${branch}/${encodeURIComponent(path)}`,
      fileSizeBytes: size
    }

    const existing = seen.get(label)
    if (!existing || variant.fileSizeBytes < existing.fileSizeBytes) {
      seen.set(label, variant)
    }
  }

  return [...seen.values()].sort((a, b) => {
    const rankDiff = quantRank(a.quantLabel) - quantRank(b.quantLabel)
    if (rankDiff !== 0) return rankDiff
    return a.fileSizeBytes - b.fileSizeBytes
  })
}

export function deriveSummary(raw: HFModelSummaryRaw): HFModelSummary {
  return {
    repoId: raw.id,
    author: repoAuthor(raw.id),
    name: prettifyRepoName(repoName(raw.id)),
    downloads: raw.downloads ?? 0,
    likes: raw.likes ?? 0,
    lastModified: raw.lastModified ?? null,
    gated: raw.gated === true || typeof raw.gated === 'string',
    pipelineTag: raw.pipeline_tag ?? null
  }
}

export function prettifyRepoName(name: string): string {
  return name
    .replace(/[-_]?GGUF$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CODE_PATTERN = /cod(e|er|ing)|starcoder|devstral|sqlcoder|granite-code/i
const REASONING_PATTERN = /r1\b|reason|think|qwq|distill/i
const VISION_PATTERN = /\b(vl|vision|llava|multimodal)\b/i

export function deriveUseCases(repoId: string, pipelineTag?: string | null): ModelUseCase[] {
  const haystack = repoName(repoId).toLowerCase()
  const useCases: ModelUseCase[] = ['chat']
  if (CODE_PATTERN.test(haystack)) useCases.push('code')
  if (REASONING_PATTERN.test(haystack)) useCases.push('reasoning')
  if (VISION_PATTERN.test(haystack) || pipelineTag === 'image-text-to-text') {
    useCases.push('vision')
  }
  return useCases
}

function formatSize(bytes: number): string {
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB download`
  return `${Math.round((bytes / 1e9) * 10) / 10} GB download`
}

function formatContext(contextLength: number | null): string | null {
  if (!contextLength || contextLength <= 0) return null
  if (contextLength >= 1000) return `${Math.round(contextLength / 1024)}K context window`
  return `${contextLength} context window`
}

const BYTES_PER_BILLION_PARAMS: Record<QuantizationType, number> = {
  Q4_0: 0.55e9,
  Q4_K_M: 0.6e9,
  Q5_K_M: 0.7e9,
  Q6_K: 0.82e9,
  Q8_0: 1.06e9,
  FP16: 2.0e9
}

export function estimateParamsFromBytes(
  fileSizeBytes: number,
  quantization: QuantizationType
): number {
  const perBillion = BYTES_PER_BILLION_PARAMS[quantization]
  return Math.round((fileSizeBytes / perBillion) * 10) / 10
}

export function reconcileParams(
  declaredBillions: number,
  variant: HFQuantVariant
): number {
  const fromBytes = estimateParamsFromBytes(variant.fileSizeBytes, variant.quantization)
  if (declaredBillions <= 0) return fromBytes

  const ratio = fromBytes / declaredBillions
  if (ratio < 0.5 || ratio > 2) return fromBytes

  return declaredBillions
}

export function buildCookbookModels(
  summary: HFModelSummary,
  detail: HFModelDetail
): CookbookModel[] {
  const family = mapFamily(summary.repoId, detail.architecture ?? undefined)
  const useCases = deriveUseCases(summary.repoId, summary.pipelineTag)

  return detail.variants.map((variant) => {
    const params = reconcileParams(detail.parameterBillions, variant)
    const diskSizeGB = Math.round((variant.fileSizeBytes / 1e9) * 100) / 100
    const ram = estimateRamGB(variant.fileSizeBytes, detail.contextLength)
    const highlights: string[] = []
    const ctx = formatContext(detail.contextLength)
    if (ctx) highlights.push(ctx)
    highlights.push(`${variant.quantLabel} quantization`)
    highlights.push(formatSize(variant.fileSizeBytes))

    return {
      id: `hf:${summary.repoId}:${variant.quantLabel}`,
      name: `${summary.name} (${variant.quantLabel})`,
      family,
      parameterBillions: params,
      sizeTier: sizeTierFor(params),
      quantization: variant.quantization,
      useCases,
      ramRequiredGB: ram.required,
      ramRecommendedGB: ram.recommended,
      diskSizeGB,
      ollamaTag: '',
      ggufUrl: variant.url,
      ggufFilename: variant.filename,
      ggufFileSize: variant.fileSizeBytes,
      description: `${summary.repoId} on Hugging Face - community-published GGUF build, not verified by Golti.`,
      highlights: highlights.slice(0, 4)
    }
  })
}

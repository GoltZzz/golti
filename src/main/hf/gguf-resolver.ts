import { searchHFModels, fetchHFModelDetail } from './hf-client'
import { CookbookModel, QuantizationType } from '../../shared/types'

export interface GgufResolution {
  ggufUrl: string
  ggufFilename: string
  ggufFileSize: number
  repoId: string
}

export interface ResolveResult {
  resolution: GgufResolution | null
  error?: string
}

const resolveCache = new Map<string, { result: ResolveResult; at: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

function cacheKey(ollamaTag: string, quantization: QuantizationType): string {
  return `${ollamaTag.toLowerCase()}::${quantization}`
}

function buildSearchQuery(ollamaTag: string): string {
  const [name] = ollamaTag.split(':')
  return name
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/gi, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim()
}

function scoreRepo(repoId: string, ollamaName: string): number {
  const lower = repoId.toLowerCase()
  const target = ollamaName.toLowerCase().replace(/[-_.]/g, '')
  let score = 0

  if (lower.includes('gguf')) score += 5
  if (lower.includes('instruct')) score += 3
  if (lower.includes(target)) score += 10

  const trusted = ['bartowski', 'unsloth', 'thebloke', 'ggml-org', 'meta-llama', 'qwen', 'google', 'microsoft', 'mistralai']
  const author = repoId.split('/')[0]?.toLowerCase() ?? ''
  if (trusted.includes(author)) score += 4

  return score
}

function pickVariant(
  models: CookbookModel[],
  targetQuant: QuantizationType
): CookbookModel | null {
  const exact = models.find((m) => m.quantization === targetQuant && m.ggufUrl && m.ggufFilename)
  if (exact) return exact

  const withUrl = models.filter((m) => m.ggufUrl && m.ggufFilename)
  if (withUrl.length === 0) return null

  const preference: QuantizationType[] = ['Q4_K_M', 'Q4_0', 'Q5_K_M', 'Q6_K', 'Q8_0', 'FP16']
  for (const q of preference) {
    const match = withUrl.find((m) => m.quantization === q)
    if (match) return match
  }

  return withUrl[0]
}

export async function resolveGguf(
  ollamaTag: string,
  quantization: QuantizationType = 'Q4_K_M'
): Promise<ResolveResult> {
  const key = cacheKey(ollamaTag, quantization)
  const cached = resolveCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result

  const [name] = ollamaTag.split(':')
  const query = buildSearchQuery(ollamaTag)

  try {
    const search = await searchHFModels(query, 20)
    if (search.models.length === 0) {
      const result: ResolveResult = { resolution: null, error: `No GGUF models found on Hugging Face for "${name}".` }
      resolveCache.set(key, { result, at: Date.now() })
      return result
    }

    const ranked = [...search.models].sort(
      (a, b) => scoreRepo(b.repoId, name) - scoreRepo(a.repoId, name)
    )

    for (const repo of ranked.slice(0, 3)) {
      const detail = await fetchHFModelDetail(repo.repoId)
      if (detail.error || detail.models.length === 0) continue

      const variant = pickVariant(detail.models, quantization)
      if (variant?.ggufUrl && variant.ggufFilename) {
        const result: ResolveResult = {
          resolution: {
            ggufUrl: variant.ggufUrl,
            ggufFilename: variant.ggufFilename,
            ggufFileSize: variant.ggufFileSize ?? 0,
            repoId: repo.repoId
          }
        }
        resolveCache.set(key, { result, at: Date.now() })
        return result
      }
    }

    const result: ResolveResult = {
      resolution: null,
      error: `Found repos on Hugging Face for "${name}" but none had a downloadable GGUF file.`
    }
    resolveCache.set(key, { result, at: Date.now() })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach Hugging Face'
    return { resolution: null, error: message }
  }
}

export function _resetResolveCacheForTests(): void {
  resolveCache.clear()
}

import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { CookbookModel } from '../../shared/types'
import {
  HFModelSummary,
  HFModelSummaryRaw,
  HFTreeEntryRaw,
  HFGGUFMetaRaw,
  isChatCapableRepo,
  deriveSummary,
  deriveParameterBillions,
  selectQuantVariants,
  buildCookbookModels
} from '../../shared/hf-catalog'

const API_ROOT = 'https://huggingface.co/api'
const USER_AGENT = 'golti-cookbook (+https://github.com/GoltZzz/golti)'
const REQUEST_TIMEOUT_MS = 15000
const LIST_TTL_MS = 30 * 60 * 1000
const DETAIL_TTL_MS = 6 * 60 * 60 * 1000
const MAX_DETAIL_CACHE = 120
const DEFAULT_LIMIT = 60

export interface HFSearchResult {
  models: HFModelSummary[]
  stale: boolean
  error?: string
}

export interface HFDetailResult {
  repoId: string
  models: CookbookModel[]
  error?: string
}

interface CacheEntry<T> {
  value: T
  fetchedAt: number
}

const listCache = new Map<string, CacheEntry<HFModelSummary[]>>()
const detailCache = new Map<string, CacheEntry<CookbookModel[]>>()

let diskCacheLoaded = false

function cacheFile(): string {
  return join(app.getPath('userData'), 'hf-catalog-cache.json')
}

async function loadDiskCache(): Promise<void> {
  if (diskCacheLoaded) return
  diskCacheLoaded = true
  try {
    const raw = await readFile(cacheFile(), 'utf-8')
    const parsed = JSON.parse(raw) as {
      lists?: Record<string, CacheEntry<HFModelSummary[]>>
    }
    for (const [key, entry] of Object.entries(parsed.lists ?? {})) {
      if (!listCache.has(key)) listCache.set(key, entry)
    }
  } catch {
    // no cache on disk yet
  }
}

async function persistDiskCache(): Promise<void> {
  try {
    const dir = app.getPath('userData')
    await mkdir(dir, { recursive: true })
    const lists: Record<string, CacheEntry<HFModelSummary[]>> = {}
    for (const [key, entry] of listCache) lists[key] = entry
    await writeFile(cacheFile(), JSON.stringify({ lists }), 'utf-8')
  } catch {
    // cache persistence is best-effort
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    })
    if (res.status === 429) throw new Error('Hugging Face is rate limiting requests. Try again shortly.')
    if (!res.ok) throw new Error(`Hugging Face returned ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function listCacheKey(query: string, limit: number): string {
  return `${query.trim().toLowerCase()}::${limit}`
}

export async function searchHFModels(
  query = '',
  limit = DEFAULT_LIMIT
): Promise<HFSearchResult> {
  await loadDiskCache()

  const safeLimit = Math.min(Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1), 100)
  const key = listCacheKey(query, safeLimit)
  const cached = listCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < LIST_TTL_MS) {
    return { models: cached.value, stale: false }
  }

  const params = new URLSearchParams({
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: String(safeLimit * 2)
  })
  const trimmed = query.trim()
  if (trimmed) params.set('search', trimmed)

  try {
    const raw = await fetchJson<HFModelSummaryRaw[]>(`${API_ROOT}/models?${params.toString()}`)
    const models = raw.filter(isChatCapableRepo).slice(0, safeLimit).map(deriveSummary)
    listCache.set(key, { value: models, fetchedAt: Date.now() })
    void persistDiskCache()
    return { models, stale: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reach Hugging Face'
    if (cached) return { models: cached.value, stale: true, error: message }
    return { models: [], stale: false, error: message }
  }
}

function trimDetailCache(): void {
  while (detailCache.size > MAX_DETAIL_CACHE) {
    const oldest = detailCache.keys().next()
    if (oldest.done) break
    detailCache.delete(oldest.value)
  }
}

export async function fetchHFModelDetail(repoId: string): Promise<HFDetailResult> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoId)) {
    return { repoId, models: [], error: 'Invalid Hugging Face repository id' }
  }

  const cached = detailCache.get(repoId)
  if (cached && Date.now() - cached.fetchedAt < DETAIL_TTL_MS) {
    return { repoId, models: cached.value }
  }

  const encoded = repoId.split('/').map(encodeURIComponent).join('/')

  try {
    const [meta, tree] = await Promise.all([
      fetchJson<{ id: string; gguf?: HFGGUFMetaRaw } & HFModelSummaryRaw>(
        `${API_ROOT}/models/${encoded}?expand=gguf`
      ),
      fetchJson<HFTreeEntryRaw[]>(`${API_ROOT}/models/${encoded}/tree/main`)
    ])

    const variants = selectQuantVariants(repoId, tree)
    if (variants.length === 0) {
      return { repoId, models: [], error: 'No downloadable GGUF files found in this repository.' }
    }

    const summary = deriveSummary({ ...meta, id: repoId })
    const models = buildCookbookModels(summary, {
      repoId,
      parameterBillions: deriveParameterBillions(repoId, meta.gguf) ?? 0,
      contextLength: meta.gguf?.context_length ?? null,
      architecture: meta.gguf?.architecture ?? null,
      variants
    })

    detailCache.set(repoId, { value: models, fetchedAt: Date.now() })
    trimDetailCache()
    return { repoId, models }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reach Hugging Face'
    if (cached) return { repoId, models: cached.value, error: message }
    return { repoId, models: [], error: message }
  }
}

export function _resetHFCachesForTests(): void {
  listCache.clear()
  detailCache.clear()
  diskCacheLoaded = false
}

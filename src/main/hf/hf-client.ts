import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { CookbookModel } from '../../shared/types'
import { MODEL_CATALOG } from '../../shared/model-catalog'
import {
  HFModelSummary,
  HFModelSummaryRaw,
  HFTreeEntryRaw,
  HFGGUFMetaRaw,
  isChatCapableRepo,
  deriveSummary,
  deriveParameterBillions,
  selectQuantVariants,
  selectProjectorFiles,
  buildCookbookModels,
  type HFProjectorFile
} from '../../shared/hf-catalog'

const API_ROOT = 'https://huggingface.co/api'
const TRUSTED_AUTHORS = ['bartowski', 'unsloth', 'lmstudio-community', 'ggml-org', 'TheBloke']
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
  /** Vision projectors in the repo, if any — enables local image input. */
  projectors?: HFProjectorFile[]
  error?: string
}

interface CacheEntry<T> {
  value: T
  fetchedAt: number
}

const listCache = new Map<string, CacheEntry<HFModelSummary[]>>()
const detailCache = new Map<
  string,
  CacheEntry<{ models: CookbookModel[]; projectors: HFProjectorFile[] }>
>()

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

/**
 * With no search term the shelf is drawn from uploaders known to publish
 * reliable GGUFs, one request each. A plain top-downloads query returns barely
 * a third from those authors, so filtering client-side would waste most of it.
 */
async function fetchTrustedShelf(limit: number): Promise<HFModelSummaryRaw[]> {
  const perAuthor = Math.max(Math.ceil(limit / TRUSTED_AUTHORS.length) * 2, 10)

  const batches = await Promise.allSettled(
    TRUSTED_AUTHORS.map((author) =>
      fetchJson<HFModelSummaryRaw[]>(
        `${API_ROOT}/models?${new URLSearchParams({
          author,
          filter: 'gguf',
          sort: 'downloads',
          direction: '-1',
          limit: String(perAuthor)
        })}`
      )
    )
  )

  const ok = batches
    .filter((b) => b.status === 'fulfilled')
    .map((b) => (b as PromiseFulfilledResult<HFModelSummaryRaw[]>).value)

  if (ok.length === 0) {
    throw batches[0]?.status === 'rejected' ? batches[0].reason : new Error('Hugging Face unreachable')
  }

  const lists = ok.map((list) => [...list].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0)))
  const interleaved: HFModelSummaryRaw[] = []
  for (let round = 0; interleaved.length < limit * 2; round++) {
    const before = interleaved.length
    for (const list of lists) {
      if (list[round]) interleaved.push(list[round])
    }
    if (interleaved.length === before) break
  }

  return interleaved
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

  const trimmed = query.trim()

  try {
    const raw = trimmed
      ? await fetchJson<HFModelSummaryRaw[]>(
          `${API_ROOT}/models?${new URLSearchParams({
            filter: 'gguf',
            sort: 'downloads',
            direction: '-1',
            limit: String(safeLimit * 2),
            search: trimmed
          })}`
        )
      : await fetchTrustedShelf(safeLimit)

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
    return { repoId, models: cached.value.models, projectors: cached.value.projectors }
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

    const projectors = selectProjectorFiles(repoId, tree)

    detailCache.set(repoId, { value: { models, projectors }, fetchedAt: Date.now() })
    trimDetailCache()
    return { repoId, models, projectors }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reach Hugging Face'
    if (cached) {
      return {
        repoId,
        models: cached.value.models,
        projectors: cached.value.projectors,
        error: message
      }
    }
    return { repoId, models: [], error: message }
  }
}

export interface ProjectorLookupResult {
  repoId?: string
  projectors: HFProjectorFile[]
  error?: string
}

const MAX_PROJECTOR_CANDIDATES = 8
const OLLAMA_REGISTRY = 'https://registry.ollama.ai/v2/library'
const OLLAMA_PROJECTOR_MEDIA_TYPE = 'application/vnd.ollama.image.projector'

interface OllamaManifest {
  layers?: { mediaType: string; digest: string; size?: number }[]
}

/**
 * Catalog models come from the Ollama registry, where the vision tower is a
 * `projector` layer of the same manifest — no Hugging Face lookup can find it.
 */
async function findOllamaProjector(modelFilename: string): Promise<ProjectorLookupResult | null> {
  const entry = MODEL_CATALOG.find(
    (m) => m.ggufFilename?.toLowerCase() === modelFilename.toLowerCase()
  )
  if (!entry?.ollamaTag) return null

  const [name, tag = 'latest'] = entry.ollamaTag.split(':')
  const url = `${OLLAMA_REGISTRY}/${encodeURIComponent(name)}/manifests/${encodeURIComponent(tag)}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`Ollama registry returned ${res.status}`)
    const manifest = (await res.json()) as OllamaManifest
    const layer = manifest.layers?.find((l) => l.mediaType === OLLAMA_PROJECTOR_MEDIA_TYPE)
    if (!layer?.digest) {
      return { repoId: entry.ollamaTag, projectors: [], error: `${entry.name} has no vision tower.` }
    }

    return {
      repoId: entry.ollamaTag,
      projectors: [
        {
          filename: `mmproj-${modelFilename.replace(/\.gguf$/i, '')}.gguf`,
          url: `${OLLAMA_REGISTRY}/${name}/blobs/${layer.digest}`,
          fileSizeBytes: layer.size ?? 0
        }
      ]
    }
  } catch (error) {
    return {
      repoId: entry.ollamaTag,
      projectors: [],
      error: error instanceof Error ? error.message : 'Failed to reach the Ollama registry'
    }
  }
}

function projectorSearchQuery(modelFilename: string): string {
  return modelFilename
    .replace(/\.gguf$/i, '')
    .replace(/[-_.](i?q\d+(?:[-_][a-z0-9]+)*|f16|f32|bf16|mxfp4)$/i, '')
    .replace(/[-_.]+/g, ' ')
    .trim()
}

/**
 * A model installed from the browser keeps no record of its source repo, so the
 * repo is recovered by matching the exact GGUF filename in candidate trees.
 */
export async function findProjectorsForLocalModel(
  modelFilename: string
): Promise<ProjectorLookupResult> {
  const fromOllama = await findOllamaProjector(modelFilename)
  if (fromOllama && (fromOllama.projectors.length > 0 || fromOllama.error)) return fromOllama

  const wanted = modelFilename.toLowerCase()
  const search = await searchHFModels(projectorSearchQuery(modelFilename), 20)
  if (search.models.length === 0) {
    return { projectors: [], error: search.error ?? 'No matching repository on Hugging Face.' }
  }

  let lastError: string | undefined
  for (const candidate of search.models.slice(0, MAX_PROJECTOR_CANDIDATES)) {
    const encoded = candidate.repoId.split('/').map(encodeURIComponent).join('/')
    try {
      const tree = await fetchJson<HFTreeEntryRaw[]>(`${API_ROOT}/models/${encoded}/tree/main`)
      if (!tree.some((e) => e.type !== 'directory' && e.path.toLowerCase() === wanted)) continue

      const projectors = selectProjectorFiles(candidate.repoId, tree)
      if (projectors.length === 0) {
        return {
          repoId: candidate.repoId,
          projectors: [],
          error: `${candidate.repoId} ships no vision projector.`
        }
      }
      return { repoId: candidate.repoId, projectors }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Failed to reach Hugging Face'
    }
  }

  return { projectors: [], error: lastError ?? 'Could not find this model on Hugging Face.' }
}

export function _resetHFCachesForTests(): void {
  listCache.clear()
  detailCache.clear()
  diskCacheLoaded = false
}

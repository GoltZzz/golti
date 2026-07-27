import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import type { CookbookModel } from '../src/shared/types.ts'
import type { OllamaLibraryModel, OllamaLibraryTag } from '../src/shared/ollama-catalog.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'src/shared/model-catalog.generated.ts')
const CACHE_DIR = join(ROOT, 'node_modules/.cache/ollama-catalog')

const LIBRARY_URL = 'https://ollama.com/library?sort=popular'
const REGISTRY = 'https://registry.ollama.ai/v2/library'
const CONCURRENCY = 6
const MIN_MODELS = 150
const MAX_TAGS_PER_MODEL = 8
const USER_AGENT = 'golti-cookbook-sync (+https://github.com/GoltZzz/golti)'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const noCache = args.includes('--no-cache')
const limitArg = args.indexOf('--limit')
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity

function log(message: string): void {
  process.stdout.write(`${message}\n`)
}

async function loadDerive(): Promise<
  (model: OllamaLibraryModel, tag: OllamaLibraryTag) => CookbookModel | null
> {
  const outfile = join(CACHE_DIR, 'ollama-catalog.bundle.mjs')
  await mkdir(CACHE_DIR, { recursive: true })
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/shared/ollama-catalog.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning'
  })
  const mod = await import(`${outfile}?t=${Date.now()}`)
  return mod.deriveCatalogEntry
}

async function fetchText(url: string): Promise<string> {
  const key = createHash('sha1').update(url).digest('hex')
  const cachePath = join(CACHE_DIR, key)
  if (!noCache) {
    try {
      return await readFile(cachePath, 'utf-8')
    } catch {
      // not cached yet
    }
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const body = await res.text()
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(cachePath, body)
      return body
    } catch (err) {
      lastError = err
      await new Promise((resolve) => setTimeout(resolve, attempt * 750))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function mapLimit<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

const KNOWN_CAPABILITIES = ['tools', 'thinking', 'vision', 'embedding', 'completion', 'insert']

function parseLibraryIndex(html: string): OllamaLibraryModel[] {
  const models: OllamaLibraryModel[] = []
  const blocks = html.split(/<li\b/).slice(1)

  for (const block of blocks) {
    const nameMatch = /href="\/library\/([^"/?#]+)"/.exec(block)
    if (!nameMatch) continue
    const name = nameMatch[1]
    if (models.some((m) => m.name === name)) continue

    const descMatch = /<p class="max-w-lg[^"]*">([\s\S]*?)<\/p>/.exec(block)
    const description = descMatch ? decodeEntities(descMatch[1].replace(/<[^>]*>/g, '')).trim() : ''

    const chips = [...block.matchAll(/<span[^>]*text-xs font-medium[^>]*>([^<]+)<\/span>/g)].map(
      (m) => m[1].trim().toLowerCase()
    )
    const capabilities = chips.filter((chip) => KNOWN_CAPABILITIES.includes(chip))

    models.push({ name, description, capabilities })
  }

  return models
}

interface TagPageEntry {
  tag: string
  contextLabel?: string
  inputs?: string[]
}

function parseTagsPage(html: string, modelName: string): TagPageEntry[] {
  const entries: TagPageEntry[] = []
  const seen = new Set<string>()

  for (const block of html.split('<div class="group px-4 py-3">').slice(1)) {
    const tagMatch = new RegExp(`href="/library/${modelName}:([^"]+)"`).exec(block)
    if (!tagMatch) continue
    const tag = tagMatch[1]
    if (seen.has(tag)) continue
    seen.add(tag)

    const cells = [...block.matchAll(/text-\[13px\][^>]*>\s*([^<>]+?)\s*</g)].map((m) => m[1].trim())
    const contextLabel = cells.find((cell) => /^[\d.]+[KM]?$/i.test(cell))
    const inputCell = cells.find((cell) => /^(Text|Image|Audio)(\s*,\s*(Text|Image|Audio))*$/i.test(cell))
    const inputs = inputCell?.split(',').map((s) => s.trim())

    entries.push({ tag, contextLabel, inputs })
  }

  return entries
}

/**
 * One entry per parameter size: the bare `8b`-style tags plus `latest`.
 * Variant tags (`8b-instruct-q8_0`, `-fp16`, dated snapshots) are skipped —
 * they explode the catalog without helping anyone choose.
 */
function selectTags(entries: TagPageEntry[]): TagPageEntry[] {
  const wanted = entries.filter(
    (e) => e.tag === 'latest' || /^\d+(\.\d+)?[bm]$/i.test(e.tag) || /^\d+x\d+b$/i.test(e.tag)
  )
  const sized = wanted.filter((e) => e.tag !== 'latest')
  return (sized.length > 0 ? sized : wanted).slice(0, MAX_TAGS_PER_MODEL)
}

interface RegistryManifest {
  config?: { digest?: string }
  layers?: { mediaType: string; size: number }[]
}

interface RegistryConfig {
  model_type?: string
  file_type?: string
  model_family?: string
}

async function fetchTagDetails(
  modelName: string,
  entry: TagPageEntry
): Promise<OllamaLibraryTag | null> {
  try {
    const manifest: RegistryManifest = JSON.parse(
      await fetchText(`${REGISTRY}/${modelName}/manifests/${entry.tag}`)
    )
    const weights = manifest.layers?.find((l) => l.mediaType === 'application/vnd.ollama.image.model')
    if (!weights?.size || !manifest.config?.digest) return null

    const config: RegistryConfig = JSON.parse(
      await fetchText(`${REGISTRY}/${modelName}/blobs/${manifest.config.digest}`)
    )
    if (!config.model_type || !config.file_type) return null

    return {
      tag: entry.tag,
      modelType: config.model_type,
      fileType: config.file_type,
      sizeBytes: weights.size,
      modelFamily: config.model_family,
      contextLabel: entry.contextLabel,
      inputs: entry.inputs
    }
  } catch {
    return null
  }
}

function serialize(models: CookbookModel[], syncedAt: string): string {
  const body = models
    .map((model) => `  ${JSON.stringify(model)}`)
    .join(',\n')
  return `// Generated by scripts/sync-ollama-catalog.ts — do not edit by hand.
// Run \`npm run sync:catalog\` to refresh. Source: https://ollama.com/library
import { CookbookModel } from './types'

export const OLLAMA_LIBRARY_SYNCED_AT = '${syncedAt}'

export const OLLAMA_LIBRARY_CATALOG: CookbookModel[] = [
${body}
]
`
}

async function main(): Promise<void> {
  const deriveCatalogEntry = await loadDerive()

  log('Fetching Ollama library index…')
  const allModels = parseLibraryIndex(await fetchText(LIBRARY_URL))
  log(`  ${allModels.length} models listed`)
  if (allModels.length === 0) throw new Error('library index parsed to zero models')

  const models = Number.isFinite(limit) ? allModels.slice(0, limit) : allModels

  log(`Resolving tags for ${models.length} models (concurrency ${CONCURRENCY})…`)
  let done = 0
  const perModel = await mapLimit(models, async (model) => {
    let entries: TagPageEntry[] = []
    try {
      entries = selectTags(parseTagsPage(await fetchText(`https://ollama.com/library/${model.name}/tags`), model.name))
    } catch (err) {
      log(`  ! ${model.name}: ${(err as Error).message}`)
    }

    const derived: CookbookModel[] = []
    for (const entry of entries) {
      const details = await fetchTagDetails(model.name, entry)
      if (!details) continue
      const catalogEntry = deriveCatalogEntry(model, details)
      if (catalogEntry) derived.push(catalogEntry)
    }

    done++
    if (done % 20 === 0) log(`  ${done}/${models.length}`)
    return derived
  })

  const generated = perModel.flat()
  const distinctModels = new Set(generated.map((m) => m.ollamaTag.split(':')[0])).size
  log(`Derived ${generated.length} entries across ${distinctModels} models`)

  if (Number.isFinite(limit)) {
    log('Limit flag set — skipping the minimum-coverage check')
  } else if (distinctModels < MIN_MODELS) {
    throw new Error(
      `only ${distinctModels} models resolved (expected >= ${MIN_MODELS}); leaving the committed catalog alone`
    )
  }

  generated.sort((a, b) => a.id.localeCompare(b.id))

  if (dryRun) {
    log('Dry run — not writing. Sample:')
    for (const model of generated.slice(0, 5)) log(`  ${JSON.stringify(model)}`)
    return
  }

  await writeFile(OUTPUT, serialize(generated, new Date().toISOString()))
  log(`Wrote ${OUTPUT}`)
  log('Run `npm run typecheck` and `npm test` before committing.')
}

main().catch((err) => {
  process.stderr.write(`sync-ollama-catalog failed: ${(err as Error).message}\n`)
  process.exitCode = 1
})

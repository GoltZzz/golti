/**
 * Normalize an Ollama model tag so comparisons are exact.
 * Tagless names (e.g. "llama3.2") become "llama3.2:latest".
 */
export function normalizeOllamaTag(tag: string): string {
  const trimmed = tag.trim().toLowerCase()
  if (!trimmed) return trimmed
  if (trimmed.includes(':')) return trimmed
  return `${trimmed}:latest`
}

/**
 * Find the exact installed Ollama tag that matches a catalog tag.
 * Prefers an exact normalized match; returns undefined if none match.
 */
export function findInstalledOllamaTag(
  catalogTag: string,
  installedModels: string[]
): string | undefined {
  const target = normalizeOllamaTag(catalogTag)
  return installedModels.find((m) => normalizeOllamaTag(m) === target)
}

export function isOllamaTagInstalled(
  catalogTag: string,
  installedModels: string[]
): boolean {
  return findInstalledOllamaTag(catalogTag, installedModels) !== undefined
}

import type { WebSearchResult, WebSearchSettings, WebSearchTestResult } from '../../shared/types'
import {
  ensureSearchRuntimeRunning,
  getSearchAuthToken,
  getSearchEndpoint,
  isSearchRuntimeInstalled,
  installAndStartSearchRuntime
} from '../search-runtime'
import { dbSettings } from '../db/database'

function clampResults(n?: number): number {
  return Math.min(Math.max(n || 5, 1), 10)
}

async function searchLocal(
  query: string,
  maxResults: number,
  endpoint?: string
): Promise<{ results: WebSearchResult[]; engine?: string }> {
  const settings = dbSettings.get()
  await ensureSearchRuntimeRunning({
    apiPort: settings.searchRuntimePort,
    searxPort: settings.searchRuntimeSearxPort
  })

  const base = (endpoint || getSearchEndpoint()).replace(/\/+$/, '')
  const token = getSearchAuthToken()
  const res = await fetch(`${base}/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Golti-Token': token
    },
    body: JSON.stringify({ query, maxResults }),
    signal: AbortSignal.timeout(25000)
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as any
      detail = body?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || 'Search is temporarily unavailable.')
  }

  const data = (await res.json()) as any
  const results = Array.isArray(data.results) ? data.results : []
  return {
    engine: typeof data.engine === 'string' ? data.engine : undefined,
    results: results.slice(0, maxResults).map((r: any) => ({
      title: r.title || r.url || 'Untitled',
      url: r.url || '',
      snippet: r.snippet || r.content || ''
    }))
  }
}

async function searchBrave(query: string, apiKey: string, count: number): Promise<WebSearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey
    }
  })
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`)
  }
  const data = (await res.json()) as any
  const results = Array.isArray(data.web?.results) ? data.web.results : []
  return results.slice(0, count).map((r: any) => ({
    title: r.title || r.url || 'Untitled',
    url: r.url || '',
    snippet: r.description || r.extra_snippets?.[0] || ''
  }))
}

async function searchTavily(query: string, apiKey: string, count: number): Promise<WebSearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: count,
      include_answer: false,
      search_depth: 'basic'
    })
  })
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`)
  }
  const data = (await res.json()) as any
  const results = Array.isArray(data.results) ? data.results : []
  return results.slice(0, count).map((r: any) => ({
    title: r.title || r.url || 'Untitled',
    url: r.url || '',
    snippet: r.content || r.snippet || ''
  }))
}

export async function ensureLocalSearchReady(
  onProgress?: (p: any) => void
): Promise<void> {
  if (!isSearchRuntimeInstalled()) {
    await installAndStartSearchRuntime(onProgress)
  } else {
    await ensureSearchRuntimeRunning()
  }
}

export async function runWebSearch(
  query: string,
  settings: WebSearchSettings
): Promise<WebSearchResult[]> {
  if (!settings.enabled && settings.provider !== 'local') {
    return []
  }

  const maxResults = clampResults(settings.maxResults)
  const provider = settings.provider || 'local'

  if (provider === 'local' || provider === 'none') {
    // Local is the default plug-and-play path
    const { results } = await searchLocal(query, maxResults, settings.endpoint)
    return results
  }

  if (!settings.apiKey) {
    throw new Error('Web search is not configured')
  }
  if (provider === 'brave') return searchBrave(query, settings.apiKey, maxResults)
  if (provider === 'tavily') return searchTavily(query, settings.apiKey, maxResults)
  return []
}

export async function testWebSearch(query?: string): Promise<WebSearchTestResult> {
  const settings = dbSettings.get()
  const ws: WebSearchSettings = {
    provider: 'local',
    enabled: true,
    maxResults: settings.webSearch?.maxResults || 5,
    endpoint: settings.webSearch?.endpoint
  }
  try {
    await ensureLocalSearchReady()
    const { results, engine } = await searchLocal(
      query?.trim() || 'latest technology news',
      clampResults(ws.maxResults),
      ws.endpoint
    )
    return {
      ok: results.length > 0,
      results,
      engine,
      error: results.length === 0 ? 'No results returned' : undefined
    }
  } catch (err: any) {
    return {
      ok: false,
      results: [],
      error: err?.message || 'Web search test failed'
    }
  }
}

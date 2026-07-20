import type { WebSearchResult, WebSearchSettings } from '../../shared/types'

export async function runWebSearch(
  query: string,
  settings: WebSearchSettings
): Promise<WebSearchResult[]> {
  if (!settings.enabled || settings.provider === 'none') {
    return []
  }
  if (!settings.apiKey) {
    throw new Error('Web search API key is not configured')
  }

  const maxResults = Math.min(Math.max(settings.maxResults || 5, 1), 10)

  if (settings.provider === 'brave') {
    return searchBrave(query, settings.apiKey, maxResults)
  }
  if (settings.provider === 'tavily') {
    return searchTavily(query, settings.apiKey, maxResults)
  }

  return []
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
    throw new Error(`Brave search failed (${res.status}): ${await res.text()}`)
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
    throw new Error(`Tavily search failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as any
  const results = Array.isArray(data.results) ? data.results : []
  return results.slice(0, count).map((r: any) => ({
    title: r.title || r.url || 'Untitled',
    url: r.url || '',
    snippet: r.content || r.snippet || ''
  }))
}

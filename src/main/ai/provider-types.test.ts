import { describe, expect, it, vi } from 'vitest'
import { applyGenerationDefaults, textEvent, usageEvent, doneEvent } from './provider-types'

describe('provider helpers', () => {
  it('applies generation defaults', () => {
    expect(applyGenerationDefaults(undefined)).toEqual({
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      stopSequences: undefined
    })
    expect(applyGenerationDefaults({ temperature: 0.2 }).temperature).toBe(0.2)
  })

  it('builds stream events', () => {
    expect(textEvent('hi')).toEqual({ type: 'text', text: 'hi' })
    expect(usageEvent({ promptTokens: 1, completionTokens: 2, totalTokens: 3 })).toMatchObject({
      type: 'usage'
    })
    expect(doneEvent('stop')).toEqual({ type: 'done', finishReason: 'stop' })
  })
})

describe('web search adapters', () => {
  it('returns empty when disabled', async () => {
    const { runWebSearch } = await import('../services/web-search')
    const results = await runWebSearch('query', {
      provider: 'none',
      enabled: false,
      maxResults: 5
    })
    expect(results).toEqual([])
  })

  it('throws without api key', async () => {
    const { runWebSearch } = await import('../services/web-search')
    await expect(
      runWebSearch('query', { provider: 'brave', enabled: true, maxResults: 3 })
    ).rejects.toThrow(/not configured/)
  })

  it('parses brave response', async () => {
    const { runWebSearch } = await import('../services/web-search')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [{ title: 'T', url: 'https://example.com', description: 'S' }]
          }
        })
      }))
    )
    const results = await runWebSearch('q', {
      provider: 'brave',
      enabled: true,
      apiKey: 'key',
      maxResults: 5
    })
    expect(results[0].title).toBe('T')
    expect(results[0].snippet).toBe('S')
    vi.unstubAllGlobals()
  })

  it('parses tavily response', async () => {
    const { runWebSearch } = await import('../services/web-search')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [{ title: 'Tavily Hit', url: 'https://tavily.example', content: 'Snippet body' }]
        })
      }))
    )
    const results = await runWebSearch('q', {
      provider: 'tavily',
      enabled: true,
      apiKey: 'key',
      maxResults: 5
    })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: 'Tavily Hit',
      url: 'https://tavily.example',
      snippet: 'Snippet body'
    })
    vi.unstubAllGlobals()
  })

  it('surfaces provider HTTP errors', async () => {
    const { runWebSearch } = await import('../services/web-search')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'unauthorized'
      }))
    )
    await expect(
      runWebSearch('q', {
        provider: 'brave',
        enabled: true,
        apiKey: 'bad',
        maxResults: 3
      })
    ).rejects.toThrow(/Search failed/)
    vi.unstubAllGlobals()
  })
})

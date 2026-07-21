import { describe, expect, it } from 'vitest'
import {
  decideWebSearch,
  resolveComposerSearchMode,
  resolveWebSearchMode,
  shouldAutoSearch
} from './web-search-intent'

describe('shouldAutoSearch', () => {
  it('detects explicit lookup requests', () => {
    expect(shouldAutoSearch('search for React 19 release notes').shouldSearch).toBe(true)
    expect(shouldAutoSearch('look up the CEO of OpenAI').shouldSearch).toBe(true)
  })

  it('detects time-sensitive topics', () => {
    expect(shouldAutoSearch('What is the weather today in Manila?').shouldSearch).toBe(true)
    expect(shouldAutoSearch('latest news on AI regulation').shouldSearch).toBe(true)
    expect(shouldAutoSearch('current stock price of Apple').shouldSearch).toBe(true)
  })

  it('skips evergreen prompts', () => {
    const decision = shouldAutoSearch('Explain how a binary search tree works')
    expect(decision.shouldSearch).toBe(false)
    expect(decision.reason).toMatch(/does not appear/i)
  })

  it('handles empty query', () => {
    expect(shouldAutoSearch('   ').shouldSearch).toBe(false)
  })
})

describe('resolveWebSearchMode', () => {
  it('prefers explicit mode', () => {
    expect(resolveWebSearchMode('auto', true)).toBe('auto')
    expect(resolveWebSearchMode('on')).toBe('on')
  })

  it('falls back to legacy boolean', () => {
    expect(resolveWebSearchMode(undefined, true)).toBe('on')
    expect(resolveWebSearchMode(undefined, false)).toBe('off')
    expect(resolveWebSearchMode(undefined)).toBe('off')
  })
})

describe('decideWebSearch', () => {
  it('never runs when off', () => {
    const d = decideWebSearch('off', 'latest news today')
    expect(d.run).toBe(false)
    expect(d.skipped).toBe(true)
  })

  it('always runs when on', () => {
    const d = decideWebSearch('on', 'hello')
    expect(d.run).toBe(true)
    expect(d.skipped).toBe(false)
  })

  it('auto skips evergreen prompts and runs for current events', () => {
    expect(decideWebSearch('auto', 'Write a poem about cats').run).toBe(false)
    expect(decideWebSearch('auto', 'What happened in the news today?').run).toBe(true)
  })
})

describe('resolveComposerSearchMode', () => {
  it('maps friendly toggle to auto/off', () => {
    expect(resolveComposerSearchMode({ webSearchEnabled: true })).toBe('auto')
    expect(resolveComposerSearchMode({ webSearchEnabled: false })).toBe('off')
  })

  it('force search overrides toggle', () => {
    expect(
      resolveComposerSearchMode({ webSearchEnabled: true, forceWebSearch: true })
    ).toBe('on')
    expect(
      resolveComposerSearchMode({ webSearchEnabled: false, forceWebSearch: true })
    ).toBe('on')
  })

  it('falls back to legacy mode fields', () => {
    expect(resolveComposerSearchMode({ webSearchMode: 'auto' })).toBe('auto')
    expect(resolveComposerSearchMode({ legacyBoolean: true })).toBe('on')
  })
})

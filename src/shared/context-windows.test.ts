import { describe, it, expect } from 'vitest'
import { lookupCloudContextWindow, DEFAULT_LOCAL_CONTEXT_TARGET } from './context-windows'

describe('lookupCloudContextWindow', () => {
  it('resolves Anthropic models to 200k', () => {
    expect(lookupCloudContextWindow('claude-sonnet-4-5')).toBe(200000)
    expect(lookupCloudContextWindow('claude-3-5-haiku-20241022')).toBe(200000)
  })

  it('distinguishes gpt-4 variants rather than lumping them together', () => {
    expect(lookupCloudContextWindow('gpt-4')).toBe(8192)
    expect(lookupCloudContextWindow('gpt-4-32k')).toBe(32768)
    expect(lookupCloudContextWindow('gpt-4o')).toBe(128000)
    expect(lookupCloudContextWindow('gpt-4-turbo')).toBe(128000)
  })

  it('resolves newer OpenAI reasoning models', () => {
    expect(lookupCloudContextWindow('gpt-5')).toBe(400000)
    expect(lookupCloudContextWindow('o3')).toBe(200000)
    expect(lookupCloudContextWindow('o4-mini')).toBe(200000)
  })

  it('resolves Gemini long-context models', () => {
    expect(lookupCloudContextWindow('gemini-1.5-pro')).toBe(2097152)
    expect(lookupCloudContextWindow('gemini-2.5-pro')).toBe(1048576)
  })

  it('is case insensitive', () => {
    expect(lookupCloudContextWindow('GPT-4O')).toBe(128000)
  })

  it('returns undefined for unknown models so callers can fall back', () => {
    expect(lookupCloudContextWindow('some-local-model')).toBeUndefined()
    expect(lookupCloudContextWindow('')).toBeUndefined()
  })

  it('caps local targets at a usable default', () => {
    expect(DEFAULT_LOCAL_CONTEXT_TARGET).toBe(32768)
  })
})

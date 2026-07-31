import { describe, it, expect } from 'vitest'
import { lookupCloudVisionSupport, lookupCloudPdfSupport } from './vision-support'

describe('lookupCloudVisionSupport', () => {
  it('returns undefined for unrecognised names so callers can stay permissive', () => {
    expect(lookupCloudVisionSupport('some-future-model')).toBeUndefined()
    expect(lookupCloudVisionSupport('llama-3.1-70b')).toBeUndefined()
  })

  it('supports Claude models except 3.5 Haiku', () => {
    expect(lookupCloudVisionSupport('claude-sonnet-4-5')).toBe(true)
    expect(lookupCloudVisionSupport('claude-opus-4-1')).toBe(true)
    expect(lookupCloudVisionSupport('claude-3-5-haiku-20241022')).toBe(false)
  })

  it('distinguishes gpt-4o from plain gpt-4', () => {
    expect(lookupCloudVisionSupport('gpt-4o')).toBe(true)
    expect(lookupCloudVisionSupport('gpt-4o-mini')).toBe(true)
    expect(lookupCloudVisionSupport('gpt-4-turbo')).toBe(true)
    expect(lookupCloudVisionSupport('gpt-4')).toBe(false)
    expect(lookupCloudVisionSupport('gpt-4-32k')).toBe(false)
  })

  it('distinguishes o1-mini from o1', () => {
    expect(lookupCloudVisionSupport('o1-mini')).toBe(false)
    expect(lookupCloudVisionSupport('o1')).toBe(true)
    expect(lookupCloudVisionSupport('o3-mini')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(lookupCloudVisionSupport('GPT-4O')).toBe(true)
    expect(lookupCloudVisionSupport('Claude-Sonnet-4-5')).toBe(true)
  })

  it('supports all Gemini models', () => {
    expect(lookupCloudVisionSupport('gemini-2.5-pro')).toBe(true)
    expect(lookupCloudVisionSupport('gemini-1.5-flash')).toBe(true)
  })

  it('rejects gpt-3.5', () => {
    expect(lookupCloudVisionSupport('gpt-3.5-turbo')).toBe(false)
  })
})

describe('lookupCloudPdfSupport', () => {
  it('excludes the older Claude 3 tier', () => {
    expect(lookupCloudPdfSupport('claude-sonnet-4-5')).toBe(true)
    expect(lookupCloudPdfSupport('claude-3-opus-20240229')).toBe(false)
    expect(lookupCloudPdfSupport('claude-3-haiku-20240307')).toBe(false)
    expect(lookupCloudPdfSupport('claude-3-5-haiku-20241022')).toBe(false)
  })

  it('is narrower than vision support for OpenAI', () => {
    expect(lookupCloudPdfSupport('gpt-4o')).toBe(true)
    expect(lookupCloudPdfSupport('gpt-4-turbo')).toBe(false)
    expect(lookupCloudPdfSupport('o3')).toBe(false)
  })

  it('supports Gemini', () => {
    expect(lookupCloudPdfSupport('gemini-2.5-pro')).toBe(true)
  })
})

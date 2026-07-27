import { describe, it, expect } from 'vitest'
import { normalizeFinishReason, isTruncated } from './finish-reason'

describe('normalizeFinishReason', () => {
  it('maps every provider spelling of truncation to length', () => {
    expect(normalizeFinishReason('length')).toBe('length')
    expect(normalizeFinishReason('max_tokens')).toBe('length')
    expect(normalizeFinishReason('MAX_TOKENS')).toBe('length')
  })

  it('maps every provider spelling of a clean stop', () => {
    expect(normalizeFinishReason('stop')).toBe('stop')
    expect(normalizeFinishReason('end_turn')).toBe('stop')
    expect(normalizeFinishReason('STOP')).toBe('stop')
    expect(normalizeFinishReason('stop_sequence')).toBe('stop')
  })

  it('recognises filtered and tool-use stops', () => {
    expect(normalizeFinishReason('content_filter')).toBe('content_filter')
    expect(normalizeFinishReason('SAFETY')).toBe('content_filter')
    expect(normalizeFinishReason('tool_calls')).toBe('tool_use')
  })

  it('returns undefined when there is no reason at all', () => {
    expect(normalizeFinishReason(undefined)).toBeUndefined()
    expect(normalizeFinishReason(null)).toBeUndefined()
    expect(normalizeFinishReason('')).toBeUndefined()
  })

  it('falls back to other for unknown reasons', () => {
    expect(normalizeFinishReason('weird_new_reason')).toBe('other')
  })
})

describe('isTruncated', () => {
  it('is true only for length', () => {
    expect(isTruncated('length')).toBe(true)
    expect(isTruncated('max_tokens')).toBe(true)
    expect(isTruncated('stop')).toBe(false)
    expect(isTruncated(undefined)).toBe(false)
  })
})

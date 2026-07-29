import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONVERSATION_TITLE,
  MAX_TITLE_LENGTH,
  fallbackTitle,
  sanitizeGeneratedTitle
} from '../shared/conversation-title'

describe('fallbackTitle', () => {
  it('uses a short prompt verbatim', () => {
    expect(fallbackTitle('How do I use zustand?')).toBe('How do I use zustand?')
  })

  it('collapses whitespace and newlines', () => {
    expect(fallbackTitle('  fix   the\n\nbuild ')).toBe('fix the build')
  })

  it('truncates long prompts at a word boundary', () => {
    const title = fallbackTitle(
      'Explain how the token budget trimming works when the context window is small'
    )
    expect(title.endsWith('...')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH + 3)
    expect(title).toBe('Explain how the token budget trimming works...')
  })

  it('truncates mid-word when there is no usable space', () => {
    const title = fallbackTitle('a'.repeat(100))
    expect(title).toBe(`${'a'.repeat(MAX_TITLE_LENGTH)}...`)
  })

  it('falls back to the default for empty input', () => {
    expect(fallbackTitle('   ')).toBe(DEFAULT_CONVERSATION_TITLE)
  })
})

describe('sanitizeGeneratedTitle', () => {
  it('keeps a clean title as is', () => {
    expect(sanitizeGeneratedTitle('Zustand store setup')).toBe('Zustand store setup')
  })

  it('strips quotes, labels and trailing punctuation', () => {
    expect(sanitizeGeneratedTitle('Title: "Fixing the build."')).toBe('Fixing the build')
  })

  it('strips markdown heading, list and emphasis markers', () => {
    expect(sanitizeGeneratedTitle('## **Vitest setup**')).toBe('Vitest setup')
    expect(sanitizeGeneratedTitle('- Vitest setup')).toBe('Vitest setup')
  })

  it('drops a reasoning block and uses the real answer', () => {
    expect(sanitizeGeneratedTitle('<think>the user wants...</think>\nGPU offload tuning')).toBe(
      'GPU offload tuning'
    )
  })

  it('returns null for an unterminated reasoning block', () => {
    expect(sanitizeGeneratedTitle('<think>still thinking about it')).toBeNull()
  })

  it('returns null when the model answered instead of naming', () => {
    expect(sanitizeGeneratedTitle('Sure! '.repeat(60))).toBeNull()
  })

  it('returns null for empty or whitespace output', () => {
    expect(sanitizeGeneratedTitle('')).toBeNull()
    expect(sanitizeGeneratedTitle('  \n  ')).toBeNull()
  })

  it('ignores a fenced code block', () => {
    expect(sanitizeGeneratedTitle('```\ncode\n```\nSQLite migration')).toBe('SQLite migration')
  })

  it('truncates an over-long but plausible title', () => {
    const title = sanitizeGeneratedTitle('Debugging the streaming chunk listener in the chat store')
    expect(title).toBe('Debugging the streaming chunk listener in the...')
  })
})

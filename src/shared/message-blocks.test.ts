import { describe, it, expect } from 'vitest'
import type { LoadedAttachment } from './types'
import {
  contentToText,
  toAnthropicContent,
  toGoogleParts,
  toOpenAIContent
} from './message-blocks'

const image = (id = 'a1', mimeType = 'image/png'): LoadedAttachment => ({
  id,
  kind: 'image',
  mimeType,
  name: 'shot.png',
  base64: 'AAAA'
})

const doc = (): LoadedAttachment => ({
  id: 'd1',
  kind: 'document',
  mimeType: 'application/pdf',
  name: 'report.pdf',
  base64: 'BBBB'
})

describe('text-only requests are unchanged', () => {
  it('returns a bare string for Anthropic with no attachments and no cache', () => {
    expect(toAnthropicContent('hello', [], false)).toBe('hello')
  })

  it('returns the original single cache block shape at the breakpoint', () => {
    expect(toAnthropicContent('hello', [], true)).toEqual([
      { type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }
    ])
  })

  it('returns a bare string for OpenAI with no attachments', () => {
    expect(toOpenAIContent('hello', [])).toBe('hello')
  })

  it('returns the original single-part array for Google with no attachments', () => {
    expect(toGoogleParts('hello', [])).toEqual([{ text: 'hello' }])
  })
})

describe('toAnthropicContent', () => {
  it('puts images before the text block', () => {
    expect(toAnthropicContent('describe', [image()], false)).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'describe' }
    ])
  })

  it('keeps cache_control on the final text block', () => {
    const blocks = toAnthropicContent('describe', [image()], true) as Record<string, unknown>[]
    expect(blocks[blocks.length - 1]).toEqual({
      type: 'text',
      text: 'describe',
      cache_control: { type: 'ephemeral' }
    })
    expect(blocks[0]).not.toHaveProperty('cache_control')
  })

  it('uses a document block for non-images', () => {
    expect(toAnthropicContent('read', [doc()], false)).toEqual([
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'BBBB' }
      },
      { type: 'text', text: 'read' }
    ])
  })

  it('preserves attachment order', () => {
    const blocks = toAnthropicContent(
      't',
      [image('first'), image('second')],
      false
    ) as Record<string, unknown>[]
    expect(blocks).toHaveLength(3)
    expect((blocks[0].source as any).data).toBe('AAAA')
  })
})

describe('toOpenAIContent', () => {
  it('leads with text and uses a data: URL for images', () => {
    expect(toOpenAIContent('describe', [image()])).toEqual([
      { type: 'text', text: 'describe' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA', detail: 'auto' } }
    ])
  })

  it('uses a file block with a data: URL for documents', () => {
    expect(toOpenAIContent('read', [doc()])).toEqual([
      { type: 'text', text: 'read' },
      {
        type: 'file',
        file: { filename: 'report.pdf', file_data: 'data:application/pdf;base64,BBBB' }
      }
    ])
  })

  it('carries the source mime through the data URL', () => {
    const blocks = toOpenAIContent('t', [image('a', 'image/webp')]) as Record<string, unknown>[]
    expect((blocks[1].image_url as any).url).toBe('data:image/webp;base64,AAAA')
  })
})

describe('toGoogleParts', () => {
  it('uses inlineData with raw base64 and no data: prefix', () => {
    const parts = toGoogleParts('describe', [image()])
    expect(parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
      { text: 'describe' }
    ])
    expect(JSON.stringify(parts)).not.toContain('data:')
  })

  it('puts media before text', () => {
    const parts = toGoogleParts('t', [image(), doc()])
    expect(parts).toHaveLength(3)
    expect(parts[2]).toEqual({ text: 't' })
  })
})

describe('contentToText', () => {
  it('passes strings through', () => {
    expect(contentToText('hello')).toBe('hello')
  })

  it('extracts only text blocks, ignoring binary payloads', () => {
    const content = toOpenAIContent('describe this', [image()])
    expect(contentToText(content)).toBe('describe this')
  })

  it('never leaks [object Object] from a block array', () => {
    expect(contentToText(toAnthropicContent('x', [image()], true))).not.toContain('[object')
  })
})

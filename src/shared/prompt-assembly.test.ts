import { describe, expect, it } from 'vitest'
import type { ContextItem } from './types'
import {
  buildContextBlock,
  buildSystemPrompt,
  cacheBreakpointIndex,
  foldSystemMessages,
  orderContextItems,
  orderPromptMessages,
  selectContextItems
} from './prompt-assembly'

function item(id: string, createdAt: number, overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id,
    conversationId: 'c1',
    type: 'text',
    name: id,
    content: `body of ${id}`,
    createdAt,
    enabled: true,
    ...overrides
  } as ContextItem
}

describe('orderContextItems', () => {
  it('orders by creation time', () => {
    const ordered = orderContextItems([item('b', 20), item('a', 10)])
    expect(ordered.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('breaks ties by id so a batch import keeps one stable order', () => {
    const forward = orderContextItems([item('a', 5), item('b', 5), item('c', 5)])
    const reversed = orderContextItems([item('c', 5), item('b', 5), item('a', 5)])
    expect(forward.map((i) => i.id)).toEqual(reversed.map((i) => i.id))
  })
})

describe('selectContextItems', () => {
  it('drops disabled items', () => {
    const items = [item('a', 1), item('b', 2, { enabled: false })]
    expect(selectContextItems(items).map((i) => i.id)).toEqual(['a'])
  })

  it('honours an explicit selection', () => {
    const items = [item('a', 1), item('b', 2)]
    expect(selectContextItems(items, ['b']).map((i) => i.id)).toEqual(['b'])
  })

  it('treats an empty selection as "all enabled"', () => {
    const items = [item('a', 1), item('b', 2)]
    expect(selectContextItems(items, []).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('produces the same block regardless of row order', () => {
    const items = [item('a', 5), item('b', 5)]
    expect(buildContextBlock(selectContextItems(items))).toBe(
      buildContextBlock(selectContextItems([...items].reverse()))
    )
  })
})

describe('buildSystemPrompt', () => {
  it('keeps the stable parts in a fixed order', () => {
    expect(
      buildSystemPrompt({ basePrompt: 'base', modeSuffix: 'mode', contextBlock: 'ctx' })
    ).toBe('base\n\nmode\n\nctx')
  })

  it('skips empty parts', () => {
    expect(buildSystemPrompt({ basePrompt: 'base', modeSuffix: '', contextBlock: 'ctx' })).toBe(
      'base\n\nctx'
    )
  })
})

describe('orderPromptMessages', () => {
  it('appends volatile turns after the history', () => {
    const history = [{ id: 'a' }, { id: 'b' }]
    expect(orderPromptMessages({ history, volatile: [{ id: 'search' }] })).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'search' }
    ])
  })

  it('returns the history untouched when there is nothing volatile', () => {
    const history = [{ id: 'a' }]
    expect(orderPromptMessages({ history })).toBe(history)
  })
})

describe('foldSystemMessages', () => {
  it('folds a trailing system turn into the last user turn', () => {
    const folded = foldSystemMessages([
      { role: 'user', content: 'question' },
      { role: 'system', content: 'search results' }
    ])
    expect(folded).toEqual([{ role: 'user', content: 'question\n\nsearch results' }])
  })

  it('folds a leading system turn into the next user turn', () => {
    const folded = foldSystemMessages([
      { role: 'system', content: 'note' },
      { role: 'user', content: 'question' }
    ])
    expect(folded).toEqual([{ role: 'user', content: 'note\n\nquestion' }])
  })

  it('promotes a trailing system turn after an assistant turn', () => {
    const folded = foldSystemMessages([
      { role: 'assistant', content: 'answer' },
      { role: 'system', content: 'search results' }
    ])
    expect(folded).toEqual([
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'search results' }
    ])
  })

  it('ignores empty system turns', () => {
    expect(foldSystemMessages([{ role: 'system', content: '  ' }, { role: 'user', content: 'q' }])).toEqual([
      { role: 'user', content: 'q' }
    ])
  })
})

describe('cacheBreakpointIndex', () => {
  it('points at the last assistant turn, before the new user turn', () => {
    expect(
      cacheBreakpointIndex([
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' }
      ])
    ).toBe(1)
  })

  it('returns -1 for a first turn with nothing stable yet', () => {
    expect(cacheBreakpointIndex([{ role: 'user', content: 'q1' }])).toBe(-1)
  })
})

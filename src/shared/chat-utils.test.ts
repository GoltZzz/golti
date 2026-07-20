import { describe, expect, it } from 'vitest'
import {
  computeTokenBudget,
  estimateTokens,
  extractArtifacts,
  formatConversationMarkdown,
  getBranchPath,
  getChildren,
  getSiblings
} from '../shared/chat-utils'
import type { Message } from '../shared/types'

describe('estimateTokens', () => {
  it('estimates roughly by character length', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(40))).toBe(10)
  })
})

describe('branch traversal', () => {
  const messages: Message[] = [
    { id: 'u1', conversationId: 'c', role: 'user', content: 'hi', createdAt: 1, parentId: null },
    { id: 'a1', conversationId: 'c', role: 'assistant', content: 'hello', createdAt: 2, parentId: 'u1', variantGroupId: 'g1', variantIndex: 0 },
    { id: 'a2', conversationId: 'c', role: 'assistant', content: 'hola', createdAt: 3, parentId: 'u1', variantGroupId: 'g1', variantIndex: 1 },
    { id: 'u2', conversationId: 'c', role: 'user', content: 'more', createdAt: 4, parentId: 'a2' },
    { id: 'a3', conversationId: 'c', role: 'assistant', content: 'ok', createdAt: 5, parentId: 'u2' }
  ]

  it('walks leaf to root', () => {
    const path = getBranchPath(messages, 'a3')
    expect(path.map((m) => m.id)).toEqual(['u1', 'a2', 'u2', 'a3'])
  })

  it('lists siblings', () => {
    const sibs = getSiblings(messages, 'a1')
    expect(sibs.map((m) => m.id)).toEqual(['a1', 'a2'])
  })

  it('lists children', () => {
    expect(getChildren(messages, 'u1').map((m) => m.id)).toEqual(['a1', 'a2'])
  })
})

describe('extractArtifacts', () => {
  it('extracts multi-line code fences', () => {
    const content = 'Here:\n```ts\nconst a = 1\nconst b = 2\nconst c = 3\n```\n'
    const arts = extractArtifacts(content)
    expect(arts.length).toBe(1)
    expect(arts[0].language).toBe('ts')
    expect(arts[0].type).toBe('code')
  })

  it('extracts explicit artifact markdown', () => {
    const content = '```artifact:markdown\n# Title\nBody\n```'
    const arts = extractArtifacts(content, 1)
    expect(arts[0].type).toBe('markdown')
  })
})

describe('computeTokenBudget', () => {
  it('flags overflow', () => {
    const budget = computeTokenBudget({
      contextWindow: 100,
      reservedOutputTokens: 50,
      systemPrompt: 'x'.repeat(400),
      contextItems: [],
      history: [],
      draft: ''
    })
    expect(budget.overflow).toBe(true)
  })

  it('sums categories', () => {
    const budget = computeTokenBudget({
      contextWindow: 8000,
      reservedOutputTokens: 1000,
      systemPrompt: 'hello',
      contextItems: [
        {
          id: '1',
          conversationId: 'c',
          type: 'text',
          name: 'note',
          content: 'abcd',
          tokenEstimate: 10,
          createdAt: 1,
          enabled: true
        }
      ],
      history: [{ id: 'm', conversationId: 'c', role: 'user', content: 'abcd', createdAt: 1 }],
      draft: 'abcd'
    })
    expect(budget.items.some((i) => i.category === 'context')).toBe(true)
    expect(budget.usedTokens).toBeGreaterThan(0)
  })
})

describe('formatConversationMarkdown', () => {
  it('renders title and roles', () => {
    const md = formatConversationMarkdown('Test', [
      { id: '1', conversationId: 'c', role: 'user', content: 'Q', createdAt: 1 },
      { id: '2', conversationId: 'c', role: 'assistant', content: 'A', createdAt: 2 }
    ])
    expect(md).toContain('# Test')
    expect(md).toContain('## User')
    expect(md).toContain('## Assistant')
  })
})

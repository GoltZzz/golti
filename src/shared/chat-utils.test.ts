import { describe, expect, it } from 'vitest'
import {
  computeTokenBudget,
  estimateTokens,
  extractArtifacts,
  extractShells,
  extractThinkingTags,
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

  it('isolates budgets for two conversations with different history and context', () => {
    const emptyish = computeTokenBudget({
      contextWindow: 8000,
      reservedOutputTokens: 1000,
      systemPrompt: 'You are helpful.',
      contextItems: [],
      history: [],
      draft: ''
    })

    const heavy = computeTokenBudget({
      contextWindow: 8000,
      reservedOutputTokens: 1000,
      systemPrompt: 'You are helpful.',
      contextItems: [
        {
          id: 'ctx-a',
          conversationId: 'c2',
          type: 'text',
          name: 'big note',
          content: 'x'.repeat(400),
          tokenEstimate: 100,
          createdAt: 1,
          enabled: true
        }
      ],
      history: [
        {
          id: 'm1',
          conversationId: 'c2',
          role: 'user',
          content: 'y'.repeat(200),
          createdAt: 1
        },
        {
          id: 'm2',
          conversationId: 'c2',
          role: 'assistant',
          content: 'z'.repeat(200),
          createdAt: 2
        }
      ],
      draft: 'draft text'
    })

    expect(heavy.usedTokens).toBeGreaterThan(emptyish.usedTokens)
    expect(emptyish.items.some((i) => i.category === 'history')).toBe(false)
    expect(heavy.items.some((i) => i.category === 'history')).toBe(true)
    expect(heavy.items.some((i) => i.category === 'context')).toBe(true)
  })

  it('uses only the active branch for history tokens', () => {
    const messages: Message[] = [
      { id: 'u1', conversationId: 'c', role: 'user', content: 'a'.repeat(40), createdAt: 1, parentId: null },
      {
        id: 'a1',
        conversationId: 'c',
        role: 'assistant',
        content: 'b'.repeat(40),
        createdAt: 2,
        parentId: 'u1'
      },
      {
        id: 'a2',
        conversationId: 'c',
        role: 'assistant',
        content: 'c'.repeat(400),
        createdAt: 3,
        parentId: 'u1'
      }
    ]
    const branchA1 = getBranchPath(messages, 'a1')
    const branchA2 = getBranchPath(messages, 'a2')
    const budgetA1 = computeTokenBudget({
      contextWindow: 8000,
      reservedOutputTokens: 100,
      history: branchA1,
      contextItems: []
    })
    const budgetA2 = computeTokenBudget({
      contextWindow: 8000,
      reservedOutputTokens: 100,
      history: branchA2,
      contextItems: []
    })
    expect(budgetA2.usedTokens).toBeGreaterThan(budgetA1.usedTokens)
  })
})

describe('extractThinkingTags', () => {
  it('extracts reasoning text inside think tags', () => {
    const raw = '<think>\nFirst step: analyze user input.\nSecond step: formulate answer.\n</think>\nHere is the answer.'
    const { reasoningText, cleanContent } = extractThinkingTags(raw)
    expect(reasoningText).toContain('First step: analyze user input.')
    expect(cleanContent).toBe('Here is the answer.')
  })

  it('handles unclosed think tag during streaming', () => {
    const raw = '<think>\nThinking in progress...'
    const { reasoningText, cleanContent } = extractThinkingTags(raw)
    expect(reasoningText).toBe('Thinking in progress...')
    expect(cleanContent).toBe('')
  })
})

describe('extractShells', () => {
  it('extracts shell code block', () => {
    const content = '```shell:python\nprint("hello")\nprint("world")\n```'
    const shells = extractShells(content)
    expect(shells.length).toBe(1)
    expect(shells[0].language).toBe('python')
    expect(shells[0].content).toContain('print("hello")')
  })
})

describe('formatConversationMarkdown', () => {
  it('renders title and roles', () => {
    const md = formatConversationMarkdown('Test', [
      { id: '1', conversationId: 'c', role: 'user', content: 'Q', createdAt: 1 },
      { id: '2', conversationId: 'c', role: 'assistant', content: 'A', reasoningContent: 'Reasoning here', createdAt: 2 }
    ])
    expect(md).toContain('# Test')
    expect(md).toContain('## User')
    expect(md).toContain('## Assistant')
    expect(md).toContain('<summary>Thought Process</summary>')
    expect(md).toContain('Reasoning here')
  })
})

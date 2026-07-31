import { describe, expect, it } from 'vitest'
import {
  attachmentTokens,
  computeTokenBudget,
  createThinkStreamParser,
  estimateTokens,
  extractArtifacts,
  extractAskUser,
  extractShells,
  extractThinkingTags,
  formatConversationMarkdown,
  getBranchPath,
  getChildren,
  getSiblings,
  parseEngineMemoryError,
  trimHistoryToBudget
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

describe('trimHistoryToBudget', () => {
  const turn = (id: string, role: 'user' | 'assistant') => ({
    id,
    role,
    content: 'a'.repeat(40)
  })

  const conversation = [
    turn('u1', 'user'),
    turn('a1', 'assistant'),
    turn('u2', 'user'),
    turn('a2', 'assistant'),
    turn('u3', 'user')
  ]

  it('keeps the whole history when it fits', () => {
    const result = trimHistoryToBudget(conversation, 1000)
    expect(result.kept).toHaveLength(5)
    expect(result.droppedCount).toBe(0)
    expect(result.droppedTokens).toBe(0)
  })

  it('drops the oldest turns when over budget', () => {
    const result = trimHistoryToBudget(conversation, 35)
    expect(result.kept.map((m) => m.id)).toEqual(['u2', 'a2', 'u3'])
    expect(result.droppedCount).toBe(2)
    expect(result.droppedTokens).toBe(20)
  })

  it('never starts the kept history with an assistant turn', () => {
    const result = trimHistoryToBudget(conversation, 20)
    expect(result.kept[0].role).toBe('user')
    expect(result.kept.map((m) => m.id)).toEqual(['u3'])
  })

  it('always keeps the latest message even if it alone exceeds the budget', () => {
    const result = trimHistoryToBudget([turn('u1', 'user'), turn('u2', 'user')], 0)
    expect(result.kept.map((m) => m.id)).toEqual(['u2'])
    expect(result.droppedCount).toBe(1)
  })

  it('handles empty history', () => {
    expect(trimHistoryToBudget([], 100)).toEqual({
      kept: [],
      droppedCount: 0,
      droppedTokens: 0
    })
  })

  it('charges attachment tokens against the budget', () => {
    const withImage = [
      turn('u1', 'user'),
      { ...turn('u2', 'user'), attachments: [{ tokenEstimate: 500 }] }
    ]

    // Text alone (10 + 10) fits in 100; the image pushes the newest turn over.
    expect(trimHistoryToBudget(withImage, 100).kept.map((m) => m.id)).toEqual(['u2'])
    expect(trimHistoryToBudget(withImage, 1000).kept).toHaveLength(2)
  })

  it('flags overflow when the newest attachment-bearing turn cannot fit', () => {
    const result = trimHistoryToBudget(
      [{ ...turn('u1', 'user'), attachments: [{ tokenEstimate: 5000 }] }],
      100
    )
    expect(result.kept.map((m) => m.id)).toEqual(['u1'])
    expect(result.overflow).toBe(true)
  })

  it('does not flag overflow when everything fits', () => {
    expect(trimHistoryToBudget(conversation, 1000).overflow).toBe(false)
  })

  it('treats a missing attachments field as zero cost', () => {
    expect(trimHistoryToBudget(conversation, 35).kept.map((m) => m.id)).toEqual([
      'u2',
      'a2',
      'u3'
    ])
  })
})

describe('attachmentTokens', () => {
  it('sums attachment estimates', () => {
    expect(attachmentTokens({ attachments: [{ tokenEstimate: 10 }, { tokenEstimate: 5 }] })).toBe(15)
  })

  it('returns zero for no attachments', () => {
    expect(attachmentTokens({})).toBe(0)
    expect(attachmentTokens({ attachments: [] })).toBe(0)
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

  it('reports trimmed messages instead of overflowing on a long history', () => {
    const history: Message[] = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      conversationId: 'c',
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: 'a'.repeat(400),
      createdAt: i
    }))

    const budget = computeTokenBudget({
      contextWindow: 1000,
      reservedOutputTokens: 200,
      systemPrompt: 'You are helpful.',
      contextItems: [],
      history,
      draft: ''
    })

    expect(budget.trimmedMessages).toBeGreaterThan(0)
    expect(budget.overflow).toBe(false)
    expect(budget.usedTokens).toBeLessThanOrEqual(budget.contextWindow)
  })

  it('still overflows when the latest message alone cannot fit', () => {
    const budget = computeTokenBudget({
      contextWindow: 200,
      reservedOutputTokens: 50,
      systemPrompt: '',
      contextItems: [],
      history: [
        { id: 'm', conversationId: 'c', role: 'user', content: 'a'.repeat(4000), createdAt: 1 }
      ],
      draft: ''
    })

    expect(budget.overflow).toBe(true)
    expect(budget.trimmedMessages).toBe(0)
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

  it('handles content preceding and following think tags', () => {
    const raw = 'Intro text <think>My internal thought</think> Main answer text'
    const { reasoningText, cleanContent } = extractThinkingTags(raw)
    expect(reasoningText).toBe('My internal thought')
    expect(cleanContent).toBe('Intro text  Main answer text')
  })
})

describe('createThinkStreamParser', () => {
  it('parses complete <think> tags in a single chunk', () => {
    const parser = createThinkStreamParser()
    const result = parser('<think>Step 1</think>Result')
    expect(result).toEqual({ thinkingDelta: 'Step 1', contentDelta: 'Result' })
  })

  it('handles streaming chunks split across think boundaries', () => {
    const parser = createThinkStreamParser()
    const r1 = parser('Hello <thi')
    expect(r1).toEqual({ thinkingDelta: '', contentDelta: 'Hello ' })

    const r2 = parser('nk>Step 1: thinking...')
    expect(r2).toEqual({ thinkingDelta: 'Step 1: thinking...', contentDelta: '' })

    const r3 = parser('</thi')
    expect(r3).toEqual({ thinkingDelta: '', contentDelta: '' })

    const r4 = parser('nk> Here is the answer.')
    expect(r4).toEqual({ thinkingDelta: '', contentDelta: ' Here is the answer.' })
  })

  it('handles plain content with no think tags', () => {
    const parser = createThinkStreamParser()
    const r1 = parser('Just plain text ')
    expect(r1).toEqual({ thinkingDelta: '', contentDelta: 'Just plain text ' })
    const r2 = parser('continued.')
    expect(r2).toEqual({ thinkingDelta: '', contentDelta: 'continued.' })
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

describe('extractAskUser', () => {
  const wrap = (body: string) => '```ask-user\n' + body + '\n```'

  it('parses the canonical label/description shape', () => {
    const prompt = extractAskUser(
      wrap('{ "question": "Where?", "options": [{"label":"Node","description":"server"}] }')
    )
    expect(prompt?.question).toBe('Where?')
    expect(prompt?.options).toEqual([{ label: 'Node', description: 'server' }])
  })

  it('accepts weak-model option key aliases instead of dropping them', () => {
    const prompt = extractAskUser(
      wrap(
        '{ "question": "Where?", "options": [{"text":"Node","desc":"server"},{"value":"Browser"},{"title":"Both","subtitle":"shared"}] }'
      )
    )
    expect(prompt?.options).toEqual([
      { label: 'Node', description: 'server' },
      { label: 'Browser' },
      { label: 'Both', description: 'shared' }
    ])
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

describe('parseEngineMemoryError', () => {
  it('detects llama-server health check timeouts and out of memory errors', () => {
    const errorStr = '[Error: llama-server failed to start or health check timed out.]'
    const result = parseEngineMemoryError(errorStr, 'Hermes-3-Llama-3.1-8B-Q4_K_M.gguf')

    expect(result).not.toBeNull()
    expect(result?.isMemoryError).toBe(true)
    expect(result?.modelName).toContain('Hermes 3 8B')
    expect(result?.ramRequiredGB).toBe(5.5)
  })

  it('returns null for generic non-memory error strings', () => {
    const errorStr = 'Network error 500: Internal Server Error'
    const result = parseEngineMemoryError(errorStr, 'llama3.2:1b-q4')
    expect(result).toBeNull()
  })
})


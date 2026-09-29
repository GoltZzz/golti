import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, StreamChunkPayload } from '../../shared/types'

// A model that asks for a web search on every pass, and an in-memory message table.
const h = vi.hoisted(() => ({
  prompts: [] as Array<{ schema: boolean; history: Array<{ role: string; content: string }> }>,
  messages: new Map<string, any>(),
  runWebSearch: vi.fn()
}))

vi.mock('../db/database', () => ({
  dbSettings: {
    get: () => ({ systemPrompt: 'You are Golti.', memoryEnabled: false, reservedOutputTokens: 1024 })
  },
  dbConversations: { get: () => ({ id: 'c1', activeLeafId: null }), update: () => undefined },
  dbMessages: {
    listForConversation: () => [...h.messages.values()],
    get: (id: string) => h.messages.get(id),
    create: (m: Message) => h.messages.set(m.id, { ...m }),
    update: (id: string, u: Partial<Message>) => h.messages.set(id, { ...h.messages.get(id), ...u }),
    createVersion: () => undefined
  },
  dbContext: { list: () => [] },
  dbAttachments: { bindToMessage: () => undefined },
  dbArtifacts: { create: () => undefined },
  dbCitations: { create: () => undefined },
  dbSkills: { upsert: () => undefined }
}))

vi.mock('./provider-manager', () => ({
  streamChatResponse: async function* (
    _p: string,
    _m: string,
    history: Message[],
    _system?: string,
    options?: { responseSchema?: unknown }
  ) {
    h.prompts.push({
      schema: !!options?.responseSchema,
      history: history.map((m) => ({ role: m.role, content: m.content }))
    })
    // Yield to timers so a runaway loop can't starve the test's own timeout.
    await new Promise((r) => setTimeout(r, 0))
    if (h.prompts.length > 20) throw new Error('model called too many times')
    yield { type: 'text', text: '```search\n{ "query": "latest release" }\n```' }
    yield { type: 'done', finishReason: 'stop' }
  }
}))

vi.mock('./context-window', () => ({ resolveContextWindow: async () => 8192 }))
vi.mock('./memory-recall', () => ({ buildMemoryRecallBlock: async () => '' }))
vi.mock('./memory-extractor', () => ({ extractAndStoreMemories: async () => [] }))
vi.mock('./attachment-loader', () => ({ loadAttachments: () => ({ byMessage: new Map() }) }))
vi.mock('./model-capabilities', () => ({ resolveModelCapabilities: async () => ({ image: false, pdf: false }) }))
vi.mock('../services/web-search', () => ({
  ensureLocalSearchReady: async () => undefined,
  runWebSearch: h.runWebSearch
}))
vi.mock('./deep-research', () => ({ startDeepResearch: () => undefined }))

import { startChatGeneration } from './chat-runtime'

function fakeWindow(chunks: StreamChunkPayload[]) {
  return {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (_channel: string, chunk: StreamChunkPayload) => chunks.push(chunk) }
  } as any
}

async function until<T>(read: () => T | undefined, what: string): Promise<T> {
  for (let i = 0; i < 1000; i++) {
    const value = read()
    if (value) return value
    await new Promise((r) => setTimeout(r, 2))
  }
  throw new Error(`timed out waiting for ${what}`)
}

beforeEach(() => {
  h.prompts = []
  h.messages.clear()
  h.runWebSearch.mockReset()
  h.runWebSearch.mockResolvedValue([{ title: 'Release notes', url: 'https://example.com', snippet: 'v2 is out' }])
})

describe('mid-turn web search', () => {
  it('ends the turn when the model keeps searching after the limit note', async () => {
    const chunks: StreamChunkPayload[] = []
    await startChatGeneration(fakeWindow(chunks), {
      conversationId: 'c1',
      content: 'Help me plan my week',
      model: 'test-model',
      providerId: 'test',
      webSearchEnabled: true,
      askUserEnabled: true
    })
    const done = await until(() => chunks.find((c) => c.done), 'the reply to finish')

    expect(done.error).toBeUndefined()
    expect(h.runWebSearch).toHaveBeenCalledTimes(3)

    // Three searches, one pass told to stop, one more pass that still searched.
    const searchPasses = h.prompts.filter((p) => !p.schema)
    expect(searchPasses).toHaveLength(5)
    expect(searchPasses[4].history.at(-1)!.content).toContain('The search limit for this turn is reached')
  })
})

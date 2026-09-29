import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequestOptions, Message, ProviderStreamEvent } from '../../shared/types'

// Each call to the model plays the next scripted list of stream events.
const h = vi.hoisted(() => ({
  scripts: [] as ProviderStreamEvent[][],
  calls: [] as Array<{ messages: Message[]; options?: ChatRequestOptions }>,
  providerType: 'golti-engine'
}))

vi.mock('./provider-manager', () => ({
  streamChatResponse: async function* (
    _providerId: string,
    _model: string,
    messages: Message[],
    _system?: string,
    options?: ChatRequestOptions
  ) {
    h.calls.push({ messages, options })
    for (const event of h.scripts.shift() ?? []) {
      if (options?.signal?.aborted) return
      yield event
    }
  }
}))

vi.mock('../db/database', () => ({
  dbProviders: { list: () => [{ id: 'p1', type: h.providerType }] }
}))

import { generateConversationTitle } from './title-generator'

const PREFILL = '<think>\nA short title (at most 6 words) for this conversation is: "'
const request = { providerId: 'p1', model: 'qwen3-4b', prompt: 'write me a poem about the sea' }

const text = (t: string): ProviderStreamEvent => ({ type: 'text', text: t })
const thinking = (t: string): ProviderStreamEvent => ({ type: 'thinking', text: t })
const done: ProviderStreamEvent = { type: 'done', finishReason: 'stop' }

beforeEach(() => {
  h.scripts = []
  h.calls = []
  h.providerType = 'golti-engine'
})

describe('generateConversationTitle', () => {
  it('uses a plain answer in one pass, asking the engine to skip thinking', async () => {
    h.scripts = [[text('"Sea '), text('Poem."'), done]]

    expect(await generateConversationTitle(request)).toBe('Sea Poem')
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].options?.disableThinking).toBe(true)
    expect(h.calls[0].messages.map((m) => m.role)).toEqual(['user'])
  })

  it('cuts a reasoning pass short and steers the thinking into the title', async () => {
    h.scripts = [
      [thinking('We are given'), thinking(' the first message...'), text('never read')],
      [text(`${PREFILL}Sea`), text(' Poem Request'), done]
    ]

    expect(await generateConversationTitle(request)).toBe('Sea Poem Request')

    expect(h.calls[0].options?.signal?.aborted).toBe(true)
    const steered = h.calls[1]
    expect(steered.messages.at(-1)).toMatchObject({ role: 'assistant', content: PREFILL })
    expect(steered.options?.generationSettings?.stopSequences).toEqual(['"', '\n'])
    expect(steered.options?.disableThinking).toBe(false)
  })

  it('also spots reasoning written inline, and a continuation sent as thinking or without the echo', async () => {
    h.scripts = [
      [text('<th'), text('ink>\nOkay, the user')],
      [thinking('Sea Poem'), done]
    ]
    expect(await generateConversationTitle(request)).toBe('Sea Poem')
    expect(h.calls).toHaveLength(2)
  })

  it('gives up on reasoning models that are not on the local engine', async () => {
    h.providerType = 'openai'
    h.scripts = [[thinking('Let me think'), text('x')]]

    expect(await generateConversationTitle(request)).toBeNull()
    expect(h.calls).toHaveLength(1)
  })

  it('returns null on a provider error', async () => {
    h.scripts = [[{ type: 'error', error: 'engine down' }]]
    expect(await generateConversationTitle(request)).toBeNull()
  })
})

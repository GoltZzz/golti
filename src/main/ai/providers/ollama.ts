import type { AIProviderConfig, Message, ProviderStreamEvent } from '../../../shared/types'
import { extractThinkingTags } from '../../../shared/chat-utils'
import {
  applyGenerationDefaults,
  doneEvent,
  readLineStream,
  textEvent,
  thinkingEvent,
  usageEvent,
  type ProviderChatRequest
} from '../provider-types'

export async function fetchOllamaModels(endpoint: string = 'http://localhost:11434'): Promise<string[]> {
  try {
    const cleanEndpoint = endpoint.replace(/\/+$/, '')
    const response = await fetch(`${cleanEndpoint}/api/tags`)
    if (!response.ok) return []
    const data = await response.json()
    if (Array.isArray(data.models)) {
      return data.models.map((m: any) => m.name || m.model)
    }
    return []
  } catch (err: any) {
    if (err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Ollama. Make sure the Ollama server is running.')
    }
    console.warn('[Ollama] Failed to fetch models:', err.message || String(err))
    throw err
  }
}

export async function* streamOllamaChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string,
  options?: ProviderChatRequest['options']
): AsyncGenerator<ProviderStreamEvent, void, unknown> {
  const endpoint = (provider.endpoint || 'http://localhost:11434').replace(/\/+$/, '')
  const gen = applyGenerationDefaults(options?.generationSettings)

  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content
  }))

  if (systemPrompt) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt })
  }

  let response: Response
  try {
    response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: true,
        options: {
          temperature: gen.temperature,
          top_p: gen.topP,
          num_predict: gen.maxTokens,
          stop: gen.stopSequences,
          // Omit entirely on Auto: sending null/-1 would override Ollama's own
          // sizing rather than defer to it.
          ...(options?.ollama?.numGpu !== undefined ? { num_gpu: options.ollama.numGpu } : {})
        }
      }),
      signal: options?.signal
    })
  } catch (err: any) {
    if (err.name === 'AbortError') return
    if (err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Ollama. Make sure the Ollama server is running.')
    }
    throw err
  }

  if (!response.ok || !response.body) {
    throw new Error(`Ollama error (${response.status}): ${await response.text()}`)
  }

  let promptTokens = 0
  let completionTokens = 0

  for await (const line of readLineStream(response, options?.signal)) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line)
      const thinkingText = parsed.message?.thinking || parsed.message?.reasoning || parsed.message?.reasoning_content
      if (thinkingText) {
        yield thinkingEvent(thinkingText)
        if (parsed.message?.content) {
          const { cleanContent } = extractThinkingTags(parsed.message.content)
          if (cleanContent) yield textEvent(cleanContent)
        }
      } else if (parsed.message?.content) {
        yield textEvent(parsed.message.content)
      }
      if (parsed.done) {
        promptTokens = parsed.prompt_eval_count ?? promptTokens
        completionTokens = parsed.eval_count ?? completionTokens
        if (promptTokens || completionTokens) {
          yield usageEvent({
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimated: false
          })
        }
        yield doneEvent(parsed.done_reason || 'stop')
      }
    } catch {
      // partial line
    }
  }
}

import type { AIProviderConfig, Message, ProviderStreamEvent } from '../../../shared/types'
import {
  applyGenerationDefaults,
  doneEvent,
  readLineStream,
  textEvent,
  thinkingEvent,
  usageEvent,
  type ProviderChatRequest
} from '../provider-types'

export async function fetchOpenAIModels(provider: AIProviderConfig): Promise<string[]> {
  if (!provider.apiKey) return ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  try {
    const endpoint = (provider.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const res = await fetch(`${endpoint}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` }
    })
    if (!res.ok) return ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
    const data = await res.json()
    if (Array.isArray(data.data)) {
      return data.data
        .map((m: any) => m.id)
        .filter((id: string) => id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
        .sort()
    }
    return ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  } catch {
    return ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  }
}

export async function* streamOpenAIChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string,
  options?: ProviderChatRequest['options']
): AsyncGenerator<ProviderStreamEvent, void, unknown> {
  const endpoint = (provider.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const gen = applyGenerationDefaults(options?.generationSettings)

  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content
  }))

  if (systemPrompt) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt })
  }

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey || ''}`
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: gen.temperature,
      top_p: gen.topP,
      max_tokens: gen.maxTokens,
      stop: gen.stopSequences
    }),
    signal: options?.signal
  })

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI error (${response.status}): ${await response.text()}`)
  }

  for await (const line of readLineStream(response, options?.signal)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === 'data: [DONE]') {
      if (trimmed === 'data: [DONE]') yield doneEvent('stop')
      continue
    }
    if (!trimmed.startsWith('data: ')) continue
    try {
      const parsed = JSON.parse(trimmed.slice(6))
      const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning
      if (reasoningDelta) yield thinkingEvent(reasoningDelta)
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) yield textEvent(delta)
      if (parsed.usage) {
        yield usageEvent({
          promptTokens: parsed.usage.prompt_tokens ?? 0,
          completionTokens: parsed.usage.completion_tokens ?? 0,
          totalTokens: parsed.usage.total_tokens ?? 0,
          estimated: false
        })
      }
      if (parsed.choices?.[0]?.finish_reason) {
        yield doneEvent(parsed.choices[0].finish_reason)
      }
    } catch {
      // ignore
    }
  }
}

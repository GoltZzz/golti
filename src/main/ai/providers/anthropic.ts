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

export async function fetchAnthropicModels(_provider: AIProviderConfig): Promise<string[]> {
  return ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest']
}

export async function* streamAnthropicChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string,
  options?: ProviderChatRequest['options']
): AsyncGenerator<ProviderStreamEvent, void, unknown> {
  const gen = applyGenerationDefaults(options?.generationSettings)

  const formattedMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const body: Record<string, unknown> = {
    model,
    max_tokens: gen.maxTokens,
    messages: formattedMessages,
    stream: true,
    temperature: gen.temperature,
    top_p: gen.topP
  }

  if (gen.stopSequences?.length) {
    body.stop_sequences = gen.stopSequences
  }

  if (systemPrompt) {
    body.system = systemPrompt
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey || '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal: options?.signal
  })

  if (!response.ok || !response.body) {
    throw new Error(`Anthropic error (${response.status}): ${await response.text()}`)
  }

  for await (const line of readLineStream(response, options?.signal)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data: ')) continue
    try {
      const parsed = JSON.parse(trimmed.slice(6))
      if (parsed.type === 'content_block_delta') {
        if (parsed.delta?.type === 'thinking_delta' && parsed.delta?.thinking) {
          yield thinkingEvent(parsed.delta.thinking)
        } else if (parsed.delta?.text) {
          yield textEvent(parsed.delta.text)
        }
      }
      if (parsed.type === 'message_delta' && parsed.usage) {
        yield usageEvent({
          promptTokens: parsed.usage.input_tokens ?? 0,
          completionTokens: parsed.usage.output_tokens ?? 0,
          totalTokens: (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
          estimated: false
        })
      }
      if (parsed.type === 'message_stop') {
        yield doneEvent('stop')
      }
    } catch {
      // ignore
    }
  }
}

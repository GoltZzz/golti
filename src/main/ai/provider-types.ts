import type {
  AIProviderConfig,
  ChatRequestOptions,
  GenerationSettings,
  Message,
  ProviderStreamEvent,
  TokenUsage
} from '../../shared/types'

export interface ProviderChatRequest {
  provider: AIProviderConfig
  model: string
  messages: Message[]
  systemPrompt?: string
  options?: ChatRequestOptions
}

export type ProviderChatStream = AsyncGenerator<ProviderStreamEvent, void, unknown>

export function applyGenerationDefaults(
  settings?: GenerationSettings
): Required<Pick<GenerationSettings, 'temperature' | 'topP' | 'maxTokens'>> & GenerationSettings {
  return {
    temperature: settings?.temperature ?? 0.7,
    topP: settings?.topP ?? 0.9,
    maxTokens: settings?.maxTokens ?? 2048,
    stopSequences: settings?.stopSequences
  }
}

export function textEvent(text: string): ProviderStreamEvent {
  return { type: 'text', text }
}

export function usageEvent(usage: TokenUsage): ProviderStreamEvent {
  return { type: 'usage', usage }
}

export function doneEvent(finishReason?: string): ProviderStreamEvent {
  return { type: 'done', finishReason }
}

export function errorEvent(error: string): ProviderStreamEvent {
  return { type: 'error', error }
}

/** Read a fetch Response body as SSE / NDJSON lines with abort support. */
export async function* readLineStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new Error('Empty response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const onAbort = () => {
    reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', onAbort)

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        yield line
      }
    }
    if (buffer.trim()) yield buffer
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

import type { AIProviderConfig, Message, ProviderStreamEvent } from '../../../shared/types'
import {
  applyGenerationDefaults,
  doneEvent,
  readLineStream,
  textEvent,
  usageEvent,
  type ProviderChatRequest
} from '../provider-types'
import { toGoogleParts } from '../../../shared/message-blocks'

export async function fetchGoogleModels(_provider: AIProviderConfig): Promise<string[]> {
  return ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
}

export async function* streamGoogleChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string,
  options?: ProviderChatRequest['options']
): AsyncGenerator<ProviderStreamEvent, void, unknown> {
  const gen = applyGenerationDefaults(options?.generationSettings)
  const apiKey = provider.apiKey || ''
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGoogleParts(m.content, options?.attachments?.get(m.id) ?? [])
  }))

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: gen.temperature,
      topP: gen.topP,
      maxOutputTokens: gen.maxTokens,
      stopSequences: gen.stopSequences
    }
  }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal
  })

  if (!response.ok || !response.body) {
    throw new Error(`Google Gemini error (${response.status}): ${await response.text()}`)
  }

  for await (const line of readLineStream(response, options?.signal)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data: ')) continue
    try {
      const parsed = JSON.parse(trimmed.slice(6))
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) yield textEvent(text)
      const usage = parsed.usageMetadata
      if (usage) {
        yield usageEvent({
          promptTokens: usage.promptTokenCount ?? 0,
          completionTokens: usage.candidatesTokenCount ?? 0,
          totalTokens: usage.totalTokenCount ?? 0,
          estimated: false
        })
      }
      if (parsed.candidates?.[0]?.finishReason) {
        yield doneEvent(parsed.candidates[0].finishReason)
      }
    } catch {
      // ignore
    }
  }
}

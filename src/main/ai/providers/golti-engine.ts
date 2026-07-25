import path from 'path'
import type { AIProviderConfig, Message, ProviderStreamEvent } from '../../../shared/types'
import { listLocalModels, getEngineState, loadModelInEngine, checkEngineHealth } from '../../engine'
import {
  applyGenerationDefaults,
  doneEvent,
  readLineStream,
  textEvent,
  thinkingEvent,
  usageEvent,
  type ProviderChatRequest
} from '../provider-types'

export async function fetchGoltiEngineModels(endpoint: string = 'http://127.0.0.1:8391'): Promise<string[]> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '')
  const modelsSet = new Set<string>()

  const localModels = listLocalModels()
  for (const m of localModels) {
    const cleanName = path.basename(m.filename).replace(/\.gguf$/i, '')
    modelsSet.add(cleanName)
  }

  try {
    const res = await fetch(`${cleanEndpoint}/v1/models`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (item?.id) {
            const cleanName = path.basename(String(item.id)).replace(/\.gguf$/i, '')
            modelsSet.add(cleanName)
          }
        }
      }
    }
  } catch {
    // offline
  }

  const state = getEngineState()
  if (state.loadedModel) {
    const loadedName = path.basename(state.loadedModel).replace(/\.gguf$/i, '')
    if (loadedName) modelsSet.add(loadedName)
  }

  return Array.from(modelsSet)
}

export async function* streamGoltiEngineChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string,
  options?: ProviderChatRequest['options']
): AsyncGenerator<ProviderStreamEvent, void, unknown> {
  const endpoint = (provider.endpoint || 'http://127.0.0.1:8391').replace(/\/+$/, '')
  const gen = applyGenerationDefaults(options?.generationSettings)

  const localModels = listLocalModels()
  const cleanModelTarget = model.replace(/\.gguf$/, '').toLowerCase()
  const matchingLocal = localModels.find(
    (lm) =>
      lm.filename.replace(/\.gguf$/, '').toLowerCase() === cleanModelTarget ||
      lm.filename.toLowerCase() === cleanModelTarget
  )

  const state = getEngineState()
  const currentlyLoaded = state.loadedModel
    ? path.basename(state.loadedModel).replace(/\.gguf$/i, '').toLowerCase()
    : undefined

  if (matchingLocal && (state.status !== 'running' || currentlyLoaded !== cleanModelTarget)) {
    console.log(`[GoltiEngine] Auto-loading model for chat: ${matchingLocal.filepath}`)
    await loadModelInEngine(matchingLocal.filepath)

    let attempts = 0
    while (attempts < 15) {
      const healthy = await checkEngineHealth(8391)
      if (healthy) break
      await new Promise((r) => setTimeout(r, 400))
      attempts++
    }
  }

  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content
  }))

  if (systemPrompt) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt })
  }

  let response: Response
  try {
    response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: true,
        temperature: gen.temperature,
        top_p: gen.topP,
        max_tokens: gen.maxTokens,
        stop: gen.stopSequences
      }),
      signal: options?.signal
    })
  } catch (err: any) {
    if (err.name === 'AbortError') return
    throw new Error(
      `Cannot connect to Golti Engine. Make sure Golti Engine is running. (${err.message || String(err)})`
    )
  }

  if (!response.ok || !response.body) {
    throw new Error(`Golti Engine error (${response.status}): ${await response.text()}`)
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
      const reasoningDelta =
        parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning
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

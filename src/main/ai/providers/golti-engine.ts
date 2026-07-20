import path from 'path'
import { Message, AIProviderConfig } from '../../../shared/types'
import { listLocalModels, getEngineState, loadModelInEngine, checkEngineHealth } from '../../engine'

export async function fetchGoltiEngineModels(endpoint: string = 'http://127.0.0.1:8391'): Promise<string[]> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '')
  const modelsSet = new Set<string>()

  // 1. Gather local downloaded GGUF models from disk
  const localModels = listLocalModels()
  for (const m of localModels) {
    const cleanName = path.basename(m.filename).replace(/\.gguf$/i, '')
    modelsSet.add(cleanName)
  }

  // 2. Fetch models from HTTP endpoint if running
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
  } catch {}

  // 3. Fallback to loadedModel from state
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
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const endpoint = (provider.endpoint || 'http://127.0.0.1:8391').replace(/\/+$/, '')

  // Auto-switch / load model if needed
  const localModels = listLocalModels()
  const cleanModelTarget = model.replace(/\.gguf$/, '').toLowerCase()
  const matchingLocal = localModels.find(
    (lm) =>
      lm.filename.replace(/\.gguf$/, '').toLowerCase() === cleanModelTarget ||
      lm.filename.toLowerCase() === cleanModelTarget
  )

  const state = getEngineState()
  const currentlyLoaded = state.loadedModel ? path.basename(state.loadedModel).replace(/\.gguf$/i, '').toLowerCase() : undefined

  if (matchingLocal && (state.status !== 'running' || currentlyLoaded !== cleanModelTarget)) {
    console.log(`[GoltiEngine] Auto-loading model for chat: ${matchingLocal.filepath}`)
    await loadModelInEngine(matchingLocal.filepath)

    // Wait for engine server to become healthy and ready
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: true
      })
    })
  } catch (err: any) {
    throw new Error(`Cannot connect to Golti Engine. Make sure Golti Engine is running. (${err.message || String(err)})`)
  }

  if (!response.ok || !response.body) {
    throw new Error(`Golti Engine error (${response.status}): ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6))
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch (e) {
          // ignore partial parse errors
        }
      }
    }
  }
}


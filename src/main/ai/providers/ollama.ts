import { Message, AIProviderConfig } from '../../../shared/types'

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
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const endpoint = (provider.endpoint || 'http://localhost:11434').replace(/\/+$/, '')

  const formattedMessages = messages.map(m => ({
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
        stream: true
      })
    })
  } catch (err: any) {
    if (err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Ollama. Make sure the Ollama server is running.')
    }
    throw err
  }

  if (!response.ok || !response.body) {
    throw new Error(`Ollama error (${response.status}): ${await response.text()}`)
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
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.message?.content) {
          yield parsed.message.content
        }
      } catch (e) {
        // partial line, ignore
      }
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer)
      if (parsed.message?.content) {
        yield parsed.message.content
      }
    } catch (e) {
      // ignore
    }
  }
}

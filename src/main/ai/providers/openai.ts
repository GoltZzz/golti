import { Message, AIProviderConfig } from '../../../shared/types'

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
  } catch (err) {
    return ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  }
}

export async function* streamOpenAIChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const endpoint = (provider.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '')

  const formattedMessages = messages.map(m => ({
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
      stream: true
    })
  })

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI error (${response.status}): ${await response.text()}`)
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
          // ignore
        }
      }
    }
  }
}

import { Message, AIProviderConfig } from '../../../shared/types'

export async function fetchAnthropicModels(_provider: AIProviderConfig): Promise<string[]> {
  return ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest']
}

export async function* streamAnthropicChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const formattedMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }))

  const body: any = {
    model,
    max_tokens: 4096,
    messages: formattedMessages,
    stream: true
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
    body: JSON.stringify(body)
  })

  if (!response.ok || !response.body) {
    throw new Error(`Anthropic error (${response.status}): ${await response.text()}`)
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
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6))
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

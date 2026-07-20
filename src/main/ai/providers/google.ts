import { Message, AIProviderConfig } from '../../../shared/types'

export async function fetchGoogleModels(_provider: AIProviderConfig): Promise<string[]> {
  return ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
}

export async function* streamGoogleChat(
  provider: AIProviderConfig,
  model: string,
  messages: Message[],
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const apiKey = provider.apiKey || ''
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  const body: any = { contents }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok || !response.body) {
    throw new Error(`Google Gemini error (${response.status}): ${await response.text()}`)
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
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) yield text
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

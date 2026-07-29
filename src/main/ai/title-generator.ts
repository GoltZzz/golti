import type { Message } from '../../shared/types'
import {
  TITLE_SYSTEM_PROMPT,
  sanitizeGeneratedTitle
} from '../../shared/conversation-title'
import { streamChatResponse } from './provider-manager'

/** A title is a handful of tokens; anything past this is the model rambling. */
const TITLE_MAX_TOKENS = 48

/**
 * The chat waits on this before it starts streaming, so the ceiling has to be
 * low. On timeout the caller keeps the truncated-prompt fallback.
 */
const TITLE_TIMEOUT_MS = 12000

/** How much of the first prompt the titling model gets to see. */
const MAX_PROMPT_CHARS = 2000

export interface GenerateTitleRequest {
  providerId: string
  model: string
  prompt: string
}

/**
 * Ask the conversation's own model for a short title for the first user message.
 * Returns null on any failure, timeout or unusable output - the caller keeps the
 * truncated-prompt fallback title in that case.
 */
export async function generateConversationTitle(
  request: GenerateTitleRequest
): Promise<string | null> {
  const prompt = request.prompt.trim()
  if (!prompt || !request.providerId || !request.model) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS)

  const messages: Message[] = [
    {
      id: 'title-prompt',
      conversationId: 'title',
      role: 'user',
      content: `First message:\n\n${prompt.slice(0, MAX_PROMPT_CHARS)}\n\nTitle:`,
      createdAt: Date.now()
    }
  ]

  let text = ''
  try {
    const stream = streamChatResponse(
      request.providerId,
      request.model,
      messages,
      TITLE_SYSTEM_PROMPT,
      {
        signal: controller.signal,
        generationSettings: { temperature: 0.2, topP: 0.9, maxTokens: TITLE_MAX_TOKENS },
        // Without this the local engine raises the cap to LOCAL_OUTPUT_FLOOR and
        // the model answers the prompt instead of naming it.
        outputTokenFloor: TITLE_MAX_TOKENS
      }
    )

    for await (const event of stream) {
      if (event.type === 'text') text += event.text
      else if (event.type === 'error') return null
      else if (event.type === 'done') break
    }
  } catch (err) {
    console.warn('Title generation failed:', err instanceof Error ? err.message : String(err))
    return null
  } finally {
    clearTimeout(timeout)
  }

  return sanitizeGeneratedTitle(text)
}

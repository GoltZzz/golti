import type { Message } from '../../shared/types'
import {
  TITLE_SYSTEM_PROMPT,
  sanitizeGeneratedTitle
} from '../../shared/conversation-title'
import { streamChatResponse } from './provider-manager'
import { dbProviders } from '../db/database'

/** A title is a handful of tokens; anything past this is the model rambling. */
const TITLE_MAX_TOKENS = 48

/**
 * The chat waits on this before it starts streaming, so the ceiling has to be
 * low. On timeout the caller keeps the truncated-prompt fallback.
 */
const TITLE_TIMEOUT_MS = 12000

/** How much of the first prompt the titling model gets to see. */
const MAX_PROMPT_CHARS = 2000

/**
 * Opens a reasoning model's thinking with a sentence that ends exactly where the
 * title begins, so it writes the title as its next words instead of reasoning
 * for hundreds of tokens first. Generation stops at the closing quote.
 */
const THINKING_TITLE_PREFILL = '<think>\nA short title (at most 6 words) for this conversation is: "'
const THINKING_TITLE_STOP = ['"', '\n']

export interface GenerateTitleRequest {
  providerId: string
  model: string
  prompt: string
}

interface TitlePass {
  text: string
  /** True when the model started reasoning instead of answering; the pass was cut short. */
  reasoned: boolean
}

/**
 * One title request. A direct pass asks plainly and gives up the moment the
 * model starts reasoning; a steered pass continues THINKING_TITLE_PREFILL.
 */
async function runTitlePass(
  request: GenerateTitleRequest,
  question: Message,
  signal: AbortSignal,
  steered: boolean
): Promise<TitlePass> {
  // Own controller so a reasoning pass can be cancelled at the engine, not just
  // abandoned while it keeps generating.
  const pass = new AbortController()
  const onAbort = () => pass.abort()
  signal.addEventListener('abort', onAbort)

  const messages: Message[] = steered
    ? [
        question,
        {
          id: 'title-prefill',
          conversationId: 'title',
          role: 'assistant',
          content: THINKING_TITLE_PREFILL,
          createdAt: Date.now()
        }
      ]
    : [question]

  let text = ''
  try {
    const stream = streamChatResponse(request.providerId, request.model, messages, TITLE_SYSTEM_PROMPT, {
      signal: pass.signal,
      generationSettings: {
        temperature: 0.2,
        topP: 0.9,
        maxTokens: TITLE_MAX_TOKENS,
        stopSequences: steered ? THINKING_TITLE_STOP : undefined
      },
      // Without this the local engine raises the cap to LOCAL_OUTPUT_FLOOR and
      // the model answers the prompt instead of naming it.
      outputTokenFloor: TITLE_MAX_TOKENS,
      disableThinking: !steered
    })

    for await (const event of stream) {
      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'done') break
      if (event.type !== 'text' && event.type !== 'thinking') continue

      // The steered continuation is the title, however the engine labels it.
      if (steered) {
        text += event.text
        continue
      }
      // Reasoning arrives as thinking events, or inline when the engine does not split it out.
      if (event.type === 'thinking' || /^\s*<think>/i.test(text + event.text)) {
        pass.abort()
        return { text: '', reasoned: true }
      }
      text += event.text
    }

    if (!steered) return { text, reasoned: false }
    // The engine echoes the prefill ahead of the continuation.
    const at = text.lastIndexOf(THINKING_TITLE_PREFILL)
    return { text: at === -1 ? text : text.slice(at + THINKING_TITLE_PREFILL.length), reasoned: false }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function isLocalEngine(providerId: string): boolean {
  return dbProviders.list().find((p) => p.id === providerId)?.type === 'golti-engine'
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

  const question: Message = {
    id: 'title-prompt',
    conversationId: 'title',
    role: 'user',
    content: `First message:\n\n${prompt.slice(0, MAX_PROMPT_CHARS)}\n\nTitle:`,
    createdAt: Date.now()
  }

  try {
    const direct = await runTitlePass(request, question, controller.signal, false)
    if (!direct.reasoned) return sanitizeGeneratedTitle(direct.text)

    // Reasoning models think for hundreds of tokens before answering, far past
    // the time a title may take. The local engine continues a trailing assistant
    // message, so steer the model's thinking straight into the title instead.
    if (!isLocalEngine(request.providerId)) return null
    const steered = await runTitlePass(request, question, controller.signal, true)
    return sanitizeGeneratedTitle(steered.text)
  } catch (err) {
    console.warn('Title generation failed:', err instanceof Error ? err.message : String(err))
    return null
  } finally {
    clearTimeout(timeout)
  }
}

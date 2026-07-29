/**
 * Conversation titles. A new chat starts as DEFAULT_CONVERSATION_TITLE, gets a
 * truncated-prompt title the moment the first message is sent (so the sidebar is
 * never blank), and is then upgraded in the background with a model-written one.
 */

export const DEFAULT_CONVERSATION_TITLE = 'New Conversation'

/** Titles longer than this get cut at a word boundary. */
export const MAX_TITLE_LENGTH = 48

/**
 * Anything longer than this coming back from a model is not a title, it is the
 * model answering the prompt instead of naming it. Reject and keep the fallback.
 */
const MAX_RAW_TITLE_LENGTH = 160

export const TITLE_SYSTEM_PROMPT =
  'You write short titles for chat conversations. ' +
  'Given the user\'s first message, reply with a title of at most 6 words that names its topic. ' +
  'Reply with the title only: no quotes, no punctuation at the end, no explanation, no answer to the message.'

/** Immediate, offline title derived from the first prompt. */
export function fallbackTitle(prompt: string): string {
  const cleaned = collapseWhitespace(prompt)
  if (!cleaned) return DEFAULT_CONVERSATION_TITLE
  return truncateTitle(cleaned)
}

/**
 * Clean a model's raw title output. Returns null when the output is unusable,
 * in which case the caller keeps whatever title the conversation already has.
 */
export function sanitizeGeneratedTitle(raw: string): string | null {
  if (!raw) return null

  let text = raw
    // Local reasoning models often prefix a thinking block.
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    // Fenced code blocks are never a title.
    .replace(/```[\s\S]*?```/g, '')

  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return null
  if (firstLine.length > MAX_RAW_TITLE_LENGTH) return null

  text = firstLine
    // Drop a leading label the model added anyway.
    .replace(/^(title|conversation title)\s*[:\-]\s*/i, '')
    // Markdown heading or list marker.
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*]\s+/, '')
    // Surrounding quotes.
    .replace(/^["'“”‘’`]+/, '')
    .replace(/["'“”‘’`]+$/, '')
    // Emphasis markers.
    .replace(/[*_]{1,3}/g, '')
    // Trailing sentence punctuation.
    .replace(/[.,;:!?]+$/, '')
    .trim()

  text = collapseWhitespace(text)
  if (!text) return null

  return truncateTitle(text)
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateTitle(value: string): string {
  if (value.length <= MAX_TITLE_LENGTH) return value

  const clipped = value.slice(0, MAX_TITLE_LENGTH)
  const lastSpace = clipped.lastIndexOf(' ')
  // Only break on a word boundary if it does not throw away most of the title.
  const base = lastSpace > MAX_TITLE_LENGTH * 0.5 ? clipped.slice(0, lastSpace) : clipped
  return `${base.trimEnd()}...`
}

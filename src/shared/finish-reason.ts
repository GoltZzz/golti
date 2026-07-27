/**
 * Every provider spells "I ran out of room" differently:
 * OpenAI / llama.cpp `length`, Anthropic `max_tokens`, Google `MAX_TOKENS`,
 * Ollama `length`. Normalise before anything downstream reasons about it.
 */
export type NormalizedFinishReason = 'stop' | 'length' | 'content_filter' | 'tool_use' | 'other'

export function normalizeFinishReason(raw?: string | null): NormalizedFinishReason | undefined {
  if (!raw) return undefined
  const value = String(raw).toLowerCase()

  if (value === 'length' || value === 'max_tokens' || value === 'maxtokens') return 'length'
  if (value === 'stop' || value === 'end_turn' || value === 'eos' || value === 'stop_sequence') {
    return 'stop'
  }
  if (value === 'content_filter' || value === 'safety' || value === 'recitation') {
    return 'content_filter'
  }
  if (value === 'tool_use' || value === 'tool_calls' || value === 'function_call') return 'tool_use'
  return 'other'
}

/** True when the model was cut off mid-answer by the output-token limit. */
export function isTruncated(raw?: string | null): boolean {
  return normalizeFinishReason(raw) === 'length'
}

export const CONTINUE_INSTRUCTION = [
  'Your previous response was cut off because it reached the output token limit.',
  'Continue it from exactly where it stopped.',
  'Do not repeat any text you already wrote, do not restate the question, and do not add a preamble.',
  'If you stopped mid-word or mid-line of code, resume from that exact point.'
].join(' ')

export const LOCAL_OUTPUT_FLOOR = 512
export const LOCAL_OUTPUT_CEILING = 16384

const CONTEXT_SAFETY_MARGIN = 512

const LOCAL_OUTPUT_BASELINES: Array<[RegExp, number]> = [
  [/deepseek-r1|qwq|marco-o1|reasoner|thinking/, 8192],
  [/qwen3|magistral|phi-4-reasoning/, 8192],

  [/coder|codellama|codegemma|starcoder|codestral|devstral/, 8192],

  [/(^|[^0-9])(0\.5|1|1\.5|2)b/, 2048],
  [/(^|[^0-9])3b/, 3072]
]

const LOCAL_OUTPUT_DEFAULT = 4096

export function baselineLocalOutputTokens(modelName: string): number {
  const name = modelName.toLowerCase()
  for (const [pattern, tokens] of LOCAL_OUTPUT_BASELINES) {
    if (pattern.test(name)) return tokens
  }
  return LOCAL_OUTPUT_DEFAULT
}

export interface LocalOutputTokensInput {
  modelName: string
  requested?: number
  contextWindow?: number
  promptTokens?: number
  /**
   * Lower bound on the returned budget. Defaults to LOCAL_OUTPUT_FLOOR, which
   * exists so a chat reply is never cut off mid-sentence. Short utility calls
   * that want a handful of tokens (conversation titling) pass a smaller floor.
   */
  floor?: number
}

export function resolveLocalMaxOutputTokens(input: LocalOutputTokensInput): number {
  const { modelName, requested, contextWindow, promptTokens = 0 } = input
  const floor = input.floor && input.floor > 0 ? input.floor : LOCAL_OUTPUT_FLOOR

  const explicit = typeof requested === 'number' && requested > 0
  const desired = explicit ? requested : baselineLocalOutputTokens(modelName)

  let limit = Math.min(desired, LOCAL_OUTPUT_CEILING)

  if (contextWindow && contextWindow > 0) {
    const room = contextWindow - promptTokens - CONTEXT_SAFETY_MARGIN
    limit = Math.min(limit, Math.max(room, floor))
  }

  return Math.max(Math.floor(limit), floor)
}

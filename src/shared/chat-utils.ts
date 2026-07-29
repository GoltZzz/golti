import type {
  Artifact,
  Citation,
  ContextItem,
  Message,
  Shell,
  TokenBudget,
  TokenUsage
} from './types'
import { MODEL_CATALOG } from './model-catalog'

export interface EngineMemoryErrorDetails {
  isMemoryError: boolean
  modelName: string
  ramRequiredGB: number
  ramRecommendedGB: number
  rawError?: string
}

export function parseEngineMemoryError(errorText?: string, modelId?: string): EngineMemoryErrorDetails | null {
  if (!errorText) return null
  const lower = errorText.toLowerCase()

  const isMemFailure =
    lower.includes('llama-server failed to start') ||
    lower.includes('health check timed out') ||
    lower.includes('out of memory') ||
    lower.includes('failed to allocate') ||
    lower.includes('erroroutofdevicememory') ||
    lower.includes('bad_alloc') ||
    lower.includes('cannot allocate memory')

  if (!isMemFailure) return null

  // Match model from MODEL_CATALOG if modelId provided
  const cleanId = modelId ? modelId.toLowerCase().replace(/\.gguf$/i, '') : ''
  const modelInCatalog = MODEL_CATALOG.find((m) => {
    if (!cleanId) return false
    const catalogGguf = m.ggufFilename ? m.ggufFilename.toLowerCase().replace(/\.gguf$/i, '') : ''
    return (
      m.id.toLowerCase() === cleanId ||
      m.ollamaTag.toLowerCase() === cleanId ||
      (catalogGguf && (cleanId.includes(catalogGguf) || catalogGguf.includes(cleanId)))
    )
  })

  const ramRequiredGB = modelInCatalog?.ramRequiredGB || 5.5
  const ramRecommendedGB = modelInCatalog?.ramRecommendedGB || 8.0
  const modelName = modelInCatalog?.name || modelId || 'Golti Engine Model'

  return {
    isMemoryError: true,
    modelName,
    ramRequiredGB,
    ramRecommendedGB,
    rawError: errorText
  }
}


/** Rough token estimate: ~4 chars per token for English/code mix. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimateUsage(prompt: string, completion: string): TokenUsage {
  const promptTokens = estimateTokens(prompt)
  const completionTokens = estimateTokens(completion)
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true
  }
}

/**
 * Walk parent links from leaf to root, returning chronological path.
 */
export function getBranchPath(messages: Message[], leafId: string | null | undefined): Message[] {
  if (!leafId || messages.length === 0) {
    // Fallback: linear chronological (legacy / no branching)
    return [...messages].sort((a, b) => a.createdAt - b.createdAt)
  }

  const byId = new Map(messages.map((m) => [m.id, m]))
  const path: Message[] = []
  let current: Message | undefined = byId.get(leafId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.push(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path.reverse()
}

export function getActiveLeaf(messages: Message[], activeLeafId?: string | null): string | null {
  if (activeLeafId && messages.some((m) => m.id === activeLeafId)) {
    return activeLeafId
  }
  if (messages.length === 0) return null
  const sorted = [...messages].sort((a, b) => b.createdAt - a.createdAt)
  return sorted[0]?.id ?? null
}

export function getSiblings(messages: Message[], messageId: string): Message[] {
  const msg = messages.find((m) => m.id === messageId)
  if (!msg) return []
  return messages
    .filter((m) => m.parentId === msg.parentId && m.role === msg.role)
    .sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0) || a.createdAt - b.createdAt)
}

export function getChildren(messages: Message[], parentId: string | null): Message[] {
  return messages
    .filter((m) => (m.parentId ?? null) === parentId)
    .sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0) || a.createdAt - b.createdAt)
}

export interface ExtractedShell {
  title: string
  language?: string
  type: 'code' | 'markdown'
  content: string
  fenceStart: number
  fenceEnd: number
}
export type ExtractedArtifact = ExtractedShell

const SHELL_FENCE =
  /```(?:shell(?::(\w+))?|artifact(?::(\w+))?|([\w+-]+))?\s*(?:\n|$)([\s\S]*?)```/g

/**
 * Detect fenced code/markdown blocks. Prefer ```shell:lang, ```artifact:lang or ```lang
 * blocks longer than a short inline snippet threshold.
 */
export function extractShells(content: string, minLines = 1): ExtractedShell[] {
  const results: ExtractedShell[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(SHELL_FENCE.source, 'g')

  while ((match = re.exec(content)) !== null) {
    const shellLang = match[1] || match[2]
    let language = (shellLang || match[3] || 'text').toLowerCase()
    let body = (match[4] || '').replace(/\n$/, '')

    if (
      body.trim().startsWith('mermaid\n') ||
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)/i.test(
        body.trim()
      )
    ) {
      language = 'mermaid'
      if (body.trim().startsWith('mermaid\n')) {
        body = body.trim().slice(8).trimStart()
      }
    }

    const lineCount = body.split('\n').length
    const isExplicit = Boolean(shellLang) || language === 'markdown' || language === 'md' || language === 'mermaid'
    if (!isExplicit && lineCount < minLines) continue

    // Interactive question prompts are rendered as a card, not stored as shells.
    if (/^ask(?:[-_]?user)?$/.test(language)) continue
    // Same for a mid-turn web-search request; it is consumed by the runtime.
    if (language === 'search') continue
    if (language === 'json' && parseAskUserBody(body)) continue

    const type = language === 'markdown' || language === 'md' ? 'markdown' : 'code'
    const title =
      type === 'markdown'
        ? 'Document'
        : language === 'mermaid'
          ? 'Mermaid Diagram'
          : language === 'text'
            ? 'Code'
            : `${language} snippet`

    results.push({
      title,
      language: type === 'code' ? language : undefined,
      type,
      content: body,
      fenceStart: match.index,
      fenceEnd: match.index + match[0].length
    })
  }

  return results
}
export const extractArtifacts = extractShells

export interface AskUserOption {
  label: string
  description?: string
  recommended?: boolean
}

export interface AskUserPrompt {
  question: string
  options: AskUserOption[]
  allowFreeText: boolean
  multiSelect?: boolean
  fenceStart: number
  fenceEnd: number
}

type AskUserBody = Omit<AskUserPrompt, 'fenceStart' | 'fenceEnd'>

/**
 * Parse an ask-user JSON body, tolerating the formatting slips small local
 * models commonly make: single quotes, trailing commas, smart quotes, and a
 * stray language tag on the first line.
 */
function parseAskUserBody(raw: string): AskUserBody | null {
  const body = raw.trim().replace(/^(?:json|ask[-_]?user)\s*\n/i, '').trim()
  if (!body.startsWith('{')) return null

  const candidates = [
    body,
    body
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/'/g, '"')
  ]

  for (const candidate of candidates) {
    let parsed: { question?: unknown; options?: unknown; allowFreeText?: unknown; multiSelect?: unknown; multi_select?: unknown }
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const question = typeof parsed.question === 'string' ? parsed.question.trim() : ''
    if (!question) continue
    const options = Array.isArray(parsed.options)
      ? parsed.options
          .map((o): AskUserOption | null => {
            if (typeof o === 'string') {
              return o.trim() ? { label: o.trim() } : null
            }
            if (o && typeof o === 'object') {
              const raw = o as Record<string, unknown>
              const pick = (...keys: string[]): string => {
                for (const key of keys) {
                  const val = raw[key]
                  if (typeof val === 'string' && val.trim()) return val.trim()
                }
                return ''
              }
              const label = pick('label', 'option', 'text', 'value', 'title', 'name')
              if (!label) return null
              const description = pick('description', 'desc', 'subtitle', 'detail', 'hint') || undefined
              const recommended = Boolean(raw.recommended || raw.isRecommended || raw.is_recommended) || undefined
              return { label, description, recommended }
            }
            return null
          })
          .filter((o): o is AskUserOption => o !== null)
      : []
    const multiSelect = Boolean(parsed.multiSelect || parsed.multi_select) || undefined
    return { question, options, allowFreeText: parsed.allowFreeText !== false, multiSelect }
  }

  return null
}

const ASK_USER_FENCE = /```(?:ask(?:[-_]?user)?|json)?\s*(?:\n|$)([\s\S]*?)```/gi

/**
 * Find the JSON object starting at `start` by tracking brace depth, ignoring
 * braces inside strings. Returns the end index (exclusive), or -1 if unbalanced.
 */
function findJsonEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"' || ch === "'") inString = false
      continue
    }
    if (ch === '"' || ch === "'") inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }

  return -1
}

/**
 * Detect an interactive question emitted by the model. The canonical form is a
 * ```ask-user``` fence wrapping `{ question, options?, allowFreeText? }`, but
 * small models often drop the fence or mislabel it, so bare JSON objects
 * carrying a `question` key are accepted too. Returns the last complete match
 * (models sometimes ask after some preamble), or null when none is present.
 */
export function extractAllAskUser(content: string): AskUserPrompt[] {
  if (!content || !content.includes('{')) return []

  const fenced: AskUserPrompt[] = []
  const fenceRe = new RegExp(ASK_USER_FENCE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = fenceRe.exec(content)) !== null) {
    const parsed = parseAskUserBody(match[1] || '')
    if (!parsed) continue
    fenced.push({ ...parsed, fenceStart: match.index, fenceEnd: match.index + match[0].length })
  }
  if (fenced.length) return fenced

  // Unfenced fallback: scan for balanced JSON objects carrying a question key.
  const bare: AskUserPrompt[] = []
  for (let i = content.indexOf('{'); i !== -1; i = content.indexOf('{', i + 1)) {
    const end = findJsonEnd(content, i)
    if (end === -1) break
    const parsed = parseAskUserBody(content.slice(i, end))
    if (parsed) {
      bare.push({ ...parsed, fenceStart: i, fenceEnd: end })
      i = end - 1
    }
  }

  return bare
}

export function extractAskUser(content: string): AskUserPrompt | null {
  const all = extractAllAskUser(content)
  return all.length ? all[all.length - 1] : null
}

/**
 * Expand a leading slash-command in a composer draft into the instruction the
 * model actually receives. Returns the text unchanged when no command matches.
 */
export interface SlashSkill {
  name: string
  instructions: string
}

export function expandSlashCommand(text: string, skills: SlashSkill[] = []): string {
  const trimmed = text.trim()
  const match = /^\/([a-z0-9-]+)\b\s*([\s\S]*)$/i.exec(trimmed)
  if (!match) return text
  const command = match[1].toLowerCase()
  const rest = match[2].trim()

  if (command === 'skill') {
    const request = rest || 'a skill based on what we have been discussing'
    return [
      `I want to save a reusable skill for: ${request}.`,
      'Reply with ONLY the instructions that skill should follow every time it runs — written as direct commands to you, in plain text.',
      'Do not greet me, explain, or add anything before or after. Just the instructions.'
    ].join(' ')
  }

  const skill = skills.find((s) => s.name.toLowerCase() === command)
  if (!skill) return text

  const input = rest || 'what I actually need'
  const body = skill.instructions.includes('{{input}}')
    ? skill.instructions.split('{{input}}').join(input)
    : rest
      ? `${skill.instructions}\n\n${rest}`
      : skill.instructions
  return body.trim()
}

export interface ParsedSkillBlock {
  name: string
  description: string
  instructions: string
}

/**
 * Extract ```skill fenced blocks the model emits to define a reusable command.
 * The body is JSON: { "name", "description", "instructions" }. Returns the parsed
 * skills plus the content with those blocks removed.
 */
export function extractSkillBlocks(content: string): {
  skills: ParsedSkillBlock[]
  cleanContent: string
} {
  const skills: ParsedSkillBlock[] = []
  const re = /```skill\s*\n([\s\S]*?)```/gi
  const cleanContent = content.replace(re, (_match, body: string) => {
    try {
      const parsed = JSON.parse(body.trim())
      const name = typeof parsed?.name === 'string' ? parsed.name.trim() : ''
      const instructions = typeof parsed?.instructions === 'string' ? parsed.instructions.trim() : ''
      if (name && instructions) {
        skills.push({
          name,
          description: typeof parsed?.description === 'string' ? parsed.description.trim() : '',
          instructions
        })
      }
    } catch {
      // ignore malformed skill blocks
    }
    return ''
  })
  return { skills, cleanContent: cleanContent.trim() }
}

const ASK_USER_OPENER = /```search|```(?:ask(?:[-_]?user)?|json)?\s*\n?\s*\{|\{\s*(?:"|')?question(?:"|')?\s*:/i

/**
 * While a reply is still streaming, an ask-user block arrives character by
 * character and would otherwise render as raw JSON. Split the text at the first
 * point that looks like the start of such a block so the UI can show an
 * "Asking…" placeholder instead of the half-written payload.
 */
export function splitStreamingAskUser(content: string): { visible: string; asking: boolean } {
  if (!content) return { visible: '', asking: false }
  const match = ASK_USER_OPENER.exec(content)
  if (!match) return { visible: content, asking: false }
  return { visible: content.slice(0, match.index).trimEnd(), asking: true }
}

export interface SearchRequest {
  query: string
  fenceStart: number
  fenceEnd: number
}

const SEARCH_FENCE = /```search\s*(?:\n|$)([\s\S]*?)```/gi

/**
 * The body is normally `{ "query": "..." }`, but small models often emit the
 * bare query text instead, so a non-JSON body is taken as the query verbatim.
 */
function parseSearchBody(raw: string): string {
  const body = raw.trim().replace(/^(?:json|search)\s*\n/i, '').trim()
  if (!body) return ''
  if (body.startsWith('{')) {
    for (const candidate of [body, body.replace(/[“”]/g, '"').replace(/,(\s*[}\]])/g, '$1')]) {
      try {
        const parsed = JSON.parse(candidate)
        const query = typeof parsed?.query === 'string' ? parsed.query.trim() : ''
        if (query) return query
      } catch {
        continue
      }
    }
    return ''
  }
  return body.split('\n')[0].trim().replace(/^["']|["']$/g, '')
}

export function extractAllSearchRequests(content: string): SearchRequest[] {
  if (!content || !content.includes('```search')) return []
  const found: SearchRequest[] = []
  const re = new RegExp(SEARCH_FENCE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const query = parseSearchBody(match[1] || '')
    if (query) {
      found.push({ query, fenceStart: match.index, fenceEnd: match.index + match[0].length })
    }
  }
  return found
}

/**
 * A model asking for fresh web results mid-turn. Returns the last request, since
 * only the trailing one can still be unanswered.
 */
export function extractSearchRequest(content: string): SearchRequest | null {
  const all = extractAllSearchRequests(content)
  return all.length ? all[all.length - 1] : null
}

/** Remove any ```search``` blocks so they aren't rendered as raw markdown. */
export function stripSearchRequests(content: string): string {
  const found = extractAllSearchRequests(content)
  if (!found.length) return content
  let out = content
  for (let i = found.length - 1; i >= 0; i--) {
    out = out.slice(0, found[i].fenceStart) + out.slice(found[i].fenceEnd)
  }
  return out.trim()
}

/** Remove any ```ask-user``` blocks from text so they aren't rendered as raw markdown. */
export function stripAskUser(content: string): string {
  const found = extractAllAskUser(content)
  if (!found.length) return content
  let out = content
  for (let i = found.length - 1; i >= 0; i--) {
    out = out.slice(0, found[i].fenceStart) + out.slice(found[i].fenceEnd)
  }
  return out.trim()
}

/**
 * Parses inline <think>...</think> tags out of content text.
 */
export function extractThinkingTags(text: string): { reasoningText: string; cleanContent: string } {
  if (!text) return { reasoningText: '', cleanContent: '' }
  
  let reasoningText = ''
  let cleanContent = text

  const thinkMatch = /<think>([\s\S]*?)(?:<\/think>|$)/gi.exec(text)
  if (thinkMatch) {
    reasoningText = thinkMatch[1].trim()
    cleanContent = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trimStart()
  }

  return { reasoningText, cleanContent }
}

/**
 * Creates a stateful parser for streaming text that separates <think>...</think> tags
 * from regular content in real-time.
 */
export function createThinkStreamParser() {
  let buffer = ''
  let inThink = false

  function getPartialTagLen(buf: string, tag: string): number {
    const lowerBuf = buf.toLowerCase()
    const lowerTag = tag.toLowerCase()
    for (let len = Math.min(buf.length, tag.length - 1); len > 0; len--) {
      if (lowerTag.startsWith(lowerBuf.slice(-len))) {
        return len
      }
    }
    return 0
  }

  return function parseChunk(chunk: string): { thinkingDelta: string; contentDelta: string } {
    if (!chunk) return { thinkingDelta: '', contentDelta: '' }

    buffer += chunk
    let thinkingDelta = ''
    let contentDelta = ''

    while (buffer.length > 0) {
      if (!inThink) {
        const lowerBuffer = buffer.toLowerCase()
        const thinkIndex = lowerBuffer.indexOf('<think>')

        if (thinkIndex === -1) {
          const holdLen = getPartialTagLen(buffer, '<think>')
          if (holdLen > 0) {
            contentDelta += buffer.slice(0, buffer.length - holdLen)
            buffer = buffer.slice(buffer.length - holdLen)
            break
          } else {
            contentDelta += buffer
            buffer = ''
          }
        } else {
          contentDelta += buffer.slice(0, thinkIndex)
          inThink = true
          buffer = buffer.slice(thinkIndex + 7)
        }
      } else {
        const lowerBuffer = buffer.toLowerCase()
        const endThinkIndex = lowerBuffer.indexOf('</think>')

        if (endThinkIndex === -1) {
          const holdLen = getPartialTagLen(buffer, '</think>')
          if (holdLen > 0) {
            thinkingDelta += buffer.slice(0, buffer.length - holdLen)
            buffer = buffer.slice(buffer.length - holdLen)
            break
          } else {
            thinkingDelta += buffer
            buffer = ''
          }
        } else {
          thinkingDelta += buffer.slice(0, endThinkIndex)
          inThink = false
          buffer = buffer.slice(endThinkIndex + 8)
        }
      }
    }

    return { thinkingDelta, contentDelta }
  }
}

export interface HistoryTrimResult<T> {
  kept: T[]
  droppedCount: number
  droppedTokens: number
}

export function trimHistoryToBudget<T extends { role: string; content: string }>(
  history: T[],
  availableTokens: number
): HistoryTrimResult<T> {
  if (history.length === 0) return { kept: [], droppedCount: 0, droppedTokens: 0 }

  const tokens = history.map((m) => estimateTokens(m.content))

  let start = history.length - 1
  let used = tokens[start]
  while (start > 0 && used + tokens[start - 1] <= availableTokens) {
    start -= 1
    used += tokens[start]
  }

  while (start < history.length - 1 && history[start].role === 'assistant') {
    start += 1
  }

  return {
    kept: history.slice(start),
    droppedCount: start,
    droppedTokens: tokens.slice(0, start).reduce((sum, t) => sum + t, 0)
  }
}

export function computeTokenBudget(params: {
  contextWindow: number
  reservedOutputTokens: number
  systemPrompt?: string
  contextItems: ContextItem[]
  history: Message[]
  draft?: string
}): TokenBudget {
  const {
    contextWindow,
    reservedOutputTokens,
    systemPrompt = '',
    contextItems,
    history,
    draft = ''
  } = params

  const items: TokenBudget['items'] = []

  const systemTokens = estimateTokens(systemPrompt)
  if (systemTokens > 0) {
    items.push({ id: 'system', label: 'System prompt', tokens: systemTokens, category: 'system' })
  }

  for (const item of contextItems.filter((c) => c.enabled)) {
    items.push({
      id: item.id,
      label: item.name,
      tokens: item.tokenEstimate || estimateTokens(item.content),
      category: 'context'
    })
  }

  const draftTokens = estimateTokens(draft)

  const fixedTokens =
    items.reduce((sum, i) => sum + i.tokens, 0) + draftTokens + reservedOutputTokens

  const trimmed = trimHistoryToBudget(history, contextWindow - fixedTokens)
  const historyTokens = trimmed.kept.reduce((sum, m) => sum + estimateTokens(m.content), 0)

  if (historyTokens > 0) {
    items.push({ id: 'history', label: 'Conversation', tokens: historyTokens, category: 'history' })
  }

  if (draftTokens > 0) {
    items.push({ id: 'draft', label: 'Draft', tokens: draftTokens, category: 'draft' })
  }

  items.push({
    id: 'reserve',
    label: 'Output reserve',
    tokens: reservedOutputTokens,
    category: 'reserve'
  })

  const usedTokens = items.reduce((sum, i) => sum + i.tokens, 0)
  const availableTokens = Math.max(0, contextWindow - usedTokens)

  return {
    contextWindow,
    usedTokens,
    reservedOutputTokens,
    availableTokens,
    overflow: usedTokens > contextWindow,
    trimmedMessages: trimmed.droppedCount,
    items
  }
}

export function formatConversationMarkdown(
  title: string,
  messages: Message[],
  citations: Citation[] = [],
  shells: Shell[] = []
): string {
  const lines: string[] = [`# ${title}`, '']
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'
    lines.push(`## ${role}`, '')
    if (msg.reasoningContent) {
      lines.push('<details>', '<summary>Thought Process</summary>', '', msg.reasoningContent, '', '</details>', '')
    }
    lines.push(msg.content, '')
  }
  if (citations.length > 0) {
    lines.push('## Sources', '')
    for (const c of citations) {
      lines.push(`- [${c.title}](${c.url}) - ${c.snippet}`)
    }
    lines.push('')
  }
  if (shells.length > 0) {
    lines.push('## Shells', '')
    for (const s of shells) {
      lines.push(`### ${s.title}`, '')
      if (s.type === 'code') {
        lines.push('```' + (s.language || ''), s.content, '```', '')
      } else {
        lines.push(s.content, '')
      }
    }
  }
  return lines.join('\n')
}

export const DEFAULT_CONTEXT_WINDOW = 8192
export const DEFAULT_RESERVED_OUTPUT = 1024

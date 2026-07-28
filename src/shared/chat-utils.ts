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
      lines.push(`- [${c.title}](${c.url}) — ${c.snippet}`)
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

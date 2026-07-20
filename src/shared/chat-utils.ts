import type {
  Artifact,
  Citation,
  ContextItem,
  Message,
  TokenBudget,
  TokenUsage
} from './types'

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

export interface ExtractedArtifact {
  title: string
  language?: string
  type: 'code' | 'markdown'
  content: string
  fenceStart: number
  fenceEnd: number
}

const ARTIFACT_FENCE =
  /```(?:artifact(?::(\w+))?|([\w+-]+))\s*(?:\n|$)([\s\S]*?)```/g

/**
 * Detect fenced code/markdown blocks. Prefer ```artifact:lang or ```lang
 * blocks longer than a short inline snippet threshold.
 */
export function extractArtifacts(content: string, minLines = 3): ExtractedArtifact[] {
  const results: ExtractedArtifact[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(ARTIFACT_FENCE.source, 'g')

  while ((match = re.exec(content)) !== null) {
    const artifactLang = match[1]
    const language = (artifactLang || match[2] || 'text').toLowerCase()
    const body = (match[3] || '').replace(/\n$/, '')
    const lineCount = body.split('\n').length
    const isExplicit = Boolean(artifactLang) || language === 'markdown' || language === 'md'
    if (!isExplicit && lineCount < minLines) continue

    const type = language === 'markdown' || language === 'md' ? 'markdown' : 'code'
    const title =
      type === 'markdown'
        ? 'Document'
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

  let historyTokens = 0
  for (const msg of history) {
    historyTokens += estimateTokens(msg.content)
  }
  if (historyTokens > 0) {
    items.push({ id: 'history', label: 'Conversation', tokens: historyTokens, category: 'history' })
  }

  const draftTokens = estimateTokens(draft)
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
    items
  }
}

export function formatConversationMarkdown(
  title: string,
  messages: Message[],
  citations: Citation[] = [],
  artifacts: Artifact[] = []
): string {
  const lines: string[] = [`# ${title}`, '']
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'
    lines.push(`## ${role}`, '', msg.content, '')
  }
  if (citations.length > 0) {
    lines.push('## Sources', '')
    for (const c of citations) {
      lines.push(`- [${c.title}](${c.url}) — ${c.snippet}`)
    }
    lines.push('')
  }
  if (artifacts.length > 0) {
    lines.push('## Artifacts', '')
    for (const a of artifacts) {
      lines.push(`### ${a.title}`, '')
      if (a.type === 'code') {
        lines.push('```' + (a.language || ''), a.content, '```', '')
      } else {
        lines.push(a.content, '')
      }
    }
  }
  return lines.join('\n')
}

export const DEFAULT_CONTEXT_WINDOW = 8192
export const DEFAULT_RESERVED_OUTPUT = 1024

import type { ContextItem } from './types'

export interface SystemPromptParts {
  basePrompt?: string
  modeSuffix?: string
  contextBlock?: string
  memoryBlock?: string
}

export function orderContextItems<T extends { id: string; createdAt?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const at = a.createdAt ?? 0
    const bt = b.createdAt ?? 0
    if (at !== bt) return at - bt
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function selectContextItems(items: ContextItem[], selectedIds?: string[]): ContextItem[] {
  const enabled = items.filter((item) => item.enabled)
  const filtered =
    selectedIds && selectedIds.length > 0
      ? enabled.filter((item) => selectedIds.includes(item.id))
      : enabled
  return orderContextItems(filtered)
}

export function buildContextBlock(items: ContextItem[]): string {
  if (items.length === 0) return ''
  const parts = items.map(
    (item) => `<context name="${item.name}" type="${item.type}">\n${item.content}\n</context>`
  )
  return `Use the following attached context when relevant:\n\n${parts.join('\n\n')}`
}

export function buildSystemPrompt(parts: SystemPromptParts): string {
  return [parts.basePrompt, parts.modeSuffix, parts.memoryBlock, parts.contextBlock]
    .filter(Boolean)
    .join('\n\n')
}

export interface RoledMessage {
  role: string
  content: string
}

export function foldSystemMessages<T extends RoledMessage>(
  messages: T[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let pending: string[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) pending.push(message.content)
      continue
    }
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    const content = pending.length > 0 ? [...pending, message.content].join('\n\n') : message.content
    pending = []
    out.push({ role, content })
  }

  if (pending.length > 0) {
    const last = out[out.length - 1]
    if (last && last.role === 'user') {
      last.content = [last.content, ...pending].join('\n\n')
    } else {
      out.push({ role: 'user', content: pending.join('\n\n') })
    }
  }

  return out
}

export function cacheBreakpointIndex(messages: RoledMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') return i
  }
  return -1
}

export interface PromptOrderInput<T> {
  history: T[]
  volatile?: T[]
}

export function orderPromptMessages<T>(input: PromptOrderInput<T>): T[] {
  if (!input.volatile || input.volatile.length === 0) return input.history
  return [...input.history, ...input.volatile]
}

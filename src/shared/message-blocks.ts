import type { LoadedAttachment } from './types'

export type { LoadedAttachment }

export type ProviderContent = string | Record<string, unknown>[]

function dataUrl(att: LoadedAttachment): string {
  return `data:${att.mimeType};base64,${att.base64}`
}

function isImage(att: LoadedAttachment): boolean {
  return att.kind === 'image' || att.mimeType.startsWith('image/')
}

/**
 * Anthropic puts media before text; `cache_control` must land on the final block
 * so the cached prefix still ends where it did for text-only requests.
 */
export function toAnthropicContent(
  text: string,
  attachments: LoadedAttachment[],
  cache = false
): ProviderContent {
  if (attachments.length === 0) {
    return cache ? [{ type: 'text', text, cache_control: { type: 'ephemeral' } }] : text
  }

  const blocks: Record<string, unknown>[] = attachments.map((att) =>
    isImage(att)
      ? { type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } }
      : { type: 'document', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } }
  )

  blocks.push(
    cache ? { type: 'text', text, cache_control: { type: 'ephemeral' } } : { type: 'text', text }
  )
  return blocks
}

export function toOpenAIContent(
  text: string,
  attachments: LoadedAttachment[]
): ProviderContent {
  if (attachments.length === 0) return text

  const blocks: Record<string, unknown>[] = [{ type: 'text', text }]
  for (const att of attachments) {
    if (isImage(att)) {
      blocks.push({ type: 'image_url', image_url: { url: dataUrl(att), detail: 'auto' } })
    } else {
      blocks.push({ type: 'file', file: { filename: att.name, file_data: dataUrl(att) } })
    }
  }
  return blocks
}

/** Google always uses a parts array, and its `inlineData` takes raw base64 — no `data:` prefix. */
export function toGoogleParts(
  text: string,
  attachments: LoadedAttachment[]
): Record<string, unknown>[] {
  if (attachments.length === 0) return [{ text }]

  const parts: Record<string, unknown>[] = attachments.map((att) => ({
    inlineData: { mimeType: att.mimeType, data: att.base64 }
  }))
  parts.push({ text })
  return parts
}

/** Pull display text out of an already-assembled content value, for token estimates. */
export function contentToText(content: ProviderContent): string {
  if (typeof content === 'string') return content
  return content
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

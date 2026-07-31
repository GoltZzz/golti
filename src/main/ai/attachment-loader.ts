import fs from 'fs'
import type { Message } from '../../shared/types'
import type { LoadedAttachment } from '../../shared/message-blocks'
import {
  MAX_REQUEST_ATTACHMENT_BYTES,
  assertInsideStore
} from '../services/attachment-store'

export type AttachmentsByMessage = Map<string, LoadedAttachment[]>

export interface LoadAttachmentsResult {
  byMessage: AttachmentsByMessage
  skipped: Array<{ id: string; name: string; reason: string }>
}

/**
 * Read every attachment on a branch into memory once. Identical storage paths
 * are read a single time, and the newest messages win when the byte cap is hit
 * so the current turn's images are never the ones dropped.
 */
export function loadAttachments(messages: Message[]): LoadAttachmentsResult {
  const byMessage: AttachmentsByMessage = new Map()
  const skipped: LoadAttachmentsResult['skipped'] = []
  const cache = new Map<string, string>()
  let totalBytes = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg.attachments?.length) continue

    const loaded: LoadedAttachment[] = []
    for (const att of msg.attachments) {
      if (att.error) {
        skipped.push({ id: att.id, name: att.name, reason: att.error })
        continue
      }

      let base64 = cache.get(att.storagePath)
      if (base64 === undefined) {
        if (totalBytes + att.byteSize > MAX_REQUEST_ATTACHMENT_BYTES) {
          skipped.push({ id: att.id, name: att.name, reason: 'request attachment size limit' })
          continue
        }
        try {
          base64 = fs.readFileSync(assertInsideStore(att.storagePath)).toString('base64')
        } catch {
          skipped.push({ id: att.id, name: att.name, reason: 'file missing' })
          continue
        }
        cache.set(att.storagePath, base64)
        totalBytes += att.byteSize
      }

      loaded.push({
        id: att.id,
        kind: att.kind,
        mimeType: att.mimeType,
        name: att.name,
        base64
      })
    }

    if (loaded.length > 0) byMessage.set(msg.id, loaded)
  }

  return { byMessage, skipped }
}

export function collectFor(
  byMessage: AttachmentsByMessage,
  messageIds: string[]
): LoadedAttachment[] {
  const out: LoadedAttachment[] = []
  for (const id of messageIds) {
    const found = byMessage.get(id)
    if (found) out.push(...found)
  }
  return out
}

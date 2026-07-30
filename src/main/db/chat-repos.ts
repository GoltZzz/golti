import type {
  Artifact,
  ArtifactVersion,
  Citation,
  ContextItem,
  Conversation,
  ConversationSearchHit,
  GenerationSettings,
  Message,
  MessageAttachment,
  MessageSearchHit,
  MessageVersion
} from '../../shared/types'
import { getSqlite } from './sqlite'

function parseGenSettings(raw: string | null): GenerationSettings | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as GenerationSettings
  } catch {
    return undefined
  }
}

function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    providerId: row.provider_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    systemPrompt: row.system_prompt ?? undefined,
    generationSettings: parseGenSettings(row.generation_settings),
    activeLeafId: row.active_leaf_id ?? null
  }
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    displayContent: row.display_content ?? undefined,
    model: row.model ?? undefined,
    tokensIn: row.tokens_in ?? undefined,
    tokensOut: row.tokens_out ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    parentId: row.parent_id ?? null,
    variantGroupId: row.variant_group_id ?? null,
    variantIndex: row.variant_index ?? 0,
    error: row.error ?? undefined,
    generationId: row.generation_id ?? undefined,
    reasoningContent: row.reasoning_content ?? undefined,
    thinkingDurationMs: row.thinking_duration_ms ?? undefined,
    ttftMs: row.ttft_ms ?? undefined,
    tokensPerSec: row.tokens_per_sec ?? undefined,
    finishReason: row.finish_reason ?? undefined
  }
}

function mapContext(row: any): ContextItem {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    type: row.type,
    name: row.name,
    content: row.content,
    sourcePath: row.source_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    tokenEstimate: row.token_estimate,
    createdAt: row.created_at,
    enabled: Boolean(row.enabled),
    error: row.error ?? undefined
  }
}

function mapAttachment(row: any): MessageAttachment {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id ?? null,
    kind: row.kind,
    mimeType: row.mime_type,
    name: row.name,
    storagePath: row.storage_path,
    thumbPath: row.thumb_path ?? undefined,
    byteSize: row.byte_size,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    extractedText: row.extracted_text ?? undefined,
    tokenEstimate: row.token_estimate,
    createdAt: row.created_at,
    error: row.error ?? undefined
  }
}

function mapArtifact(row: any): Artifact {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    type: row.type,
    title: row.title,
    language: row.language ?? undefined,
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapCitation(row: any): Citation {
  return {
    id: row.id,
    messageId: row.message_id,
    url: row.url,
    title: row.title,
    snippet: row.snippet,
    retrievedAt: row.retrieved_at,
    rank: row.rank ?? undefined
  }
}

function syncConversationFts(id: string, title: string, body: string): void {
  const db = getSqlite()
  db.prepare('DELETE FROM conversations_fts WHERE conversation_id = ?').run(id)
  db.prepare(
    'INSERT INTO conversations_fts (conversation_id, title, body) VALUES (?, ?, ?)'
  ).run(id, title, body)
}

function syncMessageFts(id: string, conversationId: string, content: string): void {
  const db = getSqlite()
  db.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(id)
  db.prepare(
    'INSERT INTO messages_fts (message_id, conversation_id, content) VALUES (?, ?, ?)'
  ).run(id, conversationId, content)
}

export const chatConversations = {
  list: (includeArchived = false): Conversation[] => {
    const db = getSqlite()
    const rows = includeArchived
      ? db
          .prepare(
            `SELECT * FROM conversations
             ORDER BY pinned DESC, updated_at DESC`
          )
          .all()
      : db
          .prepare(
            `SELECT * FROM conversations WHERE archived = 0
             ORDER BY pinned DESC, updated_at DESC`
          )
          .all()
    return rows.map(mapConversation)
  },

  get: (id: string): Conversation | undefined => {
    const db = getSqlite()
    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
    return row ? mapConversation(row) : undefined
  },

  create: (conv: Conversation): void => {
    const db = getSqlite()
    db.prepare(
      `INSERT INTO conversations
        (id, title, model, provider_id, created_at, updated_at, pinned, archived, system_prompt, generation_settings, active_leaf_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      conv.id,
      conv.title,
      conv.model,
      conv.providerId,
      conv.createdAt,
      conv.updatedAt,
      conv.pinned ? 1 : 0,
      conv.archived ? 1 : 0,
      conv.systemPrompt ?? null,
      conv.generationSettings ? JSON.stringify(conv.generationSettings) : null,
      conv.activeLeafId ?? null
    )
    syncConversationFts(conv.id, conv.title, '')
  },

  update: (id: string, updates: Partial<Conversation>): void => {
    const existing = chatConversations.get(id)
    if (!existing) return
    const next: Conversation = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }
    const db = getSqlite()
    db.prepare(
      `UPDATE conversations SET
        title = ?, model = ?, provider_id = ?, updated_at = ?,
        pinned = ?, archived = ?, system_prompt = ?, generation_settings = ?, active_leaf_id = ?
       WHERE id = ?`
    ).run(
      next.title,
      next.model,
      next.providerId,
      next.updatedAt,
      next.pinned ? 1 : 0,
      next.archived ? 1 : 0,
      next.systemPrompt ?? null,
      next.generationSettings ? JSON.stringify(next.generationSettings) : null,
      next.activeLeafId ?? null,
      id
    )
    syncConversationFts(id, next.title, '')
  },

  delete: (id: string): void => {
    const db = getSqlite()
    const run = db.transaction(() => {
      const msgs = db.prepare('SELECT id FROM messages WHERE conversation_id = ?').all(id) as Array<{ id: string }>
      for (const m of msgs) {
        db.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(m.id)
      }
      db.prepare('DELETE FROM conversations_fts WHERE conversation_id = ?').run(id)
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    })
    run()
  },

  search: (query: string): ConversationSearchHit[] => {
    const db = getSqlite()
    const q = query.trim()
    if (!q) return []

    const ftsQuery = q
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, ''))
      .filter((t) => t.length > 0)
      .map((t) => `${t}*`)
      .join(' AND ')

    if (!ftsQuery) return []

    try {
      const rows = db
        .prepare(
          `SELECT c.id as conversation_id, c.title, c.updated_at, c.pinned,
                  snippet(conversations_fts, 2, '', '', '…', 24) as snippet
           FROM conversations_fts
           JOIN conversations c ON c.id = conversations_fts.conversation_id
           WHERE conversations_fts MATCH ?
             AND c.archived = 0
           ORDER BY rank
           LIMIT 50`
        )
        .all(ftsQuery) as any[]

      const msgHits = db
        .prepare(
          `SELECT conversation_id, snippet(messages_fts, 2, '', '', '…', 32) as snippet
           FROM messages_fts
           WHERE messages_fts MATCH ?
           LIMIT 50`
        )
        .all(ftsQuery) as any[]

      const byId = new Map<string, ConversationSearchHit>()
      for (const r of rows) {
        byId.set(r.conversation_id, {
          conversationId: r.conversation_id,
          title: r.title,
          snippet: r.snippet || '',
          updatedAt: r.updated_at,
          pinned: Boolean(r.pinned)
        })
      }
      for (const r of msgHits) {
        if (byId.has(r.conversation_id)) {
          const hit = byId.get(r.conversation_id)!
          if (!hit.snippet) hit.snippet = r.snippet
          continue
        }
        const conv = chatConversations.get(r.conversation_id)
        if (!conv || conv.archived) continue
        byId.set(r.conversation_id, {
          conversationId: r.conversation_id,
          title: conv.title,
          snippet: r.snippet || '',
          updatedAt: conv.updatedAt,
          pinned: conv.pinned
        })
      }

      if (byId.size > 0) {
        return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
      }
    } catch {
      // fall through to LIKE
    }

    // Fallback LIKE search
    const like = `%${q}%`
    const rows = db
      .prepare(
        `SELECT id as conversation_id, title, updated_at, pinned, '' as snippet
         FROM conversations
         WHERE archived = 0 AND (title LIKE ? OR id IN (
           SELECT conversation_id FROM messages WHERE content LIKE ?
         ))
         ORDER BY updated_at DESC LIMIT 50`
      )
      .all(like, like) as any[]
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      title: r.title,
      snippet: r.snippet || '',
      updatedAt: r.updated_at,
      pinned: Boolean(r.pinned)
    }))
  }
}

export const chatMessages = {
  listForConversation: (conversationId: string): Message[] => {
    const db = getSqlite()
    const rows = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId)
    const messages = rows.map(mapMessage)
    const byMessage = chatAttachments.listForConversationBound(conversationId)
    for (const msg of messages) {
      const atts = byMessage.get(msg.id)
      if (atts) msg.attachments = atts
    }
    return messages
  },

  get: (id: string): Message | undefined => {
    const db = getSqlite()
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
    return row ? mapMessage(row) : undefined
  },

  create: (msg: Message): void => {
    const db = getSqlite()
    db.prepare(
      `INSERT INTO messages
        (id, conversation_id, role, content, model, tokens_in, tokens_out, created_at, updated_at,
         parent_id, variant_group_id, variant_index, error, generation_id, reasoning_content, thinking_duration_ms,
         finish_reason, display_content, ttft_ms, tokens_per_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msg.id,
      msg.conversationId,
      msg.role,
      msg.content,
      msg.model ?? null,
      msg.tokensIn ?? null,
      msg.tokensOut ?? null,
      msg.createdAt,
      msg.updatedAt ?? null,
      msg.parentId ?? null,
      msg.variantGroupId ?? null,
      msg.variantIndex ?? 0,
      msg.error ?? null,
      msg.generationId ?? null,
      msg.reasoningContent ?? null,
      msg.thinkingDurationMs ?? null,
      msg.finishReason ?? null,
      msg.displayContent ?? null,
      msg.ttftMs ?? null,
      msg.tokensPerSec ?? null
    )
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), msg.conversationId)
    syncMessageFts(msg.id, msg.conversationId, msg.content)
    const conv = chatConversations.get(msg.conversationId)
    if (conv) syncConversationFts(conv.id, conv.title, msg.content)
  },

  update: (id: string, updates: Partial<Message>): void => {
    const existing = chatMessages.get(id)
    if (!existing) return
    const next: Message = { ...existing, ...updates, updatedAt: Date.now() }
    const db = getSqlite()
    db.prepare(
      `UPDATE messages SET
        content = ?, model = ?, tokens_in = ?, tokens_out = ?, updated_at = ?,
        parent_id = ?, variant_group_id = ?, variant_index = ?, error = ?, generation_id = ?,
        reasoning_content = ?, thinking_duration_ms = ?, finish_reason = ?, display_content = ?,
        ttft_ms = ?, tokens_per_sec = ?
       WHERE id = ?`
    ).run(
      next.content,
      next.model ?? null,
      next.tokensIn ?? null,
      next.tokensOut ?? null,
      next.updatedAt,
      next.parentId ?? null,
      next.variantGroupId ?? null,
      next.variantIndex ?? 0,
      next.error ?? null,
      next.generationId ?? null,
      next.reasoningContent ?? null,
      next.thinkingDurationMs ?? null,
      next.finishReason ?? null,
      next.displayContent ?? null,
      next.ttftMs ?? null,
      next.tokensPerSec ?? null,
      id
    )
    syncMessageFts(id, next.conversationId, next.content)
  },

  updateContent: (id: string, content: string): void => {
    chatMessages.update(id, { content })
  },

  delete: (id: string): void => {
    const db = getSqlite()
    db.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(id)
    db.prepare('DELETE FROM messages WHERE id = ?').run(id)
  },

  createVersion: (version: MessageVersion): void => {
    const db = getSqlite()
    db.prepare(
      `INSERT INTO message_versions (id, message_id, content, edited_at, edit_source)
       VALUES (?, ?, ?, ?, ?)`
    ).run(version.id, version.messageId, version.content, version.editedAt, version.editSource)
  },

  listVersions: (messageId: string): MessageVersion[] => {
    const db = getSqlite()
    const rows = db
      .prepare('SELECT * FROM message_versions WHERE message_id = ? ORDER BY edited_at DESC')
      .all(messageId) as any[]
    return rows.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      content: r.content,
      editedAt: r.edited_at,
      editSource: r.edit_source
    }))
  },

  searchMessages: (query: string, limit = 50): MessageSearchHit[] => {
    const q = query.trim()
    if (!q) return []
    const db = getSqlite()
    const tokens = q
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, ''))
      .filter((t) => t.length > 0)

    const ftsQuery = tokens.map((t) => `${t}*`).join(' AND ')

    if (ftsQuery) {
      try {
        const rows = db
          .prepare(
            `SELECT m.id as message_id, m.conversation_id, c.title as conversation_title, m.role, m.created_at,
                    snippet(messages_fts, 2, '', '', '…', 32) as content_snippet
             FROM messages_fts f
             JOIN messages m ON m.id = f.message_id
             JOIN conversations c ON c.id = m.conversation_id
             WHERE messages_fts MATCH ?
               AND c.archived = 0
             ORDER BY m.created_at DESC
             LIMIT ?`
          )
          .all(ftsQuery, limit) as any[]

        if (rows.length > 0) {
          return rows.map((r) => ({
            messageId: r.message_id,
            conversationId: r.conversation_id,
            conversationTitle: r.conversation_title || 'Untitled',
            role: r.role,
            contentSnippet: r.content_snippet || '',
            createdAt: r.created_at
          }))
        }
      } catch {
        // Fall back to LIKE search
      }
    }

    const like = `%${q}%`
    const rows = db
      .prepare(
        `SELECT m.id as message_id, m.conversation_id, c.title as conversation_title, m.role, m.created_at,
                substr(m.content, 1, 100) as content_snippet
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.archived = 0 AND m.content LIKE ?
         ORDER BY m.created_at DESC
         LIMIT ?`
      )
      .all(like, limit) as any[]

    return rows.map((r) => ({
      messageId: r.message_id,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title || 'Untitled',
      role: r.role,
      contentSnippet: r.content_snippet || '',
      createdAt: r.created_at
    }))
  }
}

export const chatContext = {
  list: (conversationId: string): ContextItem[] => {
    const db = getSqlite()
    return db
      .prepare('SELECT * FROM context_items WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId)
      .map(mapContext)
  },

  create: (item: ContextItem): void => {
    const db = getSqlite()
    db.prepare(
      `INSERT INTO context_items
        (id, conversation_id, type, name, content, source_path, mime_type, token_estimate, created_at, enabled, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      item.id,
      item.conversationId,
      item.type,
      item.name,
      item.content,
      item.sourcePath ?? null,
      item.mimeType ?? null,
      item.tokenEstimate,
      item.createdAt,
      item.enabled ? 1 : 0,
      item.error ?? null
    )
  },

  update: (id: string, updates: Partial<ContextItem>): void => {
    const db = getSqlite()
    const row = db.prepare('SELECT * FROM context_items WHERE id = ?').get(id)
    if (!row) return
    const existing = mapContext(row)
    const next = { ...existing, ...updates }
    db.prepare(
      `UPDATE context_items SET
        name = ?, content = ?, source_path = ?, mime_type = ?, token_estimate = ?, enabled = ?, error = ?
       WHERE id = ?`
    ).run(
      next.name,
      next.content,
      next.sourcePath ?? null,
      next.mimeType ?? null,
      next.tokenEstimate,
      next.enabled ? 1 : 0,
      next.error ?? null,
      id
    )
  },

  delete: (id: string): void => {
    getSqlite().prepare('DELETE FROM context_items WHERE id = ?').run(id)
  }
}

export const chatAttachments = {
  stage: (att: MessageAttachment): void => {
    getSqlite()
      .prepare(
        `INSERT INTO message_attachments
          (id, conversation_id, message_id, kind, mime_type, name, storage_path, thumb_path,
           byte_size, width, height, extracted_text, token_estimate, created_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        att.id,
        att.conversationId,
        att.messageId ?? null,
        att.kind,
        att.mimeType,
        att.name,
        att.storagePath,
        att.thumbPath ?? null,
        att.byteSize,
        att.width ?? null,
        att.height ?? null,
        att.extractedText ?? null,
        att.tokenEstimate,
        att.createdAt,
        att.error ?? null
      )
  },

  get: (id: string): MessageAttachment | undefined => {
    const row = getSqlite().prepare('SELECT * FROM message_attachments WHERE id = ?').get(id)
    return row ? mapAttachment(row) : undefined
  },

  listStaged: (conversationId: string): MessageAttachment[] => {
    return getSqlite()
      .prepare(
        `SELECT * FROM message_attachments
         WHERE conversation_id = ? AND message_id IS NULL ORDER BY created_at ASC`
      )
      .all(conversationId)
      .map(mapAttachment)
  },

  bindToMessage: (ids: string[], messageId: string): void => {
    if (ids.length === 0) return
    const db = getSqlite()
    const placeholders = ids.map(() => '?').join(', ')
    db.prepare(
      `UPDATE message_attachments SET message_id = ?
       WHERE id IN (${placeholders}) AND message_id IS NULL`
    ).run(messageId, ...ids)
  },

  listForMessages: (messageIds: string[]): Map<string, MessageAttachment[]> => {
    const out = new Map<string, MessageAttachment[]>()
    if (messageIds.length === 0) return out
    const placeholders = messageIds.map(() => '?').join(', ')
    const rows = getSqlite()
      .prepare(
        `SELECT * FROM message_attachments
         WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`
      )
      .all(...messageIds)
    for (const row of rows) {
      const att = mapAttachment(row)
      const key = att.messageId as string
      const list = out.get(key)
      if (list) list.push(att)
      else out.set(key, [att])
    }
    return out
  },

  listForConversationBound: (conversationId: string): Map<string, MessageAttachment[]> => {
    const out = new Map<string, MessageAttachment[]>()
    const rows = getSqlite()
      .prepare(
        `SELECT * FROM message_attachments
         WHERE conversation_id = ? AND message_id IS NOT NULL ORDER BY created_at ASC`
      )
      .all(conversationId)
    for (const row of rows) {
      const att = mapAttachment(row)
      const key = att.messageId as string
      const list = out.get(key)
      if (list) list.push(att)
      else out.set(key, [att])
    }
    return out
  },

  /** Number of rows still pointing at a stored file, used to refcount deletes. */
  countByStoragePath: (storagePath: string): number => {
    const row = getSqlite()
      .prepare('SELECT COUNT(*) AS n FROM message_attachments WHERE storage_path = ?')
      .get(storagePath) as { n: number }
    return row?.n ?? 0
  },

  delete: (id: string): void => {
    getSqlite().prepare('DELETE FROM message_attachments WHERE id = ?').run(id)
  },

  listAllStoragePaths: (): string[] => {
    const rows = getSqlite()
      .prepare('SELECT storage_path, thumb_path FROM message_attachments')
      .all() as Array<{ storage_path: string; thumb_path: string | null }>
    const out: string[] = []
    for (const r of rows) {
      out.push(r.storage_path)
      if (r.thumb_path) out.push(r.thumb_path)
    }
    return out
  },

  listStaleStaged: (olderThan: number): MessageAttachment[] => {
    return getSqlite()
      .prepare(
        'SELECT * FROM message_attachments WHERE message_id IS NULL AND created_at < ?'
      )
      .all(olderThan)
      .map(mapAttachment)
  }
}

export const chatArtifacts = {
  listForConversation: (conversationId: string): Artifact[] => {
    return getSqlite()
      .prepare('SELECT * FROM artifacts WHERE conversation_id = ? ORDER BY updated_at DESC')
      .all(conversationId)
      .map(mapArtifact)
  },

  listForMessage: (messageId: string): Artifact[] => {
    return getSqlite()
      .prepare('SELECT * FROM artifacts WHERE message_id = ? ORDER BY created_at ASC')
      .all(messageId)
      .map(mapArtifact)
  },

  get: (id: string): Artifact | undefined => {
    const row = getSqlite().prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
    return row ? mapArtifact(row) : undefined
  },

  create: (artifact: Artifact): void => {
    const db = getSqlite()
    db.prepare(
      `INSERT INTO artifacts
        (id, conversation_id, message_id, type, title, language, content, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      artifact.id,
      artifact.conversationId,
      artifact.messageId,
      artifact.type,
      artifact.title,
      artifact.language ?? null,
      artifact.content,
      artifact.version,
      artifact.createdAt,
      artifact.updatedAt
    )
    db.prepare(
      `INSERT INTO artifact_versions (id, artifact_id, content, version, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`av_${artifact.id}_1`, artifact.id, artifact.content, artifact.version, artifact.createdAt)
  },

  updateContent: (id: string, content: string): Artifact | undefined => {
    const existing = chatArtifacts.get(id)
    if (!existing) return undefined
    const nextVersion = existing.version + 1
    const now = Date.now()
    const db = getSqlite()
    db.prepare('UPDATE artifacts SET content = ?, version = ?, updated_at = ? WHERE id = ?').run(
      content,
      nextVersion,
      now,
      id
    )
    db.prepare(
      `INSERT INTO artifact_versions (id, artifact_id, content, version, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`av_${id}_${nextVersion}`, id, content, nextVersion, now)
    return chatArtifacts.get(id)
  },

  restoreVersion: (artifactId: string, version: number): Artifact | undefined => {
    const db = getSqlite()
    const row = db
      .prepare('SELECT * FROM artifact_versions WHERE artifact_id = ? AND version = ?')
      .get(artifactId, version) as any
    if (!row) return undefined
    return chatArtifacts.updateContent(artifactId, row.content)
  },

  listVersions: (artifactId: string): ArtifactVersion[] => {
    const rows = getSqlite()
      .prepare('SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC')
      .all(artifactId) as any[]
    return rows.map((r) => ({
      id: r.id,
      artifactId: r.artifact_id,
      shellId: r.artifact_id,
      content: r.content,
      version: r.version,
      createdAt: r.created_at
    }))
  }
}
export const chatShells = chatArtifacts

export const chatCitations = {
  listForMessage: (messageId: string): Citation[] => {
    return getSqlite()
      .prepare('SELECT * FROM citations WHERE message_id = ? ORDER BY rank ASC, retrieved_at ASC')
      .all(messageId)
      .map(mapCitation)
  },

  listForConversation: (conversationId: string): Citation[] => {
    return getSqlite()
      .prepare(
        `SELECT c.* FROM citations c
         JOIN messages m ON m.id = c.message_id
         WHERE m.conversation_id = ?
         ORDER BY c.retrieved_at ASC`
      )
      .all(conversationId)
      .map(mapCitation)
  },

  create: (citation: Citation): void => {
    getSqlite()
      .prepare(
        `INSERT INTO citations (id, message_id, url, title, snippet, retrieved_at, rank)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        citation.id,
        citation.messageId,
        citation.url,
        citation.title,
        citation.snippet,
        citation.retrievedAt,
        citation.rank ?? null
      )
  }
}

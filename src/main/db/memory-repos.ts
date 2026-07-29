import type { Memory } from '../../shared/types'
import { memorySearchText } from '../../shared/types'
import { getSqlite } from './sqlite'

function parseDetails(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((d) => String(d)).filter((d) => d.trim())
    return []
  } catch {
    return []
  }
}

function mapMemory(row: any): Memory {
  return {
    id: row.id,
    category: row.category || 'General',
    title: row.title || '',
    summary: row.summary || '',
    details: parseDetails(row.details),
    sourceConversationId: row.source_conversation_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    embeddingModel: row.embedding_model ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function syncMemoryFts(id: string, content: string): void {
  const db = getSqlite()
  db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(id)
  db.prepare('INSERT INTO memories_fts (memory_id, content) VALUES (?, ?)').run(id, content)
}

export function embeddingToBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer)
}

export function blobToEmbedding(blob: Buffer | null): number[] | null {
  if (!blob || blob.length === 0) return null
  const f32 = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
  return Array.from(f32)
}

export interface CreateMemoryInput {
  id: string
  category: string
  title: string
  summary: string
  details: string[]
  sourceConversationId?: string
  sourceMessageId?: string
  embedding?: number[] | null
  embeddingModel?: string
}

export type UpdateMemoryInput = {
  category?: string
  title?: string
  summary?: string
  details?: string[]
  embedding?: number[] | null
  embeddingModel?: string
}

export const chatMemories = {
  list: (): Memory[] => {
    return getSqlite()
      .prepare('SELECT * FROM memories ORDER BY created_at DESC')
      .all()
      .map(mapMemory)
  },

  get: (id: string): Memory | undefined => {
    const row = getSqlite().prepare('SELECT * FROM memories WHERE id = ?').get(id)
    return row ? mapMemory(row) : undefined
  },

  create: (input: CreateMemoryInput): Memory => {
    const db = getSqlite()
    const now = Date.now()
    const content = memorySearchText(input)
    db.prepare(
      `INSERT INTO memories
        (id, kind, content, category, title, summary, details, source_conversation_id, source_message_id, embedding, embedding_model, created_at, updated_at)
       VALUES (?, 'fact', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      content,
      input.category,
      input.title,
      input.summary,
      JSON.stringify(input.details),
      input.sourceConversationId ?? null,
      input.sourceMessageId ?? null,
      input.embedding && input.embedding.length ? embeddingToBlob(input.embedding) : null,
      input.embeddingModel ?? null,
      now,
      now
    )
    syncMemoryFts(input.id, content)
    return chatMemories.get(input.id)!
  },

  update: (id: string, input: UpdateMemoryInput): Memory | undefined => {
    const db = getSqlite()
    const existing = chatMemories.get(id)
    if (!existing) return undefined
    const merged = {
      category: input.category ?? existing.category,
      title: input.title ?? existing.title,
      summary: input.summary ?? existing.summary,
      details: input.details ?? existing.details
    }
    const content = memorySearchText(merged)
    const now = Date.now()
    if ('embedding' in input) {
      db.prepare(
        `UPDATE memories SET content = ?, category = ?, title = ?, summary = ?, details = ?, embedding = ?, embedding_model = ?, updated_at = ? WHERE id = ?`
      ).run(
        content,
        merged.category,
        merged.title,
        merged.summary,
        JSON.stringify(merged.details),
        input.embedding && input.embedding.length ? embeddingToBlob(input.embedding) : null,
        input.embeddingModel ?? existing.embeddingModel ?? null,
        now,
        id
      )
    } else {
      db.prepare(
        `UPDATE memories SET content = ?, category = ?, title = ?, summary = ?, details = ?, updated_at = ? WHERE id = ?`
      ).run(content, merged.category, merged.title, merged.summary, JSON.stringify(merged.details), now, id)
    }
    syncMemoryFts(id, content)
    return chatMemories.get(id)
  },

  delete: (id: string): boolean => {
    const db = getSqlite()
    db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(id)
    const info = db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return info.changes > 0
  },

  /** All rows with their decoded embedding, for cosine ranking. */
  listWithEmbeddings: (): Array<Memory & { embedding: number[] | null }> => {
    return getSqlite()
      .prepare('SELECT * FROM memories')
      .all()
      .map((row: any) => ({ ...mapMemory(row), embedding: blobToEmbedding(row.embedding) }))
  },

  /** FTS fallback when no embeddings are available. */
  searchText: (query: string, limit = 20): Memory[] => {
    const sanitized = query.trim().replace(/["*]/g, ' ')
    if (!sanitized) return []
    try {
      return getSqlite()
        .prepare(
          `SELECT m.* FROM memories_fts f
           JOIN memories m ON m.id = f.memory_id
           WHERE memories_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(`${sanitized}*`, limit)
        .map(mapMemory)
    } catch {
      return []
    }
  }
}

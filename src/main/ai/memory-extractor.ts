import { randomUUID } from 'crypto'
import type { Memory } from '../../shared/types'
import { memorySearchText } from '../../shared/types'
import { chatMemories } from '../db/memory-repos'
import { embedText, cosineSimilarity } from '../engine/embeddings'
import { isEmbeddingModelInstalled, waitForEmbeddingModel } from '../engine/embedding-server'
import { getEngineState } from '../engine/engine-process'
import { runMemoryCompletion } from '../engine/memory-server'
import { dbSettings } from '../db/database'

const ENDPOINT = 'http://127.0.0.1:8391'
const DEDUP_THRESHOLD = 0.9
const RELATED_THRESHOLD = 0.6
const MAX_RELATED = 12

const pendingExtractions: ExtractInput[] = []
let isFlushingQueue = false

async function flushPendingExtractions(): Promise<void> {
  if (isFlushingQueue || pendingExtractions.length === 0) return
  isFlushingQueue = true
  console.warn(`[Memory] Embedding model is now ready. Flushing ${pendingExtractions.length} pending extractions...`)
  try {
    while (pendingExtractions.length > 0) {
      const item = pendingExtractions.shift()
      if (item) {
        await extractAndStoreMemories(item)
      }
    }
  } finally {
    isFlushingQueue = false
  }
}

function queuePendingExtraction(input: ExtractInput): void {
  if (pendingExtractions.length >= 10) {
    pendingExtractions.shift() // Drop oldest to keep queue bounded
  }
  pendingExtractions.push(input)
  console.warn(`[Memory] Queued pending extraction (queue length: ${pendingExtractions.length}). Waiting for embedding model...`)
  
  void waitForEmbeddingModel().then((success) => {
    if (success) {
      void flushPendingExtractions()
    }
  })
}

const SYSTEM_PROMPT = `You maintain a durable, long-term memory about a user, organized as topic cards.
Each card is one topic (e.g. "Profile", "Games", "Tools") and has:
- a category: a broad grouping such as "You" (identity/preferences), "Topics" (interests/hobbies), or "Areas" (ongoing projects/work).
- a title: a short noun phrase naming the topic.
- a summary: one concise line describing the topic.
- details: a list of concise third-person bullet points.

You are given the newest conversation turn and the existing cards most related to it.
Only keep durable, cross-conversation information: stable facts about the user, explicit preferences, interests, or ongoing project context. Ignore transient chit-chat and one-off task details.

Prefer to grow an existing card over creating a near-duplicate one:
- If the turn adds durable info that fits an existing card, UPDATE that card (reference its id) with the merged category/title/summary and the full new details list.
- If it introduces a genuinely new topic, ADD a new card.
- If it makes a card obsolete, DELETE it.
- If nothing durable changed, output nothing for it.

Respond with ONLY a JSON array of operations. Each element is one of:
{"op":"add","category":"<group>","title":"<topic>","summary":"<one line>","details":["<bullet>", ...]}
{"op":"update","id":"<existing id>","category":"<group>","title":"<topic>","summary":"<one line>","details":["<full merged bullet list>"]}
{"op":"delete","id":"<existing id>"}
If nothing should change, respond with exactly [].`

interface ExtractInput {
  conversationId: string
  messageId: string
  userText: string
  assistantText: string
}

interface CardFields {
  category: string
  title: string
  summary: string
  details: string[]
}

function normalizeCard(m: any): CardFields | null {
  const title = typeof m.title === 'string' ? m.title.trim() : ''
  const summary = typeof m.summary === 'string' ? m.summary.trim() : ''
  const details = Array.isArray(m.details)
    ? m.details.map((d: unknown) => String(d).trim()).filter((d: string) => d)
    : []
  if (!title && !summary && details.length === 0) return null
  const category = (typeof m.category === 'string' && m.category.trim()) || 'General'
  return {
    category,
    title: title || summary.slice(0, 40) || category,
    summary: summary || details[0] || title,
    details
  }
}

type MemoryOp =
  | ({ op: 'add' } & CardFields)
  | ({ op: 'update'; id: string } & CardFields)
  | { op: 'delete'; id: string }

function parseOps(raw: string): MemoryOp[] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    const ops: MemoryOp[] = []
    for (const m of parsed) {
      if (!m || typeof m !== 'object') continue
      const op = String(m.op ?? '').toLowerCase().trim()
      if (op === 'delete' && typeof m.id === 'string' && m.id.trim()) {
        ops.push({ op: 'delete', id: m.id.trim() })
      } else if (op === 'update' && typeof m.id === 'string' && m.id.trim()) {
        const card = normalizeCard(m)
        if (card) ops.push({ op: 'update', id: m.id.trim(), ...card })
      } else if (op === 'add' || op === '') {
        const card = normalizeCard(m)
        if (card) ops.push({ op: 'add', ...card })
      }
    }
    return ops
  } catch {
    return []
  }
}

async function callExtractor(userPrompt: string): Promise<string | null> {
  const memoryModel = dbSettings.get().memoryModel?.trim()
  if (memoryModel) {
    const res = await runMemoryCompletion(memoryModel, SYSTEM_PROMPT, userPrompt)
    if (res) return res
    console.warn(`[Memory] Dedicated memoryModel "${memoryModel}" unavailable or failed. Falling back to main Golti Engine...`)
  }

  const state = getEngineState()
  if (state.status !== 'running' || !state.loadedModel) {
    console.warn('[Memory] Extraction skipped: Golti Engine is not running or has no model loaded (status:', state.status, ')')
    return null
  }
  try {
    const res = await fetch(`${ENDPOINT}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: state.loadedModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        temperature: 0,
        max_tokens: 512
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) {
      console.warn(`[Memory] Main Golti Engine HTTP ${res.status} during extraction`)
      return null
    }
    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.warn('[Memory] Extraction completion request failed:', err)
    return null
  }
}

/** Pick the existing memories most related to this turn, to give the model context to reconcile against. */
async function findRelated(
  turnEmbedding: number[] | null
): Promise<Array<Memory & { embedding: number[] | null }>> {
  const all = chatMemories.listWithEmbeddings()
  if (!turnEmbedding) return all.slice(0, MAX_RELATED)
  return all
    .map((m) => ({
      m,
      score: m.embedding ? cosineSimilarity(turnEmbedding, m.embedding) : 0
    }))
    .filter((r) => r.score >= RELATED_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED)
    .map((r) => r.m)
}

function isExactDuplicate(text: string, existing: Memory[]): boolean {
  const normalized = text.toLowerCase().trim()
  return existing.some((e) => memorySearchText(e).toLowerCase().trim() === normalized)
}

export async function extractAndStoreMemories(input: ExtractInput): Promise<Memory[]> {
  const { conversationId, messageId, userText, assistantText } = input
  if (!userText.trim() || !assistantText.trim()) return []

  if (!isEmbeddingModelInstalled()) {
    queuePendingExtraction(input)
    return []
  }

  const turnText = `User: ${userText}\n\nAssistant: ${assistantText}`
  const turnEmbed = await embedText(turnText)
  const related = await findRelated(turnEmbed?.vector ?? null)

  const relatedBlock = related.length
    ? related
        .map(
          (m) =>
            `- id=${m.id} [${m.category}] ${m.title}: ${m.summary}${
              m.details.length ? `\n    ${m.details.join('\n    ')}` : ''
            }`
        )
        .join('\n')
    : '(none)'
  const userPrompt = `Existing related memories:\n${relatedBlock}\n\nConversation turn:\n\n${turnText}`

  const raw = await callExtractor(userPrompt)
  if (!raw) {
    console.warn('[Memory] Extractor returned no response')
    return []
  }

  const ops = parseOps(raw)
  if (ops.length === 0) {
    console.warn('[Memory] Extractor produced no ops (nothing durable to store for this turn)')
    return []
  }

  console.warn(`[Memory] Extractor proposed ${ops.length} ops:`, ops)

  const relatedById = new Map(related.map((m) => [m.id, m]))
  const changed: Memory[] = []

  for (const op of ops) {
    if (op.op === 'delete') {
      if (relatedById.has(op.id)) {
        chatMemories.delete(op.id)
        console.warn(`[Memory] Deleted memory id=${op.id}`)
      }
      continue
    }

    const cardText = memorySearchText(op)

    if (op.op === 'update') {
      if (!relatedById.has(op.id)) continue
      const embedResult = await embedText(cardText)
      const updated = chatMemories.update(op.id, {
        category: op.category,
        title: op.title,
        summary: op.summary,
        details: op.details,
        embedding: embedResult?.vector ?? null,
        embeddingModel: embedResult?.model
      })
      if (updated) {
        changed.push(updated)
        console.warn(`[Memory] Updated memory id=${op.id}:`, op.title)
      }
      continue
    }

    if (isExactDuplicate(cardText, related)) {
      console.warn(`[Memory] Skipped exact duplicate memory:`, op.title)
      continue
    }
    const embedResult = await embedText(cardText)
    const embedding = embedResult?.vector ?? null
    if (embedding && related.some((e) => e.embedding && cosineSimilarity(embedding, e.embedding) >= DEDUP_THRESHOLD)) {
      console.warn(`[Memory] Skipped near-duplicate memory (similarity >= ${DEDUP_THRESHOLD}):`, op.title)
      continue
    }
    const created = chatMemories.create({
      id: randomUUID(),
      category: op.category,
      title: op.title,
      summary: op.summary,
      details: op.details,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
      embedding,
      embeddingModel: embedResult?.model
    })
    related.push({ ...created, embedding })
    changed.push(created)
    console.warn(`[Memory] Created new memory id=${created.id}:`, created.title)
  }

  return changed
}


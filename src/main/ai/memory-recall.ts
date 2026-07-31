import { chatMemories } from '../db/memory-repos'
import { embedText, cosineSimilarity } from '../engine/embeddings'

const TOP_K = 5
const MIN_SCORE = 0.35

export async function buildMemoryRecallBlock(query: string): Promise<string> {
  const q = query.trim()
  if (!q) return ''

  const embedResult = await embedText(q)
  if (!embedResult) {
    console.warn('[Recall] Embedding failed for query:', q.slice(0, 50))
    return ''
  }

  const rows = chatMemories.listWithEmbeddings()
  const scored = rows
    .filter((r) => r.embedding && r.embedding.length)
    .map((r) => ({ memory: r, score: cosineSimilarity(embedResult.vector, r.embedding as number[]) }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)

  if (scored.length === 0) {
    console.warn(`[Recall] Searched ${rows.length} memories for query "${q.slice(0, 40)}", no matches above threshold ${MIN_SCORE}`)
    return ''
  }

  console.warn(`[Recall] Found ${scored.length} matching memories for query "${q.slice(0, 40)}" (top score: ${scored[0].score.toFixed(2)})`)

  const lines = scored.map((r) => {
    const m = r.memory
    const bullets = m.details.length ? `\n  - ${m.details.join('\n  - ')}` : ''
    return `## ${m.title} (${m.category})\n${m.summary}${bullets}`
  })
  return `The following are relevant long-term memories about the user. Use them when helpful, but do not mention them unless relevant:\n\n${lines.join('\n\n')}`
}


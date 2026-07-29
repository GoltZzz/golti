import { embed, EMBEDDING_MODEL_FILENAME } from './embedding-server'

export interface EmbedResult {
  vector: number[]
  model: string
}

export async function embedText(text: string): Promise<EmbedResult | null> {
  const vector = await embed(text)
  if (!vector) return null
  return { vector, model: EMBEDDING_MODEL_FILENAME }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

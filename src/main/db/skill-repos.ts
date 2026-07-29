import type { Skill } from '../../shared/types'
import { getSqlite } from './sqlite'

function mapSkill(row: any): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    instructions: row.instructions || '',
    createdBy: row.created_by === 'model' ? 'model' : 'user',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface CreateSkillInput {
  id: string
  name: string
  description?: string
  instructions: string
  createdBy?: 'user' | 'model'
}

export type UpdateSkillInput = {
  name?: string
  description?: string
  instructions?: string
}

export const chatSkills = {
  list: (): Skill[] => {
    return getSqlite().prepare('SELECT * FROM skills ORDER BY name ASC').all().map(mapSkill)
  },

  get: (id: string): Skill | undefined => {
    const row = getSqlite().prepare('SELECT * FROM skills WHERE id = ?').get(id)
    return row ? mapSkill(row) : undefined
  },

  getByName: (name: string): Skill | undefined => {
    const row = getSqlite().prepare('SELECT * FROM skills WHERE name = ?').get(name)
    return row ? mapSkill(row) : undefined
  },

  /** Insert, or overwrite the skill sharing this name (upsert on name). */
  upsert: (input: CreateSkillInput): Skill => {
    const db = getSqlite()
    const now = Date.now()
    const existing = chatSkills.getByName(input.name)
    if (existing) {
      db.prepare(
        `UPDATE skills SET description = ?, instructions = ?, created_by = ?, updated_at = ? WHERE id = ?`
      ).run(input.description ?? '', input.instructions, input.createdBy ?? existing.createdBy, now, existing.id)
      return chatSkills.get(existing.id)!
    }
    db.prepare(
      `INSERT INTO skills (id, name, description, instructions, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      input.name,
      input.description ?? '',
      input.instructions,
      input.createdBy ?? 'user',
      now,
      now
    )
    return chatSkills.get(input.id)!
  },

  update: (id: string, input: UpdateSkillInput): Skill | undefined => {
    const db = getSqlite()
    const existing = chatSkills.get(id)
    if (!existing) return undefined
    db.prepare(
      `UPDATE skills SET name = ?, description = ?, instructions = ?, updated_at = ? WHERE id = ?`
    ).run(
      input.name ?? existing.name,
      input.description ?? existing.description,
      input.instructions ?? existing.instructions,
      Date.now(),
      id
    )
    return chatSkills.get(id)
  },

  delete: (id: string): boolean => {
    const info = getSqlite().prepare('DELETE FROM skills WHERE id = ?').run(id)
    return info.changes > 0
  }
}

/** Seed built-in skills once, so the /grill-me command survives the move off hardcoding. */
export function seedDefaultSkills(): void {
  if (chatSkills.getByName('grill-me')) return
  chatSkills.upsert({
    id: `skill_grill_me_${Date.now()}`,
    name: 'grill-me',
    description: 'Have Golti interview you with questions before it answers',
    createdBy: 'user',
    instructions: [
      'Interview me about {{input}} before giving any solution.',
      'Ask probing questions ONE at a time using an ask-user block, and always give 2-5 concrete clickable "options" (your best guesses at my likely answers, each with a label and a one-line description) instead of leaving me an empty text box.',
      'Do not answer or make assumptions until you have enough detail; keep asking follow-ups based on my replies.',
      'Once you understand my needs, summarize what you learned and then give your answer.',
      'Ask your first question now.'
    ].join(' ')
  })
}

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

const GRILL_ME_INSTRUCTIONS = [
  'Your job: interview me about "{{input}}" one question at a time BEFORE you give any answer or solution.',
  '',
  'Follow these steps exactly:',
  '1. Do NOT answer the request yet. First figure out the single most important thing you still do not know — the one that would most change your final answer.',
  '2. Ask about that one thing by outputting ONE ask-user block, and nothing else. No greeting, no explanation, no text before or after the block.',
  '3. The block must be valid JSON inside ```ask-user fences. Always fill "options" with 2-5 realistic answers I might pick. Put the most likely one first.',
  '4. Wait for my answer. Then ask the next most important question — and make it follow up on what I just picked, not a fixed script.',
  '5. Ask 2-4 questions total. Stop early once knowing more would not change your answer.',
  '6. When done asking, briefly summarize what you learned, state any assumptions, then give your full answer.',
  '',
  'The JSON format is strict — get it exactly right or the options will not render as buttons:',
  '- Top level: { "question": string, "options": array, "allowFreeText": true }. Always include "allowFreeText": true so I can type my own answer.',
  '- Each option is an object with a "label" (the short button text) and a "description" (one line on what picking it means). Use exactly those two key names — not "text", "value", "title", or "name".',
  '- Output plain double-quoted JSON only: no trailing commas, no comments, no smart quotes.',
  '',
  'Rules for good questions:',
  '- Never open with a generic warm-up like "what are you trying to build?" — infer that from what I already told you.',
  '- Never ask something you can already work out yourself. If you can decide it, decide it and just state the assumption.',
  '- Make options concrete and specific to my situation (real tools, files, trade-offs), not abstract.',
  '- Make options genuinely different choices, not reworded versions of each other.',
  '- If a good question depends on facts that may have changed recently (current versions, what a tool supports today), search the web first with a ```search block so the options are real rather than guessed.',
  '',
  'Example of a correct first question (copy this shape exactly):',
  '```ask-user',
  '{ "question": "Where should this run?", "options": [{ "label": "Node backend", "description": "Server-side, full filesystem and package access" }, { "label": "Browser", "description": "Client-side, no filesystem, bundle size matters" }, { "label": "Both", "description": "Shared code, must avoid Node-only APIs" }], "allowFreeText": true }',
  '```',
  '',
  'Now ask your first question as a single ask-user block. Do not write anything except the block.'
].join('\n')

/**
 * Every wording of grill-me we have shipped. An installed copy matching one of
 * these was never touched by the user, so it is safe to upgrade in place.
 */
const GRILL_ME_SHIPPED_VERSIONS = [
  'Interview me about {{input}} before giving any solution. Ask probing questions ONE at a time using an ask-user block, and always give 2-5 concrete clickable "options" (your best guesses at my likely answers, each with a label and a one-line description) instead of leaving me an empty text box. Do not answer or make assumptions until you have enough detail; keep asking follow-ups based on my replies. Once you understand my needs, summarize what you learned and then give your answer. Ask your first question now.',
  [
    'Interview me about {{input}} before giving any solution.',
    'Ask ONE question at a time using an ask-user block, and always give 2-5 concrete clickable "options" (each a label plus a one-line description of what picking it commits me to) instead of leaving me an empty text box.',
    'Question quality matters more than question count:',
    '- Open with the unknown that changes your answer the most. Never start with a generic warm-up like "what are you trying to build?" — infer that from what I already said.',
    '- Skip anything you can already work out from the conversation or from reasonable inference. If you can decide it yourself, decide it and tell me the assumption instead of spending a question on it.',
    '- Make options genuinely different answers, not rephrasings, and put the one you think is most likely first.',
    '- Ground the options in specifics — real file names, real libraries, real trade-offs from my situation — rather than abstract choices.',
    'If a good question depends on facts that may have changed recently (current versions, what a tool supports today, what exists now), search the web first with a ```search block so the options are real rather than guessed.',
    'Stop asking once more detail would not change your answer — aim for 2-4 sharp questions, not an interrogation.',
    'Then summarize what you learned, state any assumptions you made, and give your answer.',
    'Ask your first question now.'
  ].join('\n'),
  [
    'Your job: interview me about "{{input}}" one question at a time BEFORE you give any answer or solution.',
    '',
    'Follow these steps exactly:',
    '1. Do NOT answer the request yet. First figure out the single most important thing you still do not know — the one that would most change your final answer.',
    '2. Ask about that one thing by outputting ONE ask-user block, and nothing else. No greeting, no explanation, no text before or after the block.',
    '3. The block must be valid JSON inside ```ask-user fences. Always fill "options" with 2-5 realistic answers I might pick. Put the most likely one first. Each option needs a short "label" and a one-line "description" of what picking it means for me.',
    '4. Wait for my answer. Then repeat: ask the next most important question the same way.',
    '5. Ask 2-4 questions total. Stop early once knowing more would not change your answer.',
    '6. When done asking, briefly summarize what you learned, state any assumptions, then give your full answer.',
    '',
    'Rules for good questions:',
    '- Never open with a generic warm-up like "what are you trying to build?" — infer that from what I already told you.',
    '- Never ask something you can already work out yourself. If you can decide it, decide it and just state the assumption.',
    '- Make options concrete and specific to my situation (real tools, files, trade-offs), not abstract.',
    '- Make options genuinely different choices, not reworded versions of each other.',
    '',
    'Example of a correct first question (copy this shape exactly):',
    '```ask-user',
    '{ "question": "Where should this run?", "options": [{ "label": "Node backend", "description": "Server-side, full filesystem and package access" }, { "label": "Browser", "description": "Client-side, no filesystem, bundle size matters" }, { "label": "Both", "description": "Shared code, must avoid Node-only APIs" }], "allowFreeText": true }',
    '```',
    '',
    'Now ask your first question as a single ask-user block. Do not write anything except the block.'
  ].join('\n')
]

/**
 * Seed built-in skills. Creates grill-me when missing, and upgrades an untouched
 * copy to the current wording — a user-edited one is never overwritten.
 */
export function seedDefaultSkills(): void {
  const existing = chatSkills.getByName('grill-me')
  if (existing) {
    if (GRILL_ME_SHIPPED_VERSIONS.includes(existing.instructions.trim())) {
      chatSkills.update(existing.id, { instructions: GRILL_ME_INSTRUCTIONS })
    }
    return
  }
  chatSkills.upsert({
    id: `skill_grill_me_${Date.now()}`,
    name: 'grill-me',
    description: 'Have Golti interview you with questions before it answers',
    createdBy: 'user',
    instructions: GRILL_ME_INSTRUCTIONS
  })
}

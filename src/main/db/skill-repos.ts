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
  'Your job: interview me about "{{input}}" to understand what I actually need. Ask ONE question at a time before giving any answer.',
  '',
  '## How to think before each question',
  'Before asking, internally assess:',
  '- What do I already know from their request and previous answers?',
  '- What is the ONE unknown that would most change the shape of my answer?',
  '- Can I decide this myself? If yes → decide it, state the assumption, don\'t waste a question.',
  '',
  '## What to ask about (intent-focused)',
  'Ask about: goals, constraints, trade-offs, priorities, scale, timeline, who the audience is, what success looks like, edge cases they care about.',
  'Do NOT ask about: frameworks, languages, libraries, deployment targets, or implementation details you can decide yourself. Those are YOUR job to recommend.',
  '',
  '## Confidence tracking',
  'Every ask-user block MUST include a "confidence" field (integer 1-5):',
  '- 1 = I barely understand the request',
  '- 2 = I know the general area but not the specifics',
  '- 3 = I have a reasonable picture but key trade-offs are unclear',
  '- 4 = I\'m mostly clear, one or two details would sharpen the answer',
  '- 5 = I have enough to give a strong, tailored answer → STOP asking and conclude',
  '',
  '## Each question must follow up on the previous answer',
  'Never follow a fixed script. Each question must:',
  '- Reference or build on what the user just told you',
  '- Narrow the remaining uncertainty, not open a new unrelated topic',
  '- Get more specific as confidence increases (zoom in, not out)',
  '',
  '## How to ask',
  'Output ONE ask-user block per turn. Nothing else — no text before or after.',
  'The block format:',
  '```ask-user',
  '{ "question": "<specific question based on their last answer>", "confidence": <1-5>, "options": [{ "label": "<short choice>", "description": "<one line on what this means for them>", "recommended": true }, { "label": "<genuinely different choice>", "description": "<what this means>" }], "allowFreeText": true, "multiSelect": false }',
  '```',
  '',
  'Rules for options:',
  '- 2-5 options, most likely first with "recommended": true',
  '- Options must be genuinely different, not reworded versions of each other',
  '- Ground them in specifics from the user\'s situation, not abstract categories',
  '- Each needs a "label" and a "description"',
  '- Include "allowFreeText": true so they can type their own answer',
  '- Set "multiSelect": true only when multiple options apply simultaneously',
  '- Output plain double-quoted JSON only: no trailing commas, no comments, no smart quotes',
  '- If a good question depends on facts that may have changed recently (current versions, what a tool supports today), search the web first with a ```search block so the options are real rather than guessed.',
  '',
  '## When to conclude',
  'Conclude when your confidence reaches 5, OR when asking another question would not meaningfully change your answer. Do NOT keep asking just to fill a quota.',
  '',
  '## How to conclude',
  'When done, output a numbered summary as a FINAL ask-user block with confidence 5:',
  '```ask-user',
  '{ "question": "Here\'s what I understand — correct anything that\'s off:\\n\\n1. Goal: [what they want to achieve]\\n2. Key constraint: [the main limitation/requirement]\\n3. Priority: [what they care most about]\\n4. Assumption: [anything you decided on their behalf]\\n\\nDoes this look right?", "confidence": 5, "options": [{ "label": "Looks good, go ahead", "description": "I\'ll use this understanding to give you a tailored answer", "recommended": true }, { "label": "Let me correct something", "description": "I\'ll adjust based on your corrections" }], "allowFreeText": true }',
  '```',
  '',
  'After they confirm, use everything you learned to give a complete, tailored answer in a new response.',
  '',
  'Ask your first question now. Output only the ask-user block.'
].join('\n')

/**
 * Seed built-in skills. Creates grill-me when missing, otherwise brings an
 * existing copy up to the current wording. Built-ins are not user-editable
 * (skills:update / skills:delete reject them), so the stored copy is always
 * ours to replace.
 */
export function seedDefaultSkills(): void {
  const existing = chatSkills.getByName('grill-me')
  if (existing) {
    if (existing.instructions.trim() !== GRILL_ME_INSTRUCTIONS.trim()) {
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

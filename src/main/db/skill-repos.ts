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
  'Your job: interview me about "{{input}}" to understand what I actually need. Ask ONE question at a time.',
  '',
  '## Interview strategy',
  '- Start broad: understand the goal and context (confidence 1-2)',
  '- Then narrow: explore constraints, trade-offs, priorities (confidence 3-4)',
  '- Adapt depth: simple topics need 3-5 questions; complex topics may need 8-12',
  '- If the topic is ambiguous or multi-faceted, go deeper. Don\'t rush to conclude.',
  '',
  '## Before each question, think through',
  '- What do I know so far from their request + previous answers?',
  '- What is the SINGLE unknown that would most change my answer?',
  '- Can I decide this myself? If yes → state it as an assumption, don\'t waste a question.',
  '- What aspect am I exploring? (Goal / Constraint / Trade-off / Priority / Scope / Edge case / Clarification)',
  '- WHY does this question matter? (write this as the reasoning field)',
  '',
  '## What to ask about',
  'Ask about: goals, constraints, trade-offs, priorities, scale, timeline, audience, success criteria, edge cases, risk tolerance.',
  'Do NOT ask about: implementation details, frameworks, languages, libraries — those are YOUR job to decide.',
  '',
  '## Each question MUST build on previous answers',
  '- Reference what the user just told you',
  '- Get more specific as confidence increases',
  '- Never follow a script — adapt based on their actual responses',
  '- If the user\'s answer reveals unexpected complexity, ask follow-up questions about it',
  '',
  '## JSON format for each question',
  'Output ONLY one ask-user block per turn. Format:',
  '',
  '```ask-user',
  '{',
  '  "reasoning": "Brief explanation of why this question matters for shaping my answer",',
  '  "aspect": "Goal|Constraint|Trade-off|Priority|Scope|Edge case|Clarification",',
  '  "question": "Your specific question based on previous context",',
  '  "confidence": 1,',
  '  "assumptions": ["Any assumption you\'re making, stated clearly for user to confirm/deny"],',
  '  "options": [',
  '    {',
  '      "label": "Short choice",',
  '      "description": "What this means for them",',
  '      "recommended": true,',
  '      "recommendedRationale": "Why this is the recommended choice"',
  '    },',
  '    {',
  '      "label": "Genuinely different alternative",',
  '      "description": "What this means"',
  '    }',
  '  ],',
  '  "allowFreeText": true,',
  '  "multiSelect": false',
  '}',
  '```',
  '',
  '## Rules for options',
  '- 2-5 options. Most likely first with "recommended": true and "recommendedRationale".',
  '- Options must be genuinely different — not reworded versions of each other',
  '- Ground them in the user\'s specific situation',
  '- If the topic is too nuanced for predefined choices, OMIT "options" entirely and set "allowFreeText": true',
  '- Use "multiSelect": true only when multiple options genuinely apply simultaneously',
  '- Use strict double-quoted JSON. No trailing commas, no comments, no smart quotes.',
  '- If you need current facts for better options, use a ```search block first.',
  '',
  '## Confidence scale (be honest, don\'t inflate)',
  '- 1 = I barely understand the request',
  '- 2 = I know the general area but not the specifics',
  '- 3 = Reasonable picture but key trade-offs unclear',
  '- 4 = Mostly clear, one or two details would sharpen my answer',
  '- 5 = I have enough for a strong, tailored answer → CONCLUDE',
  '',
  '## When to conclude',
  'Conclude when confidence genuinely reaches 5, OR when another question would not meaningfully change your answer. Do NOT conclude prematurely — if you\'re at confidence 3, keep asking.',
  '',
  '## How to conclude',
  'Output a FINAL ask-user block with type "summary":',
  '',
  '```ask-user',
  '{',
  '  "type": "summary",',
  '  "confidence": 5,',
  '  "question": "Here\'s my understanding — correct anything that\'s off:",',
  '  "summary": {',
  '    "decisions": [',
  '      { "label": "Goal", "value": "What they want to achieve" },',
  '      { "label": "Scope", "value": "What\'s included and excluded" },',
  '      { "label": "Priority", "value": "What matters most" }',
  '    ],',
  '    "assumptions": [',
  '      { "label": "Assumed X", "value": "Because of Y" }',
  '    ],',
  '    "tradeoffs": [',
  '      { "chosen": "Option A", "over": "Option B", "reason": "Because user prioritized X" }',
  '    ]',
  '  },',
  '  "options": [',
  '    { "label": "Looks good, go ahead", "description": "I\'ll use this to give you a tailored answer", "recommended": true },',
  '    { "label": "Let me correct something", "description": "I\'ll adjust based on your corrections" }',
  '  ],',
  '  "allowFreeText": true',
  '}',
  '```',
  '',
  'After they confirm, give a complete tailored answer using everything learned.',
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

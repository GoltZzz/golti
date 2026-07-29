import { describe, it, expect } from 'vitest'
import { extractAskUser, stripAskUser, extractShells } from './chat-utils'

describe('extractAskUser', () => {
  it('parses bare JSON with no fence (the 3B failure case)', () => {
    const t = '{ "question": "What is the problem you are trying to solve with your startup idea?" }'
    const r = extractAskUser(t)!
    expect(r.question).toContain('What is the problem')
    expect(r.options).toEqual([])
    expect(r.allowFreeText).toBe(true)
    expect(stripAskUser(t)).toBe('')
  })

  it('parses the canonical fenced form with options', () => {
    const t = 'Sure.\n\n```ask-user\n{ "question": "Which DB?", "options": ["Postgres","SQLite"] }\n```'
    const r = extractAskUser(t)!
    expect(r.options).toEqual([{ label: 'Postgres' }, { label: 'SQLite' }])
    expect(stripAskUser(t)).toBe('Sure.')
  })

  it('tolerates single quotes, trailing commas and a json tag', () => {
    const t = "```json\n{ 'question': 'Pick one', 'options': ['A','B',], }\n```"
    const r = extractAskUser(t)!
    expect(r.question).toBe('Pick one')
    expect(r.options).toEqual([{ label: 'A' }, { label: 'B' }])
  })

  it('ignores prose and real code', () => {
    expect(extractAskUser('Here is a plan with no questions.')).toBeNull()
    expect(extractAskUser('```js\nconst a = { b: 1 }\n```')).toBeNull()
  })

  it('does not turn an ask-user block into a shell', () => {
    const t = '```ask-user\n{ "question": "Which DB?" }\n```'
    expect(extractShells(t)).toHaveLength(0)
  })
})

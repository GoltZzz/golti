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

  it('parses recommended option flag and multiSelect flag', () => {
    const t =
      '```ask-user\n{ "question": "Which frameworks?", "multiSelect": true, "options": [{ "label": "React", "description": "UI library", "recommended": true }, { "label": "Vue", "description": "Alternative" }] }\n```'
    const r = extractAskUser(t)!
    expect(r.question).toBe('Which frameworks?')
    expect(r.multiSelect).toBe(true)
    expect(r.options).toEqual([
      { label: 'React', description: 'UI library', recommended: true },
      { label: 'Vue', description: 'Alternative' }
    ])
  })

  it('parses confidence field and clamps between 1 and 5', () => {
    const t = '```ask-user\n{ "question": "What goal?", "confidence": 3, "options": [{ "label": "Web App", "recommended": true }] }\n```'
    const r = extractAskUser(t)!
    expect(r.question).toBe('What goal?')
    expect(r.confidence).toBe(3)

    const tHigh = '```ask-user\n{ "question": "Conclusion", "confidence": 10 }\n```'
    expect(extractAskUser(tHigh)!.confidence).toBe(5)

    const tLow = '```ask-user\n{ "question": "Start", "confidence": -2 }\n```'
    expect(extractAskUser(tLow)!.confidence).toBe(1)
  })

  it('parses new grill-me revamp fields: reasoning, aspect, assumptions, recommendedRationale, summary', () => {
    const t = `\`\`\`ask-user
{
  "reasoning": "Need to clarify target audience to choose architecture",
  "aspect": "Goal",
  "question": "Who is the primary user?",
  "confidence": 2,
  "assumptions": ["Assuming high concurrency is needed", "Assuming mobile first"],
  "options": [
    {
      "label": "Consumers",
      "description": "B2C mobile users",
      "recommended": true,
      "recommendedRationale": "Most common for task apps"
    },
    {
      "label": "Enterprise",
      "description": "B2B desktop users"
    }
  ]
}
\`\`\``
    const r = extractAskUser(t)!
    expect(r.reasoning).toBe('Need to clarify target audience to choose architecture')
    expect(r.aspect).toBe('Goal')
    expect(r.assumptions).toEqual(['Assuming high concurrency is needed', 'Assuming mobile first'])
    expect(r.options[0].recommendedRationale).toBe('Most common for task apps')

    const tSummary = `\`\`\`ask-user
{
  "type": "summary",
  "confidence": 5,
  "question": "Here's my understanding:",
  "summary": {
    "decisions": [{ "label": "Goal", "value": "Build task app" }],
    "assumptions": [{ "label": "Tech", "value": "React + Vite" }],
    "tradeoffs": [{ "chosen": "Speed", "over": "Features", "reason": "Fast launch" }]
  }
}
\`\`\``
    const s = extractAskUser(tSummary)!
    expect(s.type).toBe('summary')
    expect(s.confidence).toBe(5)
    expect(s.summary).toBeDefined()
    expect(s.summary?.decisions).toEqual([{ label: 'Goal', value: 'Build task app' }])
    expect(s.summary?.assumptions).toEqual([{ label: 'Tech', value: 'React + Vite' }])
    expect(s.summary?.tradeoffs).toEqual([{ chosen: 'Speed', over: 'Features', reason: 'Fast launch' }])
  })

  it('recovers from truncated JSON when response hits output token limit', () => {
    const truncated = `{ "question": "Which language?", "confidence": 4, "options": [ { "label": "Go", "description": "Fast" }, { "label": "Rust", "description": "Safe" } ], "allow`
    const r = extractAskUser(truncated)!
    expect(r).not.toBeNull()
    expect(r.question).toBe('Which language?')
    expect(r.options).toEqual([
      { label: 'Go', description: 'Fast' },
      { label: 'Rust', description: 'Safe' }
    ])
  })

  it('strips orphan option fragments and truncated JSON residue completely from visible text', () => {
    const orphanFragment = `, { "label": "Market Acceptance and User Feedback", "description": "Evaluating user engagement", "recommended": true }, { "label": "Competitor Analysis" } ], "allowFreeText": true, "multiSelect": false }`
    expect(stripAskUser(orphanFragment)).toBe('')

    const mixedProseAndFragment = `Here is my question:\n, { "label": "Option A" }, { "label": "Option B" } ] }`
    expect(stripAskUser(mixedProseAndFragment)).toBe('Here is my question:')
  })
})

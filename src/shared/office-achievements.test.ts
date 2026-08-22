import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  totalOfficeXP,
  decorUnlockedAt,
  nextDecorUnlock,
  getAchievement
} from './office-achievements'
import type { OfficeAgent } from './types'

function makeAgent(overrides: Partial<OfficeAgent> = {}): OfficeAgent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    role: 'coder',
    roleTitle: 'Tester',
    avatar: {
      skinColor: '#fff',
      hairColor: '#000',
      outfitColor: '#123456',
      accentColor: '#654321'
    },
    status: 'idle',
    deskId: 'desk-1',
    position: { x: 0, y: 0 },
    model: 'gpt-4o',
    providerId: 'openai',
    systemPrompt: '',
    assignedSkillIds: [],
    level: 1,
    xp: 0,
    xpToNextLevel: 250,
    stats: {
      tasksCompleted: 0,
      messagesSent: 0,
      toolCallsCount: 0,
      coffeeBreaksCount: 0
    },
    logs: [],
    memories: [],
    tokenBudget: 100000,
    tokensUsed: 0,
    unlockedAchievements: [],
    ...overrides
  }
}

/** 3am on a fixed date, so the night-shift check is deterministic. */
const NIGHT = new Date(2026, 0, 15, 3, 0, 0).getTime()
const NOON = new Date(2026, 0, 15, 12, 0, 0).getTime()

describe('evaluateAchievements', () => {
  it('unlocks first_blood on a first completed task', () => {
    const agent = makeAgent({ stats: { ...makeAgent().stats, tasksCompleted: 1 } })
    const keys = evaluateAchievements(agent, { type: 'task_completed', at: NOON })
    expect(keys).toContain('first_blood')
  })

  it('never returns an achievement that is already unlocked', () => {
    const agent = makeAgent({
      stats: { ...makeAgent().stats, tasksCompleted: 3 },
      unlockedAchievements: ['first_blood']
    })
    const keys = evaluateAchievements(agent, { type: 'task_completed', at: NOON })
    expect(keys).not.toContain('first_blood')
  })

  it('unlocks night_shift only for completions before 5am', () => {
    const agent = makeAgent({ stats: { ...makeAgent().stats, tasksCompleted: 1 } })
    expect(evaluateAchievements(agent, { type: 'task_completed', at: NIGHT })).toContain(
      'night_shift'
    )
    expect(evaluateAchievements(agent, { type: 'task_completed', at: NOON })).not.toContain(
      'night_shift'
    )
  })

  it('unlocks frugal under 2000 tokens but not at or above it', () => {
    const agent = makeAgent({ stats: { ...makeAgent().stats, tasksCompleted: 1 } })
    expect(
      evaluateAchievements(agent, { type: 'task_completed', tokensUsed: 1999, at: NOON })
    ).toContain('frugal')
    expect(
      evaluateAchievements(agent, { type: 'task_completed', tokensUsed: 2000, at: NOON })
    ).not.toContain('frugal')
  })

  it('does not unlock frugal when no token usage was reported', () => {
    const agent = makeAgent({ stats: { ...makeAgent().stats, tasksCompleted: 1 } })
    expect(
      evaluateAchievements(agent, { type: 'task_completed', tokensUsed: 0, at: NOON })
    ).not.toContain('frugal')
  })

  it('unlocks deep_diver at 8 or more sources', () => {
    const agent = makeAgent({ stats: { ...makeAgent().stats, tasksCompleted: 1 } })
    expect(
      evaluateAchievements(agent, { type: 'task_completed', sourcesFound: 8, at: NOON })
    ).toContain('deep_diver')
    expect(
      evaluateAchievements(agent, { type: 'task_completed', sourcesFound: 7, at: NOON })
    ).not.toContain('deep_diver')
  })

  it('unlocks caffeinated at 10 breaks, and only on a break event', () => {
    const agent = makeAgent({ stats: { ...makeAgent().stats, coffeeBreaksCount: 10 } })
    expect(evaluateAchievements(agent, { type: 'break_taken' })).toEqual(['caffeinated'])
    expect(evaluateAchievements(agent, { type: 'level_up' })).toEqual([])
  })

  it('unlocks level_ten at level 10', () => {
    expect(evaluateAchievements(makeAgent({ level: 9 }), { type: 'level_up' })).toEqual([])
    expect(evaluateAchievements(makeAgent({ level: 10 }), { type: 'level_up' })).toEqual([
      'level_ten'
    ])
  })

  it('unlocks artisan at the fifth artifact', () => {
    const agent = makeAgent()
    expect(
      evaluateAchievements(agent, { type: 'artifact_produced', artifactCount: 4 })
    ).toEqual([])
    expect(
      evaluateAchievements(agent, { type: 'artifact_produced', artifactCount: 5 })
    ).toEqual(['artisan'])
  })

  it('exposes a definition for every achievement key it can return', () => {
    ACHIEVEMENTS.forEach((def) => {
      expect(getAchievement(def.key)).toEqual(def)
    })
    expect(getAchievement('not-a-real-key')).toBeUndefined()
  })
})

describe('office progression', () => {
  it('counts banked level thresholds plus current xp', () => {
    // Level 1 has banked nothing yet.
    expect(totalOfficeXP([makeAgent({ level: 1, xp: 40 })])).toBe(40)
    // Level 2 banked the first 250 threshold.
    expect(totalOfficeXP([makeAgent({ level: 2, xp: 10 })])).toBe(260)
    // Level 3 banked 250 + round(250 * 1.35) = 250 + 338.
    expect(totalOfficeXP([makeAgent({ level: 3, xp: 0 })])).toBe(588)
  })

  it('sums across the whole roster', () => {
    const total = totalOfficeXP([
      makeAgent({ id: 'a', level: 1, xp: 100 }),
      makeAgent({ id: 'b', level: 2, xp: 50 })
    ])
    expect(total).toBe(100 + 300)
  })

  it('never decreases when an agent levels up', () => {
    const before = totalOfficeXP([makeAgent({ level: 1, xp: 249 })])
    const after = totalOfficeXP([makeAgent({ level: 2, xp: 0 })])
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('unlocks decor at its threshold', () => {
    expect(decorUnlockedAt(0)).toEqual([])
    expect(decorUnlockedAt(500)).toEqual(['plants'])
    expect(decorUnlockedAt(3000)).toEqual(['plants', 'dual_monitors', 'neon_sign'])
    expect(decorUnlockedAt(99999)).toHaveLength(4)
  })

  it('reports the next unlock and remaining xp, then null when complete', () => {
    expect(nextDecorUnlock(0)).toMatchObject({ key: 'plants', remaining: 500 })
    expect(nextDecorUnlock(600)).toMatchObject({ key: 'dual_monitors', remaining: 900 })
    expect(nextDecorUnlock(99999)).toBeNull()
  })
})

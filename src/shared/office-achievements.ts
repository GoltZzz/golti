import type { OfficeAgent } from './types'

/**
 * Conversations backing an office agent carry this id prefix so the Chat
 * sidebar can keep them out of Recents. The inspector links to them directly.
 */
export const OFFICE_CONVERSATION_PREFIX = 'office-'

export function isOfficeConversationId(id: string): boolean {
  return id.startsWith(OFFICE_CONVERSATION_PREFIX)
}

export type AchievementKey =
  | 'first_blood'
  | 'night_shift'
  | 'frugal'
  | 'deep_diver'
  | 'caffeinated'
  | 'level_ten'
  | 'artisan'

export interface AchievementDefinition {
  key: AchievementKey
  name: string
  description: string
  icon: string
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: 'first_blood',
    name: 'First Blood',
    description: 'Completed a first task.',
    icon: '🎯'
  },
  {
    key: 'night_shift',
    name: 'Night Shift',
    description: 'Finished a task between midnight and 5am.',
    icon: '🌙'
  },
  {
    key: 'frugal',
    name: 'Frugal',
    description: 'Completed a task using under 2,000 tokens.',
    icon: '🪙'
  },
  {
    key: 'deep_diver',
    name: 'Deep Diver',
    description: 'Finished deep research with 8 or more sources.',
    icon: '🔬'
  },
  {
    key: 'caffeinated',
    name: 'Caffeinated',
    description: 'Took 10 espresso breaks.',
    icon: '☕'
  },
  {
    key: 'level_ten',
    name: 'Veteran',
    description: 'Reached level 10.',
    icon: '🏆'
  },
  {
    key: 'artisan',
    name: 'Artisan',
    description: 'Produced 5 artifacts.',
    icon: '🛠️'
  }
]

const BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]))

export function getAchievement(key: string): AchievementDefinition | undefined {
  return BY_KEY.get(key as AchievementKey)
}

/** What just happened, so achievements can be judged against a real event. */
export interface AchievementEvent {
  type: 'task_completed' | 'break_taken' | 'level_up' | 'artifact_produced'
  /** Tokens consumed by the run that produced this event. */
  tokensUsed?: number
  /** Sources gathered, when the run was a deep research task. */
  sourcesFound?: number
  /** Epoch millis the event happened; injectable so tests are deterministic. */
  at?: number
  /** Cumulative artifacts this agent has produced, including this one. */
  artifactCount?: number
}

function matches(agent: OfficeAgent, event: AchievementEvent, key: AchievementKey): boolean {
  switch (key) {
    case 'first_blood':
      return event.type === 'task_completed' && agent.stats.tasksCompleted >= 1

    case 'night_shift': {
      if (event.type !== 'task_completed') return false
      const hour = new Date(event.at ?? Date.now()).getHours()
      return hour >= 0 && hour < 5
    }

    case 'frugal':
      return (
        event.type === 'task_completed' &&
        typeof event.tokensUsed === 'number' &&
        event.tokensUsed > 0 &&
        event.tokensUsed < 2000
      )

    case 'deep_diver':
      return (
        event.type === 'task_completed' &&
        typeof event.sourcesFound === 'number' &&
        event.sourcesFound >= 8
      )

    case 'caffeinated':
      return event.type === 'break_taken' && agent.stats.coffeeBreaksCount >= 10

    case 'level_ten':
      return event.type === 'level_up' && agent.level >= 10

    case 'artisan':
      return event.type === 'artifact_produced' && (event.artifactCount ?? 0) >= 5

    default:
      return false
  }
}

/**
 * Returns the achievement keys this event newly unlocks for the agent.
 * Already-unlocked keys are never returned, so each fires exactly once.
 */
export function evaluateAchievements(
  agent: OfficeAgent,
  event: AchievementEvent
): AchievementKey[] {
  const already = new Set(agent.unlockedAchievements)
  return ACHIEVEMENTS.filter((def) => !already.has(def.key) && matches(agent, event, def.key)).map(
    (def) => def.key
  )
}

// ==========================================
// Office-wide progression
// ==========================================

export type DecorUnlock = 'plants' | 'neon_sign' | 'dual_monitors' | 'server_upgrade'

/** Cumulative studio XP required for each decor unlock. */
export const DECOR_THRESHOLDS: Array<{ key: DecorUnlock; name: string; xp: number }> = [
  { key: 'plants', name: 'Office greenery', xp: 500 },
  { key: 'dual_monitors', name: 'Second monitors', xp: 1500 },
  { key: 'neon_sign', name: 'Neon studio sign', xp: 3000 },
  { key: 'server_upgrade', name: 'Extra server rack', xp: 6000 }
]

/**
 * Lifetime XP across the studio. Levels are worth their full prior thresholds,
 * so a level-up never lowers the total.
 */
export function totalOfficeXP(agents: OfficeAgent[]): number {
  return agents.reduce((sum, agent) => {
    let banked = 0
    let threshold = 250
    for (let level = 1; level < agent.level; level++) {
      banked += threshold
      threshold = Math.round(threshold * 1.35)
    }
    return sum + banked + agent.xp
  }, 0)
}

export function decorUnlockedAt(xp: number): DecorUnlock[] {
  return DECOR_THRESHOLDS.filter((d) => xp >= d.xp).map((d) => d.key)
}

/** The next decor unlock and how much XP remains, or null once all are earned. */
export function nextDecorUnlock(
  xp: number
): { key: DecorUnlock; name: string; xp: number; remaining: number } | null {
  const next = DECOR_THRESHOLDS.find((d) => xp < d.xp)
  return next ? { ...next, remaining: next.xp - xp } : null
}

import type {
  OfficeAgent,
  OfficeTask,
  AgentAvatarConfig,
  AgentRole,
  TaskPriority,
  TaskStatus
} from '../../shared/types'
import { getSqlite } from './sqlite'

interface AgentRow {
  id: string
  name: string
  role: string
  role_title: string
  avatar_json: string
  desk_id: string
  model: string
  provider_id: string
  temperature: number | null
  system_prompt: string
  assigned_skill_ids_json: string
  level: number
  xp: number
  xp_to_next_level: number
  stats_json: string
  memories_json: string
  token_budget: number
  tokens_used: number
  conversation_id: string | null
}

interface TaskRow {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  assigned_agent_id: string | null
  created_by: string
  created_at: number
  updated_at: number
  completed_at: number | null
  result_snippet: string | null
}

const DEFAULT_STATS: OfficeAgent['stats'] = {
  tasksCompleted: 0,
  messagesSent: 0,
  toolCallsCount: 0,
  coffeeBreaksCount: 0
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

function mapAgent(row: AgentRow, achievements: string[]): OfficeAgent {
  return {
    id: row.id,
    name: row.name,
    role: row.role as AgentRole,
    roleTitle: row.role_title,
    avatar: parseJson<AgentAvatarConfig>(row.avatar_json, {
      skinColor: '#fcd2b0',
      hairColor: '#2b211b',
      outfitColor: '#61afef',
      accentColor: '#56b6c2'
    }),
    // Runtime-only fields: an agent always loads idle at its own desk.
    status: 'idle',
    deskId: row.desk_id,
    position: { x: 0, y: 0 },
    model: row.model,
    providerId: row.provider_id,
    temperature: row.temperature ?? undefined,
    systemPrompt: row.system_prompt,
    assignedSkillIds: parseJson<string[]>(row.assigned_skill_ids_json, []),
    level: row.level,
    xp: row.xp,
    xpToNextLevel: row.xp_to_next_level,
    stats: { ...DEFAULT_STATS, ...parseJson<Partial<OfficeAgent['stats']>>(row.stats_json, {}) },
    logs: [],
    memories: parseJson<string[]>(row.memories_json, []),
    tokenBudget: row.token_budget,
    tokensUsed: row.tokens_used,
    conversationId: row.conversation_id ?? undefined,
    unlockedAchievements: achievements
  }
}

function mapTask(row: TaskRow): OfficeTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    assignedAgentId: row.assigned_agent_id ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    resultSnippet: row.result_snippet ?? undefined
  }
}

export const officeAgents = {
  list: (): OfficeAgent[] => {
    const db = getSqlite()
    const rows = db
      .prepare('SELECT * FROM office_agents ORDER BY created_at ASC')
      .all() as AgentRow[]

    const unlockRows = db
      .prepare('SELECT agent_id, key FROM office_achievements WHERE agent_id IS NOT NULL')
      .all() as Array<{ agent_id: string; key: string }>

    const byAgent = new Map<string, string[]>()
    unlockRows.forEach((r) => {
      const list = byAgent.get(r.agent_id) ?? []
      list.push(r.key)
      byAgent.set(r.agent_id, list)
    })

    return rows.map((row) => mapAgent(row, byAgent.get(row.id) ?? []))
  },

  upsert: (agent: OfficeAgent): void => {
    const db = getSqlite()
    const now = Date.now()

    db.prepare(
      `INSERT INTO office_agents (
         id, name, role, role_title, avatar_json, desk_id, model, provider_id,
         temperature, system_prompt, assigned_skill_ids_json, level, xp,
         xp_to_next_level, stats_json, memories_json, token_budget, tokens_used,
         conversation_id, created_at, updated_at
       ) VALUES (
         @id, @name, @role, @role_title, @avatar_json, @desk_id, @model, @provider_id,
         @temperature, @system_prompt, @assigned_skill_ids_json, @level, @xp,
         @xp_to_next_level, @stats_json, @memories_json, @token_budget, @tokens_used,
         @conversation_id, @now, @now
       )
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         role = excluded.role,
         role_title = excluded.role_title,
         avatar_json = excluded.avatar_json,
         desk_id = excluded.desk_id,
         model = excluded.model,
         provider_id = excluded.provider_id,
         temperature = excluded.temperature,
         system_prompt = excluded.system_prompt,
         assigned_skill_ids_json = excluded.assigned_skill_ids_json,
         level = excluded.level,
         xp = excluded.xp,
         xp_to_next_level = excluded.xp_to_next_level,
         stats_json = excluded.stats_json,
         memories_json = excluded.memories_json,
         token_budget = excluded.token_budget,
         tokens_used = excluded.tokens_used,
         conversation_id = excluded.conversation_id,
         updated_at = excluded.updated_at`
    ).run({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      role_title: agent.roleTitle,
      avatar_json: JSON.stringify(agent.avatar),
      desk_id: agent.deskId,
      model: agent.model,
      provider_id: agent.providerId,
      temperature: agent.temperature ?? null,
      system_prompt: agent.systemPrompt,
      assigned_skill_ids_json: JSON.stringify(agent.assignedSkillIds ?? []),
      level: agent.level,
      xp: agent.xp,
      xp_to_next_level: agent.xpToNextLevel,
      stats_json: JSON.stringify(agent.stats),
      memories_json: JSON.stringify(agent.memories ?? []),
      token_budget: agent.tokenBudget,
      tokens_used: agent.tokensUsed,
      conversation_id: agent.conversationId ?? null,
      now
    })

    const insertUnlock = db.prepare(
      `INSERT OR IGNORE INTO office_achievements (id, agent_id, key, unlocked_at)
       VALUES (?, ?, ?, ?)`
    )
    agent.unlockedAchievements?.forEach((key) => {
      insertUnlock.run(`${agent.id}:${key}`, agent.id, key, now)
    })
  },

  delete: (id: string): void => {
    getSqlite().prepare('DELETE FROM office_agents WHERE id = ?').run(id)
  }
}

export const officeTasks = {
  list: (): OfficeTask[] => {
    return (
      getSqlite()
        .prepare('SELECT * FROM office_tasks ORDER BY created_at DESC')
        .all() as TaskRow[]
    ).map(mapTask)
  },

  upsert: (task: OfficeTask): void => {
    getSqlite()
      .prepare(
        `INSERT INTO office_tasks (
           id, title, description, priority, status, assigned_agent_id,
           created_by, created_at, updated_at, completed_at, result_snippet
         ) VALUES (
           @id, @title, @description, @priority, @status, @assigned_agent_id,
           @created_by, @created_at, @updated_at, @completed_at, @result_snippet
         )
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           priority = excluded.priority,
           status = excluded.status,
           assigned_agent_id = excluded.assigned_agent_id,
           updated_at = excluded.updated_at,
           completed_at = excluded.completed_at,
           result_snippet = excluded.result_snippet`
      )
      .run({
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        priority: task.priority,
        status: task.status,
        assigned_agent_id: task.assignedAgentId ?? null,
        created_by: task.createdBy,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
        completed_at: task.completedAt ?? null,
        result_snippet: task.resultSnippet ?? null
      })
  },

  delete: (id: string): void => {
    getSqlite().prepare('DELETE FROM office_tasks WHERE id = ?').run(id)
  }
}

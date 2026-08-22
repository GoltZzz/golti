import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OfficeAgent, OfficeTask } from '../../shared/types'
import { MIGRATIONS, migrate, setSqlitePath, closeSqlite, getSqlite } from './sqlite'
import { officeAgents, officeTasks } from './office-repos'
import { chatConversations } from './chat-repos'

function makeAgent(overrides: Partial<OfficeAgent> = {}): OfficeAgent {
  return {
    id: 'agent-1',
    name: 'Kai Chen',
    role: 'coder',
    roleTitle: 'Principal Code Crafter',
    avatar: {
      skinColor: '#fcd2b0',
      hairColor: '#1a1a24',
      outfitColor: '#61afef',
      accentColor: '#56b6c2',
      accessory: 'headphones',
      iconName: 'Code2'
    },
    status: 'working',
    statusMessage: 'transient',
    deskId: 'desk-coder',
    position: { x: 650, y: 180 },
    model: 'claude-3-7-sonnet',
    providerId: 'anthropic',
    temperature: 0.2,
    systemPrompt: 'You are Kai.',
    assignedSkillIds: ['skill-a', 'skill-b'],
    level: 3,
    xp: 120,
    xpToNextLevel: 456,
    stats: {
      tasksCompleted: 7,
      messagesSent: 12,
      toolCallsCount: 4,
      coffeeBreaksCount: 1
    },
    logs: [{ id: 'l1', timestamp: 1, type: 'thought', content: 'transient' }],
    memories: ['mem-1'],
    tokenBudget: 120000,
    tokensUsed: 3400,
    unlockedAchievements: ['first_blood'],
    ...overrides
  }
}

function makeTask(overrides: Partial<OfficeTask> = {}): OfficeTask {
  return {
    id: 'task-1',
    title: 'Ship the office',
    description: 'Wire it to real generations',
    priority: 'high',
    status: 'in_progress',
    assignedAgentId: 'agent-1',
    createdBy: 'user',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides
  }
}

describe('sqlite office repos', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-office-test-'))
    setSqlitePath(path.join(dir, 'test.sqlite'))
    getSqlite()
  })

  afterEach(() => {
    closeSqlite()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips a durable agent', () => {
    officeAgents.upsert(makeAgent())

    const [loaded] = officeAgents.list()
    expect(loaded.id).toBe('agent-1')
    expect(loaded.name).toBe('Kai Chen')
    expect(loaded.avatar.accessory).toBe('headphones')
    expect(loaded.assignedSkillIds).toEqual(['skill-a', 'skill-b'])
    expect(loaded.level).toBe(3)
    expect(loaded.xp).toBe(120)
    expect(loaded.stats.tasksCompleted).toBe(7)
    expect(loaded.tokensUsed).toBe(3400)
    expect(loaded.unlockedAchievements).toEqual(['first_blood'])
  })

  it('does not persist ephemeral runtime state', () => {
    officeAgents.upsert(makeAgent())

    const [loaded] = officeAgents.list()
    // Status, position and logs are rebuilt from the live floor on load.
    expect(loaded.status).toBe('idle')
    expect(loaded.logs).toEqual([])
    expect(loaded.position).toEqual({ x: 0, y: 0 })
  })

  it('updates in place rather than duplicating', () => {
    officeAgents.upsert(makeAgent())
    officeAgents.upsert(makeAgent({ level: 9, xp: 800, name: 'Kai C.' }))

    const agents = officeAgents.list()
    expect(agents).toHaveLength(1)
    expect(agents[0].level).toBe(9)
    expect(agents[0].name).toBe('Kai C.')
  })

  it('accumulates achievements without duplicating rows', () => {
    officeAgents.upsert(makeAgent())
    officeAgents.upsert(makeAgent({ unlockedAchievements: ['first_blood', 'frugal'] }))

    const [loaded] = officeAgents.list()
    expect(loaded.unlockedAchievements.sort()).toEqual(['first_blood', 'frugal'])
  })

  it('deletes an agent and its achievements', () => {
    officeAgents.upsert(makeAgent())
    officeAgents.delete('agent-1')

    expect(officeAgents.list()).toHaveLength(0)
    const rows = getSqlite().prepare('SELECT COUNT(*) AS n FROM office_achievements').get() as {
      n: number
    }
    expect(rows.n).toBe(0)
  })

  it('round-trips tasks and clears optional fields correctly', () => {
    officeAgents.upsert(makeAgent())
    officeTasks.upsert(makeTask())

    let [task] = officeTasks.list()
    expect(task.title).toBe('Ship the office')
    expect(task.assignedAgentId).toBe('agent-1')
    expect(task.completedAt).toBeUndefined()

    officeTasks.upsert(makeTask({ status: 'completed', completedAt: 3000, resultSnippet: 'ok' }))
    ;[task] = officeTasks.list()
    expect(task.status).toBe('completed')
    expect(task.completedAt).toBe(3000)
    expect(task.resultSnippet).toBe('ok')

    officeTasks.delete('task-1')
    expect(officeTasks.list()).toHaveLength(0)
  })

  it('detaches an agent from its tasks rather than cascading the delete', () => {
    officeAgents.upsert(makeAgent())
    officeTasks.upsert(makeTask())

    officeAgents.delete('agent-1')

    const [task] = officeTasks.list()
    expect(task).toBeDefined()
    expect(task.assignedAgentId).toBeUndefined()
  })

  it('clears conversation_id when the backing conversation is deleted', () => {
    chatConversations.create({
      id: 'conv-1',
      title: 'Kai',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })
    officeAgents.upsert(makeAgent({ conversationId: 'conv-1' }))
    expect(officeAgents.list()[0].conversationId).toBe('conv-1')

    getSqlite().prepare('DELETE FROM conversations WHERE id = ?').run('conv-1')
    expect(officeAgents.list()[0].conversationId).toBeUndefined()
  })

  it('survives corrupt JSON columns instead of throwing', () => {
    officeAgents.upsert(makeAgent())
    getSqlite()
      .prepare("UPDATE office_agents SET stats_json = '{not json', avatar_json = 'null'")
      .run()

    const [loaded] = officeAgents.list()
    expect(loaded.stats.tasksCompleted).toBe(0)
    expect(loaded.avatar.outfitColor).toBeTruthy()
  })

  it('applies migration 10 to a database created before it existed', () => {
    const legacyPath = path.join(dir, 'legacy.sqlite')
    const legacy = new Database(legacyPath)
    legacy.pragma('foreign_keys = ON')

    // Build the schema as it stood before the office tables landed.
    const older = MIGRATIONS.filter((m) => m.version < 10)
    expect(older.length).toBeGreaterThan(0)
    legacy.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `)
    older.forEach((m) => {
      legacy.exec(m.sql)
      legacy
        .prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(m.version, Date.now())
    })
    legacy.close()

    const reopened = new Database(legacyPath)
    reopened.pragma('foreign_keys = ON')
    expect(() => migrate(reopened)).not.toThrow()

    const tables = reopened
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'office_%'")
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name).sort()).toEqual([
      'office_achievements',
      'office_agents',
      'office_tasks'
    ])
    reopened.close()
  })
})

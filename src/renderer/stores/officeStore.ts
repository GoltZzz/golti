import { create } from 'zustand'
import {
  OfficeAgent,
  OfficeTask,
  OfficeEnvelope,
  OfficeDesk,
  AgentRole,
  AgentStatus,
  AgentAvatarConfig,
  TaskPriority,
  TaskStatus,
  StreamChunkPayload,
  ResearchStep
} from '../../shared/types'
import type { DecorKey } from '../components/office/isometric/IsometricFloorRenderer'
import {
  seatForDesk,
  COFFEE_BAR_GRID,
  WATER_COOLER_GRID,
  WHITEBOARD_GRID,
  RESEARCH_WHITEBOARD_GRID,
  HOLO_TABLE_GRID,
  SERVER_RACK_GRIDS
} from '../components/office/isometric/IsometricFloorRenderer'
import {
  findOfficePath,
  getFacingDirection
} from '../components/office/isometric/OfficePathfinding'
import {
  decorUnlockedAt,
  totalOfficeXP,
  evaluateAchievements,
  getAchievement,
  OFFICE_CONVERSATION_PREFIX,
  type AchievementEvent
} from '../../shared/office-achievements'
import { seedPendingStepsFromPlan } from '../../shared/research-progress'
import { officeApi, hasInferenceBridge, hasPersistenceBridge } from './officeApi'

const RESEARCH_STEP_LABEL: Record<ResearchStep['status'], string> = {
  pending: 'Queued',
  searching: 'Searching',
  reading: 'Reading',
  done: 'Done',
  error: 'Failed'
}

export type LightingMode = 'day' | 'night'

export interface OfficeState {
  agents: OfficeAgent[]
  tasks: OfficeTask[]
  envelopes: OfficeEnvelope[]
  desks: OfficeDesk[]
  selectedAgentId: string | null
  isBlackboardOpen: boolean
  isHireModalOpen: boolean
  studioMomentum: number // 0 to 100
  isSimulationActive: boolean
  lightingMode: LightingMode
  /** Office decor unlocked by cumulative studio XP. */
  unlockedDecor: DecorKey[]

  // Selection & UI modals
  setSelectedAgentId: (id: string | null) => void
  setIsBlackboardOpen: (open: boolean) => void
  setIsHireModalOpen: (open: boolean) => void
  toggleSimulation: () => void
  toggleLightingMode: () => void

  // Agent Operations
  hireAgent: (params: {
    name: string
    role: AgentRole
    roleTitle?: string
    avatar?: Partial<AgentAvatarConfig>
    model?: string
    providerId?: string
    systemPrompt?: string
    assignedSkillIds?: string[]
  }) => OfficeAgent
  updateAgent: (id: string, updates: Partial<OfficeAgent>) => void
  dismissAgent: (id: string) => void
  setAgentStatus: (id: string, status: AgentStatus, message?: string) => void
  addAgentLog: (
    agentId: string,
    type: 'thought' | 'tool_call' | 'message' | 'system' | 'error' | 'success',
    content: string
  ) => void
  addAgentXP: (id: string, amount: number) => void

  // Task Operations
  createTask: (params: {
    title: string
    description?: string
    priority?: TaskPriority
    assignedAgentId?: string
    createdBy?: string
  }) => OfficeTask
  updateTaskStatus: (taskId: string, status: TaskStatus, resultSnippet?: string) => void
  assignTask: (taskId: string, agentId: string) => void
  deleteTask: (taskId: string) => void

  // Interactive & Gamification Actions
  dispatchEnvelope: (
    fromAgentId: string,
    toAgentId: string,
    message: string,
    type?: OfficeEnvelope['type']
  ) => void
  sendAgentToCoffee: (agentId: string) => void
  returnAgentToDesk: (agentId: string) => void
  sendDirectMessageToAgent: (agentId: string, prompt: string) => Promise<void>
  triggerTeamMeeting: () => void
  /** Refill every agent's token allowance and wake anyone on forced break. */
  resetShift: () => void
  unlockAchievements: (agentId: string, event: AchievementEvent) => void

  // Persistence
  /** Load agents and tasks from SQLite, seeding a first-run office if empty. */
  hydrate: () => Promise<void>

  // Real inference plumbing
  /** Subscribe to ai:stream-chunk. Returns an unsubscribe fn. */
  subscribeToStreams: () => () => void
  /** Route a single stream chunk onto the floor. Exposed for tests. */
  handleStreamChunk: (chunk: StreamChunkPayload) => void
  /** Start a real generation for a task and register it. */
  runTask: (taskId: string, agentId: string) => Promise<void>
  /** Abort whatever the agent is currently running. */
  stopAgent: (agentId: string) => Promise<void>

  // Tick / Simulation
  /** Advance the simulation one step. `snap` finishes all motion immediately. */
  tick: (options?: { snap?: boolean }) => void
  /** True while anything on the floor still needs animating. */
  hasPendingMotion: () => boolean
  resetToDefaults: () => void
}

const DEFAULT_DESKS: OfficeDesk[] = [
  {
    id: 'desk-director',
    name: "Director's Suite",
    zone: 'director',
    x: 3,
    y: 3,
    orientation: 'south',
    screens: 3
  },
  {
    id: 'desk-coder',
    name: 'Dev Station Alpha',
    zone: 'bullpen',
    x: 11,
    y: 3,
    orientation: 'south',
    screens: 3
  },
  {
    id: 'desk-reviewer',
    name: 'QA & Review Bench',
    zone: 'bullpen',
    x: 13,
    y: 3,
    orientation: 'south',
    screens: 2
  },
  {
    id: 'desk-extra-1',
    name: 'Satellite Desk 1',
    zone: 'bullpen',
    x: 15,
    y: 3,
    orientation: 'south',
    screens: 1
  },
  {
    id: 'desk-extra-2',
    name: 'Satellite Desk 2',
    zone: 'bullpen',
    x: 11,
    y: 6,
    orientation: 'north',
    screens: 1
  },
  {
    id: 'desk-extra-3',
    name: 'Satellite Desk 3',
    zone: 'bullpen',
    x: 13,
    y: 6,
    orientation: 'north',
    screens: 1
  },
  {
    id: 'desk-researcher',
    name: 'Research Pod',
    zone: 'research',
    x: 11,
    y: 11,
    orientation: 'south',
    screens: 2
  },
  {
    id: 'desk-extra-4',
    name: 'Research Pod B',
    zone: 'research',
    x: 14,
    y: 11,
    orientation: 'south',
    screens: 1
  },
  {
    id: 'desk-devops',
    name: 'DevOps & Engine Console',
    zone: 'server',
    x: 3,
    y: 17,
    orientation: 'north',
    screens: 3
  }
]

const deskById = new Map(DEFAULT_DESKS.map((d) => [d.id, d]))
function seatOf(deskId: string): { x: number; y: number } {
  const desk = deskById.get(deskId)
  return desk ? seatForDesk(desk) : { x: 0, y: 0 }
}

export const COFFEE_MACHINE_POS = COFFEE_BAR_GRID
export const MEETING_TABLE_POS = HOLO_TABLE_GRID
export const SERVER_ROOM_POS = SERVER_RACK_GRIDS[0]
export { WHITEBOARD_GRID as WHITEBOARD_POS } from '../components/office/isometric/IsometricFloorRenderer'

const DEFAULT_TOKEN_BUDGET = 120000

function makeStarterAgent(
  partial: Omit<
    OfficeAgent,
    | 'status'
    | 'level'
    | 'xp'
    | 'xpToNextLevel'
    | 'stats'
    | 'logs'
    | 'memories'
    | 'tokenBudget'
    | 'tokensUsed'
    | 'unlockedAchievements'
  >
): OfficeAgent {
  return {
    ...partial,
    status: 'idle',
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
    tokenBudget: DEFAULT_TOKEN_BUDGET,
    tokensUsed: 0,
    unlockedAchievements: []
  }
}

/**
 * A brand-new office. Progression starts at zero - nothing here claims work
 * that has not actually happened.
 */
const STARTER_AGENTS: OfficeAgent[] = [
  makeStarterAgent({
    id: 'agent-alex',
    name: 'Alex Rivera',
    role: 'orchestrator',
    roleTitle: 'Studio Director & Orchestrator',
    avatar: {
      skinColor: '#f7d0b5',
      hairColor: '#2b211b',
      outfitColor: '#e06c75',
      accentColor: '#e5c07b',
      hairstyle: 'slick',
      outfitStyle: 'blazer',
      accessory: 'glasses',
      iconName: 'Crown'
    },
    deskId: 'desk-director',
    position: seatOf('desk-director'),
    model: 'gpt-4o',
    providerId: 'openai',
    temperature: 0.7,
    systemPrompt:
      'You are Alex Rivera, Lead AI Studio Director. You break down complex user objectives into atomic tasks, assign them to specialist agents, and monitor execution quality.',
    assignedSkillIds: []
  }),
  makeStarterAgent({
    id: 'agent-kai',
    name: 'Kai Chen',
    role: 'coder',
    roleTitle: 'Principal Code Crafter',
    avatar: {
      skinColor: '#fcd2b0',
      hairColor: '#1a1a24',
      outfitColor: '#61afef',
      accentColor: '#56b6c2',
      hairstyle: 'short',
      outfitStyle: 'tech_tee',
      accessory: 'headphones',
      iconName: 'Code2'
    },
    deskId: 'desk-coder',
    position: seatOf('desk-coder'),
    model: 'claude-3-7-sonnet',
    providerId: 'anthropic',
    temperature: 0.2,
    systemPrompt:
      'You are Kai Chen, expert TypeScript and Systems Architect. You write robust, clean, fully-typed code with high attention to performance and elegant design patterns.',
    assignedSkillIds: []
  }),
  makeStarterAgent({
    id: 'agent-maya',
    name: 'Maya Lin',
    role: 'researcher',
    roleTitle: 'Deep Research Analyst',
    avatar: {
      skinColor: '#d6a374',
      hairColor: '#3a271d',
      outfitColor: '#98c379',
      accentColor: '#e5c07b',
      hairstyle: 'ponytail',
      outfitStyle: 'turtleneck',
      accessory: 'laptop',
      iconName: 'Search'
    },
    deskId: 'desk-researcher',
    position: seatOf('desk-researcher'),
    model: 'gemini-2.0-flash',
    providerId: 'google',
    temperature: 0.4,
    systemPrompt:
      'You are Maya Lin, Deep Research and Knowledge Specialist. You synthesize multi-source documentation, extract semantic embeddings, and surface critical insights.',
    assignedSkillIds: []
  }),
  makeStarterAgent({
    id: 'agent-sam',
    name: 'Sam Vance',
    role: 'reviewer',
    roleTitle: 'Lead QA & Bug Hunter',
    avatar: {
      skinColor: '#ffdfc4',
      hairColor: '#7a4220',
      outfitColor: '#c678dd',
      accentColor: '#e06c75',
      hairstyle: 'tousled',
      outfitStyle: 'hoodie',
      accessory: 'hoodie',
      iconName: 'ShieldCheck'
    },
    deskId: 'desk-reviewer',
    position: seatOf('desk-reviewer'),
    model: 'llama-3.3-70b',
    providerId: 'golti-engine',
    temperature: 0.1,
    systemPrompt:
      'You are Sam Vance, precision QA and Code Reviewer. You check for edge cases, regression vulnerabilities, and enforce comprehensive test coverage.',
    assignedSkillIds: []
  })
]

/** Suggested first tasks. Nothing is pre-marked as done. */
const STARTER_TASKS: OfficeTask[] = [
  {
    id: 'task-1',
    title: 'Summarize the architecture of this codebase',
    description: 'Walk the main/renderer/shared split and report how the process boundary works.',
    priority: 'medium',
    status: 'backlog',
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'task-2',
    title: 'Research quantization tradeoffs for 16GB unified memory',
    description: 'Compare Q4_K_M, Q5_K_M and Q6_K for 7B-14B models on Apple Silicon.',
    priority: 'low',
    status: 'backlog',
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// ==========================================
// Live generation registry
//
// These map real generations onto the floor. They live outside the store
// because they are transport bookkeeping, not rendered state.
// ==========================================

const agentByGeneration = new Map<string, string>()
const generationByAgent = new Map<string, string>()
const taskByGeneration = new Map<string, string>()
const tokensThisRun = new Map<string, number>()
const artifactsSeen = new Map<string, Set<string>>()
const lastThoughtByAgent = new Map<string, string>()
const artifactCountByAgent = new Map<string, number>()
const researchStepsByAgent = new Map<string, ResearchStep[]>()

/** Exposed so tests can start from a clean registry. */
export function __resetOfficeRuntime(): void {
  agentByGeneration.clear()
  generationByAgent.clear()
  taskByGeneration.clear()
  tokensThisRun.clear()
  artifactsSeen.clear()
  lastThoughtByAgent.clear()
  artifactCountByAgent.clear()
  researchStepsByAgent.clear()
}

export function getResearchStepsForAgent(agentId: string): ResearchStep[] {
  return researchStepsByAgent.get(agentId) ?? []
}

export function isAgentRunning(agentId: string): boolean {
  return generationByAgent.has(agentId)
}

type Getter = () => OfficeState
type Setter = (
  partial: Partial<OfficeState> | ((state: OfficeState) => Partial<OfficeState>)
) => void

function lastMeaningfulLine(text: string | undefined): string {
  if (!text) return ''
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const last = lines[lines.length - 1] ?? ''
  return last.length > 90 ? `${last.slice(0, 87)}...` : last
}

function taskTitleFor(get: Getter, agent: OfficeAgent): string | undefined {
  if (!agent.currentTaskId) return undefined
  return get().tasks.find((t) => t.id === agent.currentTaskId)?.title
}

function bumpToolCall(set: Setter, agentId: string): void {
  set((state) => ({
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, stats: { ...a.stats, toolCallsCount: a.stats.toolCallsCount + 1 } } : a
    )
  }))
}

/**
 * Starts a real generation on the agent's own conversation and registers it so
 * incoming stream chunks can be routed back to this agent.
 */
async function dispatchGeneration(
  get: Getter,
  set: Setter,
  agentId: string,
  prompt: string,
  taskId: string | undefined
): Promise<void> {
  const agent = get().agents.find((a) => a.id === agentId)
  if (!agent) return

  if (generationByAgent.has(agentId)) {
    get().addAgentLog(agentId, 'system', 'Already running - finish or stop the current run first.')
    return
  }

  if (agent.tokenBudget > 0 && agent.tokensUsed >= agent.tokenBudget) {
    get().addAgentLog(agentId, 'system', 'Out of token budget. Reset the shift to continue.')
    get().sendAgentToCoffee(agentId)
    return
  }

  if (!hasInferenceBridge()) {
    get().addAgentLog(agentId, 'error', 'Inference bridge unavailable - cannot start work.')
    get().setAgentStatus(agentId, 'error', 'No inference bridge')
    return
  }

  // Local-engine agents share a single llama-server slot; say so rather than
  // animating work that is really just queued.
  if (agent.providerId === 'golti-engine') {
    const busyLocal = get().agents.some(
      (a) => a.id !== agentId && a.providerId === 'golti-engine' && generationByAgent.has(a.id)
    )
    if (busyLocal) {
      get().setAgentStatus(agentId, 'idle', 'Waiting for engine slot')
      get().addAgentLog(agentId, 'system', 'Queued: the local engine is serving another agent.')
    }
  }

  const desk = get().desks.find((d) => d.id === agent.deskId)
  if (desk) {
    const seat = seatForDesk(desk)
    const waypoints = findOfficePath(agent.position, seat)
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              ambientActivity: 'none',
              ambientTimer: 0,
              pathWaypoints: waypoints,
              targetPosition: seat
            }
          : a
      )
    }))
  }

  let conversationId = agent.conversationId
  try {
    if (!conversationId) {
      conversationId = `${OFFICE_CONVERSATION_PREFIX}${agentId}-${Date.now()}`
      await officeApi.createConversation({
        id: conversationId,
        title: `${agent.name} · ${agent.roleTitle}`,
        model: agent.model,
        providerId: agent.providerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        archived: false,
        systemPrompt: agent.systemPrompt
      })
      set((state) => ({
        agents: state.agents.map((a) => (a.id === agentId ? { ...a, conversationId } : a))
      }))
      void officeApi.upsertAgent({ ...agent, conversationId })
    }

    const result = await officeApi.sendMessage({
      conversationId,
      content: prompt,
      model: agent.model,
      providerId: agent.providerId,
      systemPrompt: agent.systemPrompt,
      deepResearchEnabled: agent.role === 'researcher',
      webSearchEnabled: agent.role === 'researcher',
      generationSettings: agent.temperature !== undefined ? { temperature: agent.temperature } : undefined
    })

    agentByGeneration.set(result.generationId, agentId)
    generationByAgent.set(agentId, result.generationId)
    if (taskId) taskByGeneration.set(result.generationId, taskId)

    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: 'working',
              statusMessage: taskId
                ? `Working on: ${state.tasks.find((t) => t.id === taskId)?.title ?? 'task'}`
                : 'Working on your directive',
              currentTaskId: taskId ?? a.currentTaskId,
              stats: { ...a.stats, messagesSent: a.stats.messagesSent + 1 }
            }
          : a
      ),
      tasks: taskId
        ? state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'in_progress',
                  assignedAgentId: agentId,
                  generationId: result.generationId,
                  messageId: result.assistantMsgId,
                  updatedAt: Date.now()
                }
              : t
          )
        : state.tasks
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    get().addAgentLog(agentId, 'error', `Failed to start generation: ${message}`)
    get().setAgentStatus(agentId, 'error', 'Could not start')
  }
}

/** Settles token spend, XP, achievements and task status once a run ends. */
function finishRun(
  get: Getter,
  set: Setter,
  agentId: string,
  generationId: string,
  { failed }: { failed: boolean }
): void {
  const spent = tokensThisRun.get(generationId) ?? 0
  const taskId = taskByGeneration.get(generationId)
  const steps = researchStepsByAgent.get(agentId) ?? []
  const sourcesFound = steps.reduce((sum, s) => sum + s.sourcesFound, 0)

  agentByGeneration.delete(generationId)
  generationByAgent.delete(agentId)
  taskByGeneration.delete(generationId)
  tokensThisRun.delete(generationId)
  artifactsSeen.delete(generationId)
  lastThoughtByAgent.delete(agentId)

  set((state) => ({
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, tokensUsed: a.tokensUsed + spent } : a
    )
  }))

  if (failed) return

  if (taskId) {
    const task = get().tasks.find((t) => t.id === taskId)
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: 'review', updatedAt: Date.now(), generationId: undefined }
          : t
      ),
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: 'idle',
              statusMessage: 'Awaiting review.',
              currentTaskId: undefined,
              stats: { ...a.stats, tasksCompleted: a.stats.tasksCompleted + 1 }
            }
          : a
      )
    }))

    const researchBonus = sourcesFound > 0 ? Math.min(150, sourcesFound * 15) : 0
    get().addAgentXP(agentId, 150 + researchBonus)
    get().addAgentLog(
      agentId,
      'success',
      `Finished "${task?.title ?? 'task'}" using ${spent.toLocaleString()} tokens. Ready for review.`
    )
    get().unlockAchievements(agentId, {
      type: 'task_completed',
      tokensUsed: spent,
      sourcesFound,
      at: Date.now()
    })
  } else {
    get().setAgentStatus(agentId, 'idle', 'Directive complete.')
    get().addAgentXP(agentId, 60)
    get().addAgentLog(agentId, 'success', `Directive complete (${spent.toLocaleString()} tokens).`)
  }

  researchStepsByAgent.delete(agentId)

  const after = get().agents.find((a) => a.id === agentId)
  if (after) {
    get().unlockAchievements(agentId, { type: 'level_up' })
    if (after.tokenBudget > 0 && after.tokensUsed >= after.tokenBudget) {
      get().addAgentLog(agentId, 'system', 'Token budget exhausted - taking a forced break.')
      get().sendAgentToCoffee(agentId)
    }
  }
}

const ROLE_PRESETS: Record<
  AgentRole,
  { title: string; defaultModel: string; defaultProvider: string; avatar: Partial<AgentAvatarConfig> }
> = {
  orchestrator: {
    title: 'Studio Director & Orchestrator',
    defaultModel: 'gpt-4o',
    defaultProvider: 'openai',
    avatar: {
      outfitColor: '#e06c75',
      accentColor: '#e5c07b',
      hairstyle: 'slick',
      outfitStyle: 'blazer',
      accessory: 'glasses',
      iconName: 'Crown'
    }
  },
  coder: {
    title: 'Fullstack Software Engineer',
    defaultModel: 'claude-3-7-sonnet',
    defaultProvider: 'anthropic',
    avatar: {
      outfitColor: '#61afef',
      accentColor: '#56b6c2',
      hairstyle: 'short',
      outfitStyle: 'tech_tee',
      accessory: 'headphones',
      iconName: 'Code2'
    }
  },
  researcher: {
    title: 'Deep Research Analyst',
    defaultModel: 'gemini-2.0-flash',
    defaultProvider: 'google',
    avatar: {
      outfitColor: '#98c379',
      accentColor: '#e5c07b',
      hairstyle: 'ponytail',
      outfitStyle: 'turtleneck',
      accessory: 'laptop',
      iconName: 'Search'
    }
  },
  reviewer: {
    title: 'QA & Security Reviewer',
    defaultModel: 'llama-3.3-70b',
    defaultProvider: 'golti-engine',
    avatar: {
      outfitColor: '#c678dd',
      accentColor: '#e06c75',
      hairstyle: 'tousled',
      outfitStyle: 'hoodie',
      accessory: 'hoodie',
      iconName: 'ShieldCheck'
    }
  },
  devops: {
    title: 'DevOps & Engine Runner',
    defaultModel: 'qwen2.5-coder-32b',
    defaultProvider: 'golti-engine',
    avatar: {
      outfitColor: '#d19a66',
      accentColor: '#56b6c2',
      hairstyle: 'short',
      outfitStyle: 'jacket',
      accessory: 'coffee',
      iconName: 'Terminal'
    }
  },
  custom: {
    title: 'Specialist AI Agent',
    defaultModel: 'default-model',
    defaultProvider: 'openai',
    avatar: {
      outfitColor: '#abb2bf',
      accentColor: '#e06c75',
      hairstyle: 'short',
      outfitStyle: 'tech_tee',
      accessory: 'glasses',
      iconName: 'Bot'
    }
  }
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  agents: cloneSeed(STARTER_AGENTS),
  tasks: cloneSeed(STARTER_TASKS),
  envelopes: [],
  desks: cloneSeed(DEFAULT_DESKS),
  selectedAgentId: null,
  isBlackboardOpen: false,
  isHireModalOpen: false,
  studioMomentum: 20,
  isSimulationActive: true,
  lightingMode: 'night',
  unlockedDecor: [],

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setIsBlackboardOpen: (open) => set({ isBlackboardOpen: open }),
  setIsHireModalOpen: (open) => set({ isHireModalOpen: open }),
  toggleSimulation: () => set((state) => ({ isSimulationActive: !state.isSimulationActive })),
  toggleLightingMode: () =>
    set((state) => ({ lightingMode: state.lightingMode === 'night' ? 'day' : 'night' })),

  hireAgent: ({
    name,
    role,
    roleTitle,
    avatar = {},
    model,
    providerId,
    systemPrompt,
    assignedSkillIds = []
  }) => {
    const preset = ROLE_PRESETS[role]
    const id = `agent-${Date.now()}`

    // Find first unoccupied desk or default to extra desk
    const currentAgents = get().agents
    const occupiedDeskIds = new Set(currentAgents.map((a) => a.deskId))
    const availableDesk = get().desks.find((d) => !occupiedDeskIds.has(d.id)) || get().desks[0]

    const newAgent: OfficeAgent = {
      id,
      name,
      role,
      roleTitle: roleTitle || preset.title,
      avatar: {
        skinColor: avatar.skinColor || '#fcd2b0',
        hairColor: avatar.hairColor || '#2b211b',
        outfitColor: avatar.outfitColor || preset.avatar.outfitColor || '#61afef',
        accentColor: avatar.accentColor || preset.avatar.accentColor || '#56b6c2',
        hairstyle: avatar.hairstyle || preset.avatar.hairstyle || 'short',
        outfitStyle: avatar.outfitStyle || preset.avatar.outfitStyle || 'tech_tee',
        accessory: avatar.accessory || preset.avatar.accessory || 'glasses',
        iconName: avatar.iconName || preset.avatar.iconName || 'Bot'
      },
      status: 'idle',
      statusMessage: 'Reporting for duty at new workstation',
      deskId: availableDesk.id,
      position: seatForDesk(availableDesk),
      model: model || preset.defaultModel,
      providerId: providerId || preset.defaultProvider,
      temperature: 0.5,
      systemPrompt:
        systemPrompt ||
        `You are ${name}, working as ${roleTitle || preset.title} in the Golti AI Studio workspace.`,
      assignedSkillIds,
      level: 1,
      xp: 0,
      xpToNextLevel: 250,
      stats: {
        tasksCompleted: 0,
        messagesSent: 0,
        toolCallsCount: 0,
        coffeeBreaksCount: 0
      },
      logs: [
        {
          id: `log-spawn-${Date.now()}`,
          timestamp: Date.now(),
          type: 'system',
          content: `${name} joined the studio as ${roleTitle || preset.title}.`
        }
      ],
      memories: [],
      tokenBudget: DEFAULT_TOKEN_BUDGET,
      tokensUsed: 0,
      unlockedAchievements: []
    }

    set((state) => ({
      agents: [...state.agents, newAgent],
      isHireModalOpen: false,
      selectedAgentId: newAgent.id
    }))

    // Dispatch welcome envelope from director if exists
    const director = currentAgents.find((a) => a.role === 'orchestrator')
    if (director) {
      setTimeout(() => {
        get().dispatchEnvelope(
          director.id,
          newAgent.id,
          `Welcome to the studio, ${newAgent.name}! Check the blackboard for open tickets.`,
          'chat_ping'
        )
      }, 500)
    }

    return newAgent
  },

  updateAgent: (id, updates) => {
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a))
    }))
  },

  dismissAgent: (id) => {
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId
    }))
  },

  setAgentStatus: (id, status, message) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              statusMessage: message !== undefined ? message : a.statusMessage
            }
          : a
      )
    }))
  },

  addAgentLog: (agentId, type, content) => {
    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type,
      content
    }

    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              logs: [newLog, ...a.logs].slice(0, 80) // Keep last 80 logs
            }
          : a
      )
    }))
  },

  addAgentXP: (id, amount) => {
    set((state) => {
      const agents = state.agents.map((a) => {
        if (a.id !== id) return a
        let nextXP = a.xp + amount
        let nextLevel = a.level
        let nextXPToNext = a.xpToNextLevel

        if (nextXP >= nextXPToNext) {
          nextLevel += 1
          nextXP = nextXP - nextXPToNext
          nextXPToNext = Math.round(nextXPToNext * 1.35)
          // Add level up log
          setTimeout(() => {
            get().addAgentLog(
              id,
              'success',
              `🎉 Level Up! ${a.name} achieved Level ${nextLevel} (${a.roleTitle})!`
            )
          }, 0)
        }

        return {
          ...a,
          level: nextLevel,
          xp: nextXP,
          xpToNextLevel: nextXPToNext
        }
      })

      return { agents, unlockedDecor: decorUnlockedAt(totalOfficeXP(agents)) }
    })
  },

  createTask: ({
    title,
    description,
    priority = 'medium',
    assignedAgentId,
    createdBy = 'user'
  }) => {
    const newTask: OfficeTask = {
      id: `task-${Date.now()}`,
      title,
      description,
      priority,
      status: assignedAgentId ? 'in_progress' : 'backlog',
      assignedAgentId,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    set((state) => ({
      tasks: [newTask, ...state.tasks]
    }))

    if (assignedAgentId) {
      get().setAgentStatus(assignedAgentId, 'working', `Working on: ${title}`)
      get().addAgentLog(assignedAgentId, 'thought', `Assigned task: "${title}". Initializing plan.`)
    }

    return newTask
  },

  updateTaskStatus: (taskId, status, resultSnippet) => {
    const now = Date.now()
    const task = get().tasks.find((t) => t.id === taskId)

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status,
              updatedAt: now,
              completedAt: status === 'completed' ? now : t.completedAt,
              resultSnippet: resultSnippet || t.resultSnippet
            }
          : t
      )
    }))

    if (status === 'completed' && task?.assignedAgentId) {
      get().addAgentXP(task.assignedAgentId, 150)
      get().addAgentLog(
        task.assignedAgentId,
        'success',
        `Completed task: "${task.title}". Results recorded.`
      )
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === task.assignedAgentId
            ? {
                ...a,
                status: 'idle',
                statusMessage: 'Task finished. Awaiting next directive.',
                currentTaskId: undefined,
                stats: {
                  ...a.stats,
                  tasksCompleted: a.stats.tasksCompleted + 1
                }
              }
            : a
        )
      }))
    }
  },

  assignTask: (taskId, agentId) => {
    const task = get().tasks.find((t) => t.id === taskId)
    const agent = get().agents.find((a) => a.id === agentId)
    if (!task || !agent) return

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, assignedAgentId: agentId, status: 'in_progress' } : t
      ),
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: 'working',
              currentTaskId: taskId,
              statusMessage: `Working on: ${task.title}`
            }
          : a
      )
    }))

    get().addAgentLog(agentId, 'thought', `Picked up task: "${task.title}".`)
    void get().runTask(taskId, agentId)
  },

  deleteTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId)
    }))
  },

  dispatchEnvelope: (fromAgentId, toAgentId, message, type = 'chat_ping') => {
    const fromAgent = get().agents.find((a) => a.id === fromAgentId)
    const toAgent = get().agents.find((a) => a.id === toAgentId)
    if (!fromAgent || !toAgent) return

    const newEnvelope: OfficeEnvelope = {
      id: `env-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fromAgentId,
      toAgentId,
      fromPos: { ...fromAgent.position },
      toPos: { ...toAgent.position },
      progress: 0,
      message,
      type,
      createdAt: Date.now()
    }

    set((state) => ({
      envelopes: [...state.envelopes, newEnvelope],
      agents: state.agents.map((a) =>
        a.id === fromAgentId
          ? {
              ...a,
              stats: { ...a.stats, messagesSent: a.stats.messagesSent + 1 }
            }
          : a
      )
    }))

    get().addAgentLog(fromAgentId, 'message', `Sent message to ${toAgent.name}: "${message}"`)
  },

  sendAgentToCoffee: (agentId) => {
    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return
    const target = {
      x: COFFEE_MACHINE_POS.x + (Math.random() * 0.6 - 0.3),
      y: COFFEE_MACHINE_POS.y + (Math.random() * 0.6 - 0.3)
    }
    const waypoints = findOfficePath(agent.position, target)

    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: 'break',
              statusMessage: 'Grabbing fresh espresso at the Coffee Bar ☕',
              ambientActivity: 'coffee_break',
              ambientTimer: 15,
              pathWaypoints: waypoints,
              targetPosition: target,
              stats: {
                ...a.stats,
                coffeeBreaksCount: a.stats.coffeeBreaksCount + 1
              }
            }
          : a
      )
    }))

    get().addAgentLog(agentId, 'thought', 'Stepping away to the coffee lounge for a quick recharge.')
    get().unlockAchievements(agentId, { type: 'break_taken' })
  },

  returnAgentToDesk: (agentId) => {
    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return
    const desk = get().desks.find((d) => d.id === agent.deskId) || get().desks[0]
    const seat = seatForDesk(desk)
    const waypoints = findOfficePath(agent.position, seat)

    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: 'idle',
              statusMessage: 'Back at desk. Ready for work.',
              ambientActivity: 'none',
              ambientTimer: 0,
              pathWaypoints: waypoints,
              targetPosition: seat
            }
          : a
      )
    }))

    get().addAgentLog(agentId, 'thought', 'Returned to workstation.')
  },

  sendDirectMessageToAgent: async (agentId, prompt) => {
    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return

    get().addAgentLog(agentId, 'message', `User directive: "${prompt}"`)
    await dispatchGeneration(get, set, agentId, prompt, undefined)
  },

  runTask: async (taskId, agentId) => {
    const task = get().tasks.find((t) => t.id === taskId)
    if (!task) return

    const prompt = task.description ? `${task.title}\n\n${task.description}` : task.title
    await dispatchGeneration(get, set, agentId, prompt, taskId)
  },

  stopAgent: async (agentId) => {
    const generationId = generationByAgent.get(agentId)
    if (!generationId) return

    await officeApi.cancelGeneration(generationId)
    generationByAgent.delete(agentId)
    agentByGeneration.delete(generationId)

    get().addAgentLog(agentId, 'system', 'Generation stopped by user.')
    get().setAgentStatus(agentId, 'idle', 'Stopped.')
    get().returnAgentToDesk(agentId)
  },

  hydrate: async () => {
    if (!hasPersistenceBridge()) return

    try {
      const [storedAgents, storedTasks] = await Promise.all([
        officeApi.listAgents(),
        officeApi.listTasks()
      ])

      if (storedAgents.length === 0) {
        // First run: persist the seed office so progression starts sticking.
        const seeded = cloneSeed(STARTER_AGENTS)
        const seededTasks = cloneSeed(STARTER_TASKS)
        set({ agents: seeded, tasks: seededTasks })
        await Promise.all([
          ...seeded.map((a) => officeApi.upsertAgent(a)),
          ...seededTasks.map((t) => officeApi.upsertTask(t))
        ])
        return
      }

      // Desks are layout, not data - reattach positions from the current floor.
      const desks = get().desks
      const agents = storedAgents.map((a) => {
        const desk = desks.find((d) => d.id === a.deskId) ?? desks[0]
        return { ...a, position: desk ? seatForDesk(desk) : { x: 0, y: 0 } }
      })

      set({
        agents,
        tasks: storedTasks,
        unlockedDecor: decorUnlockedAt(totalOfficeXP(agents))
      })
    } catch (err) {
      console.warn('[office] hydrate failed', err)
    }
  },

  subscribeToStreams: () => {
    return officeApi.onStreamChunk((chunk) => get().handleStreamChunk(chunk))
  },

  handleStreamChunk: (chunk) => {
    const generationId = chunk.generationId
    if (!generationId) return
    const agentId = agentByGeneration.get(generationId)
    if (!agentId) return

    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return

    switch (chunk.eventType) {
      case 'thinking': {
        const line = lastMeaningfulLine(chunk.reasoningContent ?? chunk.thinkingDelta)
        get().setAgentStatus(agentId, 'thinking', line || 'Reasoning')
        if (line && line !== lastThoughtByAgent.get(agentId)) {
          lastThoughtByAgent.set(agentId, line)
          get().addAgentLog(agentId, 'thought', line)
        }
        break
      }

      case 'text': {
        if (agent.status !== 'working') {
          get().setAgentStatus(agentId, 'working', taskTitleFor(get, agent) ?? 'Writing response')
        }
        break
      }

      case 'search': {
        const status = chunk.searchStatus
        const detail = status?.message || 'Searching the web'
        get().setAgentStatus(agentId, 'working', detail)
        if (status?.state === 'success') {
          get().addAgentLog(
            agentId,
            'tool_call',
            `Web search returned ${status.resultCount ?? 0} result${status.resultCount === 1 ? '' : 's'}`
          )
          bumpToolCall(set, agentId)
        }
        break
      }

      case 'research-plan': {
        const plan = chunk.researchPlan
        if (!plan) break
        researchStepsByAgent.set(agentId, seedPendingStepsFromPlan(plan))
        get().setAgentStatus(
          agentId,
          'thinking',
          `Planned ${plan.subQueries.length} research threads`
        )
        get().addAgentLog(
          agentId,
          'thought',
          `Research plan: ${plan.subQueries.map((q) => `"${q}"`).join(', ')}`
        )
        break
      }

      case 'research-step': {
        const step = chunk.researchStep
        if (!step) break
        const steps = researchStepsByAgent.get(agentId) ?? []
        const idx = steps.findIndex((s) => s.stepIndex === step.stepIndex)
        researchStepsByAgent.set(
          agentId,
          idx >= 0 ? steps.map((s, i) => (i === idx ? step : s)) : [...steps, step]
        )

        get().setAgentStatus(
          agentId,
          'working',
          `${RESEARCH_STEP_LABEL[step.status]} ${step.stepIndex}/${step.totalSteps}: ${step.query}`
        )
        if (step.status === 'done') {
          get().addAgentLog(
            agentId,
            'tool_call',
            `Read ${step.sourcesFound} source${step.sourcesFound === 1 ? '' : 's'} for "${step.query}"`
          )
          bumpToolCall(set, agentId)
        } else if (step.status === 'error') {
          get().addAgentLog(agentId, 'error', `Research step failed: ${step.error ?? step.query}`)
        }
        break
      }

      case 'citation': {
        if (chunk.citation) {
          get().addAgentLog(agentId, 'message', `Cited: ${chunk.citation.title || chunk.citation.url}`)
        }
        break
      }

      case 'artifact':
      case 'shell': {
        const artifact = chunk.artifact ?? chunk.shell
        if (!artifact) break
        // Only count once - the runtime emits both event names for compatibility.
        const seen = artifactsSeen.get(generationId) ?? new Set<string>()
        if (seen.has(artifact.id)) break
        seen.add(artifact.id)
        artifactsSeen.set(generationId, seen)

        artifactCountByAgent.set(agentId, (artifactCountByAgent.get(agentId) ?? 0) + 1)
        get().addAgentLog(agentId, 'success', `Produced artifact: ${artifact.title}`)
        get().addAgentXP(agentId, 40)
        get().unlockAchievements(agentId, {
          type: 'artifact_produced',
          artifactCount: artifactCountByAgent.get(agentId)
        })

        const reviewer = get().agents.find((a) => a.role === 'reviewer' && a.id !== agentId)
        if (reviewer) {
          get().dispatchEnvelope(agentId, reviewer.id, `Review "${artifact.title}"`, 'code_review')
        }
        break
      }

      case 'usage': {
        if (chunk.usage) {
          const spent = (chunk.usage.promptTokens ?? 0) + (chunk.usage.completionTokens ?? 0)
          tokensThisRun.set(generationId, spent)
        }
        break
      }

      case 'error': {
        get().setAgentStatus(agentId, 'error', chunk.error || 'Generation failed')
        get().addAgentLog(agentId, 'error', chunk.error || 'Generation failed')
        finishRun(get, set, agentId, generationId, { failed: true })
        break
      }

      case 'done': {
        if (chunk.usage) {
          const spent = (chunk.usage.promptTokens ?? 0) + (chunk.usage.completionTokens ?? 0)
          tokensThisRun.set(generationId, spent)
        }
        finishRun(get, set, agentId, generationId, { failed: false })
        break
      }
    }
  },

  resetShift: () => {
    set((state) => ({
      agents: state.agents.map((a) => ({
        ...a,
        tokensUsed: 0,
        status: a.status === 'break' ? 'idle' : a.status,
        statusMessage: a.status === 'break' ? 'Back on shift.' : a.statusMessage
      }))
    }))
    get().agents.forEach((a) => {
      if (a.targetPosition === undefined && a.status === 'idle') get().returnAgentToDesk(a.id)
    })
  },

  unlockAchievements: (agentId, event) => {
    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return

    const unlocked = evaluateAchievements(agent, event)
    if (unlocked.length === 0) return

    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? { ...a, unlockedAchievements: [...a.unlockedAchievements, ...unlocked] }
          : a
      )
    }))

    unlocked.forEach((key) => {
      const def = getAchievement(key)
      if (def) {
        get().addAgentLog(agentId, 'success', `${def.icon} Achievement unlocked: ${def.name}`)
      }
    })
  },

  triggerTeamMeeting: () => {
    const agents = get().agents
    agents.forEach((a, index) => {
      const angle = (index / Math.max(agents.length, 1)) * Math.PI * 2
      const radiusX = 2.2
      const radiusY = 1
      const targetPos = {
        x: MEETING_TABLE_POS.x + Math.cos(angle) * radiusX,
        y: MEETING_TABLE_POS.y + Math.sin(angle) * radiusY
      }
      const waypoints = findOfficePath(a.position, targetPos)

      get().updateAgent(a.id, {
        status: 'meeting',
        statusMessage: 'In studio war-room sync 📋',
        ambientActivity: 'none',
        ambientTimer: 0,
        pathWaypoints: waypoints,
        targetPosition: targetPos
      })
      get().addAgentLog(a.id, 'thought', 'Gathered at holographic conference table for team sync.')
    })
  },

  tick: (options) => {
    const snap = options?.snap === true
    set((state) => {
      // 1. Advance envelopes
      const updatedEnvelopes = state.envelopes
        .map((env) => ({ ...env, progress: snap ? 1 : env.progress + 0.05 }))
        .filter((env) => {
          if (env.progress >= 1) {
            const toAgent = state.agents.find((a) => a.id === env.toAgentId)
            if (toAgent) {
              setTimeout(() => {
                get().addAgentLog(
                  toAgent.id,
                  'message',
                  `Received envelope: "${env.message}"`
                )
              }, 0)
            }
            return false
          }
          return true
        })

      // 2. Advance agents along waypoints & autonomous routines
      const updatedAgents = state.agents.map((agent) => {
        let waypoints = agent.pathWaypoints ? [...agent.pathWaypoints] : []
        let currentTarget = agent.targetPosition

        if (waypoints.length > 0) {
          currentTarget = waypoints[0]
        }

        if (!currentTarget) {
          // Check if agent is currently on an ambient activity timer
          if (agent.ambientTimer !== undefined && agent.ambientTimer > 0) {
            const newTimer = snap ? 0 : Math.max(0, agent.ambientTimer - (1 / 30))
            if (newTimer <= 0 && agent.ambientActivity && agent.ambientActivity !== 'none') {
              // Activity finished - return to desk seat
              const desk = state.desks.find((d) => d.id === agent.deskId)
              const seat = desk ? seatForDesk(desk) : agent.position
              const returnWaypoints = findOfficePath(agent.position, seat)
              return {
                ...agent,
                status: 'idle' as AgentStatus,
                statusMessage: 'Back at desk.',
                ambientActivity: 'none' as const,
                ambientTimer: 0,
                pathWaypoints: returnWaypoints,
                targetPosition: seat
              }
            }
            return {
              ...agent,
              ambientTimer: newTimer
            }
          }
          return agent
        }

        const dx = currentTarget.x - agent.position.x
        const dy = currentTarget.y - agent.position.y
        const dist = Math.hypot(dx, dy)
        const speed = 0.14
        const facingDirection = getFacingDirection(agent.position, currentTarget)

        if (snap) {
          const finalPos = waypoints.length > 0 ? { ...waypoints[waypoints.length - 1] } : { ...currentTarget }
          const desk = state.desks.find((d) => d.id === agent.deskId)
          const seat = desk ? seatForDesk(desk) : finalPos
          const isAtSeat = Math.abs(finalPos.x - seat.x) < 0.2 && Math.abs(finalPos.y - seat.y) < 0.2

          return {
            ...agent,
            position: finalPos,
            targetPosition: undefined,
            pathWaypoints: [],
            facingDirection: isAtSeat && desk ? (desk.orientation === 'north' ? 'north' : 'south') : facingDirection,
            walkFrame: 0,
            ambientTimer: 0
          }
        }

        if (dist <= speed) {
          const nextPos = { ...currentTarget }
          if (waypoints.length > 0) {
            waypoints = waypoints.slice(1)
          }
          const nextTarget = waypoints.length > 0 ? waypoints[0] : undefined

          const desk = state.desks.find((d) => d.id === agent.deskId)
          const seat = desk ? seatForDesk(desk) : nextPos
          const isAtSeat = !nextTarget && Math.abs(nextPos.x - seat.x) < 0.2 && Math.abs(nextPos.y - seat.y) < 0.2

          return {
            ...agent,
            position: nextPos,
            targetPosition: nextTarget,
            pathWaypoints: waypoints,
            facingDirection: isAtSeat && desk ? (desk.orientation === 'north' ? 'north' : 'south') : facingDirection,
            walkFrame: isAtSeat ? 0 : ((agent.walkFrame || 0) + 1) % 4
          }
        }

        return {
          ...agent,
          position: {
            x: agent.position.x + (dx / dist) * speed,
            y: agent.position.y + (dy / dist) * speed
          },
          facingDirection,
          walkFrame: ((agent.walkFrame || 0) + 1) % 4
        }
      })

      // 3. Compute studio momentum
      const workingCount = updatedAgents.filter(
        (a) => a.status === 'working' || a.status === 'thinking' || (a.ambientActivity && a.ambientActivity !== 'none')
      ).length
      const targetMomentum = Math.min(
        100,
        Math.max(20, Math.round((workingCount / Math.max(1, updatedAgents.length)) * 100))
      )
      const momentum = Math.round(state.studioMomentum * 0.95 + targetMomentum * 0.05)

      return {
        envelopes: updatedEnvelopes,
        agents: updatedAgents,
        studioMomentum: momentum
      }
    })
  },

  hasPendingMotion: () => {
    const state = get()
    if (state.envelopes.length > 0) return true
    if (state.agents.some((a) => a.targetPosition || (a.pathWaypoints && a.pathWaypoints.length > 0))) return true
    const workingCount = state.agents.filter(
      (a) => a.status === 'working' || a.status === 'thinking' || (a.ambientActivity && a.ambientActivity !== 'none')
    ).length
    const targetMomentum = Math.min(
      100,
      Math.max(20, Math.round((workingCount / Math.max(1, state.agents.length)) * 100))
    )
    return Math.abs(state.studioMomentum - targetMomentum) > 1
  },

  resetToDefaults: () => {
    set({
      agents: cloneSeed(STARTER_AGENTS),
      tasks: cloneSeed(STARTER_TASKS),
      desks: cloneSeed(DEFAULT_DESKS),
      envelopes: [],
      selectedAgentId: null,
      isBlackboardOpen: false,
      isHireModalOpen: false,
      studioMomentum: 20,
      isSimulationActive: true,
      lightingMode: 'night',
      unlockedDecor: []
    })
    __resetOfficeRuntime()
  }
}))

// ==========================================
// Write-behind persistence
//
// Durable fields are diffed against the previous state and flushed on a short
// debounce, so the hot animation path never touches SQLite.
// ==========================================

const PERSIST_DEBOUNCE_MS = 400

/** Fields worth a database round-trip. Position/status/logs are ephemeral. */
function agentFingerprint(a: OfficeAgent): string {
  return JSON.stringify([
    a.name,
    a.role,
    a.roleTitle,
    a.avatar,
    a.deskId,
    a.model,
    a.providerId,
    a.temperature,
    a.systemPrompt,
    a.assignedSkillIds,
    a.level,
    a.xp,
    a.xpToNextLevel,
    a.stats,
    a.memories,
    a.tokenBudget,
    a.tokensUsed,
    a.conversationId,
    a.unlockedAchievements
  ])
}

function taskFingerprint(t: OfficeTask): string {
  return JSON.stringify([
    t.title,
    t.description,
    t.priority,
    t.status,
    t.assignedAgentId,
    t.completedAt,
    t.resultSnippet
  ])
}

if (typeof window !== 'undefined') {
  const agentPrints = new Map<string, string>()
  const taskPrints = new Map<string, string>()
  const dirtyAgents = new Set<string>()
  const dirtyTasks = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    if (!hasPersistenceBridge()) return
    const { agents, tasks } = useOfficeStore.getState()

    dirtyAgents.forEach((id) => {
      const agent = agents.find((a) => a.id === id)
      if (agent) void officeApi.upsertAgent(agent)
    })
    dirtyTasks.forEach((id) => {
      const task = tasks.find((t) => t.id === id)
      if (task) void officeApi.upsertTask(task)
    })
    dirtyAgents.clear()
    dirtyTasks.clear()
  }

  useOfficeStore.subscribe((state, prev) => {
    if (state.agents !== prev.agents) {
      const liveIds = new Set<string>()
      state.agents.forEach((a) => {
        liveIds.add(a.id)
        const print = agentFingerprint(a)
        if (agentPrints.get(a.id) !== print) {
          agentPrints.set(a.id, print)
          dirtyAgents.add(a.id)
        }
      })
      prev.agents.forEach((a) => {
        if (!liveIds.has(a.id)) {
          agentPrints.delete(a.id)
          dirtyAgents.delete(a.id)
          void officeApi.deleteAgent(a.id)
        }
      })
    }

    if (state.tasks !== prev.tasks) {
      const liveIds = new Set<string>()
      state.tasks.forEach((t) => {
        liveIds.add(t.id)
        const print = taskFingerprint(t)
        if (taskPrints.get(t.id) !== print) {
          taskPrints.set(t.id, print)
          dirtyTasks.add(t.id)
        }
      })
      prev.tasks.forEach((t) => {
        if (!liveIds.has(t.id)) {
          taskPrints.delete(t.id)
          dirtyTasks.delete(t.id)
          void officeApi.deleteTask(t.id)
        }
      })
    }

    if ((dirtyAgents.size > 0 || dirtyTasks.size > 0) && timer === null) {
      timer = setTimeout(flush, PERSIST_DEBOUNCE_MS)
    }
  })
}

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useOfficeStore, isAgentRunning, getResearchStepsForAgent } from './officeStore'
import type { StreamChunkPayload } from '../../shared/types'

describe('useOfficeStore', () => {
  beforeEach(() => {
    useOfficeStore.getState().resetToDefaults()
  })

  it('initializes with starter agents and tasks', () => {
    const state = useOfficeStore.getState()
    expect(state.agents.length).toBeGreaterThanOrEqual(4)
    expect(state.tasks.length).toBeGreaterThanOrEqual(1)
    expect(state.desks.length).toBeGreaterThanOrEqual(5)
    expect(state.studioMomentum).toBeGreaterThan(0)
  })

  it('seeds a fresh office with no fabricated progress', () => {
    useOfficeStore.getState().agents.forEach((agent) => {
      expect(agent.level).toBe(1)
      expect(agent.xp).toBe(0)
      expect(agent.stats.tasksCompleted).toBe(0)
      expect(agent.logs).toEqual([])
      expect(agent.unlockedAchievements).toEqual([])
      expect(agent.tokensUsed).toBe(0)
    })
    useOfficeStore.getState().tasks.forEach((task) => {
      expect(task.status).toBe('backlog')
      expect(task.completedAt).toBeUndefined()
    })
  })

  it('isolates seed data between resets', () => {
    const first = useOfficeStore.getState().agents[0]
    useOfficeStore.getState().addAgentXP(first.id, 100)
    expect(useOfficeStore.getState().agents[0].xp).toBe(100)

    useOfficeStore.getState().resetToDefaults()
    expect(useOfficeStore.getState().agents[0].xp).toBe(0)
  })

  it('hires a new agent and assigns to available desk', () => {
    const state = useOfficeStore.getState()
    const initialCount = state.agents.length

    const newAgent = state.hireAgent({
      name: 'Elena Rostova',
      role: 'devops',
      roleTitle: 'DevOps Specialist',
      model: 'qwen2.5-coder-32b'
    })

    const updatedState = useOfficeStore.getState()
    expect(updatedState.agents.length).toBe(initialCount + 1)
    expect(newAgent.name).toBe('Elena Rostova')
    expect(newAgent.role).toBe('devops')
    expect(newAgent.level).toBe(1)
    expect(newAgent.xp).toBe(0)
    expect(newAgent.tokenBudget).toBeGreaterThan(0)
    expect(updatedState.selectedAgentId).toBe(newAgent.id)
  })

  it('creates and manages blackboard tasks', () => {
    const state = useOfficeStore.getState()

    const task = state.createTask({
      title: 'Optimize Vulkan shader caching',
      description: 'Reduce startup warm-up latency',
      priority: 'high'
    })

    expect(task.title).toBe('Optimize Vulkan shader caching')
    expect(task.status).toBe('backlog')

    const firstAgent = state.agents[0]
    state.assignTask(task.id, firstAgent.id)

    let currentTask = useOfficeStore.getState().tasks.find((t) => t.id === task.id)
    expect(currentTask?.assignedAgentId).toBe(firstAgent.id)
    expect(currentTask?.status).toBe('in_progress')

    state.updateTaskStatus(task.id, 'completed', 'Shader caching speedup verified.')
    currentTask = useOfficeStore.getState().tasks.find((t) => t.id === task.id)
    expect(currentTask?.status).toBe('completed')
    expect(currentTask?.completedAt).toBeDefined()
  })

  it('accumulates XP and levels up agents', () => {
    const state = useOfficeStore.getState()
    const agent = state.agents[0]
    const initialLevel = agent.level
    const initialXP = agent.xp

    state.addAgentXP(agent.id, 50)
    let updatedAgent = useOfficeStore.getState().agents.find((a) => a.id === agent.id)
    expect(updatedAgent?.xp).toBe(initialXP + 50)

    // Grant large XP to trigger level up
    state.addAgentXP(agent.id, 2000)
    updatedAgent = useOfficeStore.getState().agents.find((a) => a.id === agent.id)
    expect(updatedAgent?.level).toBeGreaterThan(initialLevel)
  })

  it('unlocks office decor as studio XP accumulates', () => {
    expect(useOfficeStore.getState().unlockedDecor).toEqual([])
    const agent = useOfficeStore.getState().agents[0]
    useOfficeStore.getState().addAgentXP(agent.id, 600)
    expect(useOfficeStore.getState().unlockedDecor).toContain('plants')
  })

  it('dispatches data envelopes between agents', () => {
    const state = useOfficeStore.getState()
    const fromAgent = state.agents[0]
    const toAgent = state.agents[1]

    state.dispatchEnvelope(fromAgent.id, toAgent.id, 'Can you review PR #42?', 'code_review')

    const updatedState = useOfficeStore.getState()
    expect(updatedState.envelopes.length).toBe(1)
    expect(updatedState.envelopes[0].message).toBe('Can you review PR #42?')
    expect(updatedState.envelopes[0].fromAgentId).toBe(fromAgent.id)
    expect(updatedState.envelopes[0].toAgentId).toBe(toAgent.id)

    for (let i = 0; i < 25; i++) {
      useOfficeStore.getState().tick()
    }

    expect(useOfficeStore.getState().envelopes.length).toBe(0)
  })

  it('snaps all motion to completion when told to', () => {
    const state = useOfficeStore.getState()
    state.dispatchEnvelope(state.agents[0].id, state.agents[1].id, 'ping')
    state.sendAgentToCoffee(state.agents[0].id)

    useOfficeStore.getState().tick({ snap: true })

    expect(useOfficeStore.getState().envelopes).toHaveLength(0)
    expect(useOfficeStore.getState().agents[0].targetPosition).toBeUndefined()
  })

  it('reports pending motion only while something is animating', () => {
    // Momentum still easing toward its target counts as motion.
    const state = useOfficeStore.getState()
    state.dispatchEnvelope(state.agents[0].id, state.agents[1].id, 'ping')
    expect(useOfficeStore.getState().hasPendingMotion()).toBe(true)

    useOfficeStore.getState().tick({ snap: true })
    expect(useOfficeStore.getState().envelopes).toHaveLength(0)
  })

  it('sends agent to coffee break and returns to desk', () => {
    const state = useOfficeStore.getState()
    const agent = state.agents[0]

    state.sendAgentToCoffee(agent.id)
    let updated = useOfficeStore.getState().agents.find((a) => a.id === agent.id)
    expect(updated?.status).toBe('break')
    expect(updated?.targetPosition).toBeDefined()

    state.returnAgentToDesk(agent.id)
    updated = useOfficeStore.getState().agents.find((a) => a.id === agent.id)
    expect(updated?.status).toBe('idle')
  })

  it('refills token budgets on a shift reset', () => {
    const agent = useOfficeStore.getState().agents[0]
    useOfficeStore.getState().updateAgent(agent.id, { tokensUsed: 90000, status: 'break' })

    useOfficeStore.getState().resetShift()

    const updated = useOfficeStore.getState().agents.find((a) => a.id === agent.id)
    expect(updated?.tokensUsed).toBe(0)
    expect(updated?.status).toBe('idle')
  })
})

// ==========================================
// Live stream routing
// ==========================================

const GEN_ID = 'gen-test-1'
const MSG_ID = 'msg-test-1'

function chunk(partial: Partial<StreamChunkPayload>): StreamChunkPayload {
  return {
    conversationId: 'conv-1',
    messageId: MSG_ID,
    generationId: GEN_ID,
    done: false,
    ...partial
  }
}

describe('officeStore stream routing', () => {
  let sendMessage: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    useOfficeStore.getState().resetToDefaults()

    sendMessage = vi.fn().mockResolvedValue({
      assistantMsgId: MSG_ID,
      generationId: GEN_ID
    })

    ;(window as unknown as { goltiAPI: unknown }).goltiAPI = {
      createConversation: vi.fn().mockResolvedValue(undefined),
      sendMessage,
      cancelGeneration: vi.fn().mockResolvedValue(true),
      onStreamChunk: vi.fn().mockReturnValue(() => {})
    }
  })

  afterEach(() => {
    delete (window as unknown as { goltiAPI?: unknown }).goltiAPI
    vi.restoreAllMocks()
  })

  /** Starts a real task run against the stubbed bridge. */
  async function startRun(role: 'coder' | 'researcher' = 'coder') {
    const agent = useOfficeStore.getState().agents.find((a) => a.role === role)!
    const task = useOfficeStore.getState().createTask({
      title: 'Do the thing',
      description: 'Details here'
    })
    await useOfficeStore.getState().runTask(task.id, agent.id)
    return { agentId: agent.id, taskId: task.id }
  }

  const agentNow = (id: string) => useOfficeStore.getState().agents.find((a) => a.id === id)!

  it('starts a real generation and marks the agent working', async () => {
    const { agentId, taskId } = await startRun()

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      content: 'Do the thing\n\nDetails here',
      providerId: 'anthropic'
    })
    expect(agentNow(agentId).status).toBe('working')
    expect(isAgentRunning(agentId)).toBe(true)

    const task = useOfficeStore.getState().tasks.find((t) => t.id === taskId)
    expect(task?.status).toBe('in_progress')
    expect(task?.generationId).toBe(GEN_ID)
  })

  it('turns on deep research for researcher agents only', async () => {
    await startRun('researcher')
    expect(sendMessage.mock.calls[0][0].deepResearchEnabled).toBe(true)

    useOfficeStore.getState().resetToDefaults()
    sendMessage.mockClear()
    await startRun('coder')
    expect(sendMessage.mock.calls[0][0].deepResearchEnabled).toBe(false)
  })

  it('ignores chunks from generations it does not own', async () => {
    const { agentId } = await startRun()
    const before = agentNow(agentId).logs.length

    useOfficeStore
      .getState()
      .handleStreamChunk(chunk({ generationId: 'someone-elses-gen', eventType: 'thinking', reasoningContent: 'hi' }))
    useOfficeStore.getState().handleStreamChunk(chunk({ generationId: undefined, eventType: 'text' }))

    expect(agentNow(agentId).logs.length).toBe(before)
  })

  it('maps thinking chunks to status and a thought log', async () => {
    const { agentId } = await startRun()

    useOfficeStore.getState().handleStreamChunk(
      chunk({ eventType: 'thinking', reasoningContent: 'First line\nWeighing the tradeoffs' })
    )

    const agent = agentNow(agentId)
    expect(agent.status).toBe('thinking')
    expect(agent.statusMessage).toBe('Weighing the tradeoffs')
    expect(agent.logs[0]).toMatchObject({ type: 'thought', content: 'Weighing the tradeoffs' })
  })

  it('does not log the same thought twice in a row', async () => {
    const { agentId } = await startRun()
    const payload = chunk({ eventType: 'thinking', reasoningContent: 'Same thought' })

    useOfficeStore.getState().handleStreamChunk(payload)
    useOfficeStore.getState().handleStreamChunk(payload)

    const thoughts = agentNow(agentId).logs.filter((l) => l.content === 'Same thought')
    expect(thoughts).toHaveLength(1)
  })

  it('records a tool call when a web search returns', async () => {
    const { agentId } = await startRun()

    useOfficeStore.getState().handleStreamChunk(
      chunk({ eventType: 'search', searchStatus: { state: 'success', resultCount: 4 } })
    )

    const agent = agentNow(agentId)
    expect(agent.stats.toolCallsCount).toBe(1)
    expect(agent.logs[0].type).toBe('tool_call')
  })

  it('seeds research steps from a plan and advances them', async () => {
    const { agentId } = await startRun('researcher')

    useOfficeStore.getState().handleStreamChunk(
      chunk({
        eventType: 'research-plan',
        researchPlan: {
          originalQuery: 'q',
          subQueries: ['first query', 'second query'],
          reasoning: 'because'
        }
      })
    )
    expect(getResearchStepsForAgent(agentId)).toHaveLength(2)

    useOfficeStore.getState().handleStreamChunk(
      chunk({
        eventType: 'research-step',
        researchStep: {
          stepIndex: 1,
          totalSteps: 2,
          query: 'first query',
          status: 'done',
          sourcesFound: 3
        }
      })
    )

    const steps = getResearchStepsForAgent(agentId)
    expect(steps[0].status).toBe('done')
    expect(steps[0].sourcesFound).toBe(3)
    expect(agentNow(agentId).logs[0].type).toBe('tool_call')
  })

  it('counts an artifact once even though shell and artifact both fire', async () => {
    const { agentId } = await startRun()
    const artifact = {
      id: 'art-1',
      conversationId: 'conv-1',
      messageId: MSG_ID,
      type: 'code' as const,
      title: 'main.ts',
      content: 'export {}',
      version: 1,
      createdAt: 0,
      updatedAt: 0
    }

    useOfficeStore.getState().handleStreamChunk(chunk({ eventType: 'artifact', artifact }))
    useOfficeStore.getState().handleStreamChunk(chunk({ eventType: 'shell', shell: artifact }))

    const produced = agentNow(agentId).logs.filter((l) =>
      l.content.startsWith('Produced artifact:')
    )
    expect(produced).toHaveLength(1)
    expect(agentNow(agentId).xp).toBe(40)

    // The artifact is handed to the reviewer as a real envelope.
    const envelopes = useOfficeStore.getState().envelopes
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].type).toBe('code_review')
  })

  it('settles token spend, XP and task status on done', async () => {
    const { agentId, taskId } = await startRun()

    useOfficeStore.getState().handleStreamChunk(
      chunk({
        eventType: 'done',
        done: true,
        usage: { promptTokens: 400, completionTokens: 600, totalTokens: 1000 }
      })
    )

    const agent = agentNow(agentId)
    expect(agent.tokensUsed).toBe(1000)
    expect(agent.status).toBe('idle')
    expect(agent.stats.tasksCompleted).toBe(1)
    expect(agent.xp).toBe(150)
    expect(isAgentRunning(agentId)).toBe(false)

    const task = useOfficeStore.getState().tasks.find((t) => t.id === taskId)
    expect(task?.status).toBe('review')
    expect(task?.generationId).toBeUndefined()
  })

  it('unlocks achievements from the real completion event', async () => {
    const { agentId } = await startRun()

    useOfficeStore.getState().handleStreamChunk(
      chunk({
        eventType: 'done',
        done: true,
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
      })
    )

    const unlocked = agentNow(agentId).unlockedAchievements
    expect(unlocked).toContain('first_blood')
    expect(unlocked).toContain('frugal')
  })

  it('marks the agent errored and does not award XP on failure', async () => {
    const { agentId, taskId } = await startRun()

    useOfficeStore
      .getState()
      .handleStreamChunk(chunk({ eventType: 'error', error: 'provider exploded' }))

    const agent = agentNow(agentId)
    expect(agent.status).toBe('error')
    expect(agent.xp).toBe(0)
    expect(agent.stats.tasksCompleted).toBe(0)
    expect(isAgentRunning(agentId)).toBe(false)

    const task = useOfficeStore.getState().tasks.find((t) => t.id === taskId)
    expect(task?.status).toBe('in_progress')
  })

  it('refuses a second concurrent run for the same agent', async () => {
    const { agentId, taskId } = await startRun()
    sendMessage.mockClear()

    await useOfficeStore.getState().runTask(taskId, agentId)

    expect(sendMessage).not.toHaveBeenCalled()
    expect(agentNow(agentId).logs[0].content).toMatch(/already running/i)
  })

  it('forces a break when the token budget runs out', async () => {
    const { agentId } = await startRun()
    const budget = agentNow(agentId).tokenBudget

    useOfficeStore.getState().handleStreamChunk(
      chunk({
        eventType: 'done',
        done: true,
        usage: { promptTokens: budget, completionTokens: 0, totalTokens: budget }
      })
    )

    expect(agentNow(agentId).status).toBe('break')
  })

  it('cancels the live generation when stopped', async () => {
    const { agentId } = await startRun()

    await useOfficeStore.getState().stopAgent(agentId)

    const api = (window as unknown as { goltiAPI: { cancelGeneration: ReturnType<typeof vi.fn> } })
      .goltiAPI
    expect(api.cancelGeneration).toHaveBeenCalledWith(GEN_ID)
    expect(isAgentRunning(agentId)).toBe(false)
  })

  it('reports an honest error when no inference bridge exists', async () => {
    delete (window as unknown as { goltiAPI?: unknown }).goltiAPI

    const { agentId } = await startRun()

    expect(agentNow(agentId).status).toBe('error')
    expect(agentNow(agentId).logs[0].content).toMatch(/bridge unavailable/i)
  })
})

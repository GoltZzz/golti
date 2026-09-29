import type { StartupState, StartupStep, StartupStepId, StartupStepStatus } from '../shared/types'

const STEP_LABELS: Record<StartupStepId, string> = {
  database: 'Opening database',
  attachments: 'Cleaning up attachments',
  search: 'Checking web search runtime',
  mcp: 'Connecting MCP servers',
  engine: 'Starting local engine',
  embedding: 'Warming embedding model',
  memory: 'Warming memory model'
}

type Listener = (state: StartupState) => void

let state: StartupState = createInitialState()
const listeners = new Set<Listener>()

function createInitialState(): StartupState {
  const steps = (Object.keys(STEP_LABELS) as StartupStepId[]).map(
    (id): StartupStep => ({ id, label: STEP_LABELS[id], status: 'pending' })
  )
  return { steps, done: false }
}

function emit(): void {
  for (const listener of listeners) listener(state)
}

export function getStartupState(): StartupState {
  return state
}

export function onStartupProgress(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setStartupStep(id: StartupStepId, status: StartupStepStatus, error?: string): void {
  state = {
    ...state,
    steps: state.steps.map((s) => (s.id === id ? { ...s, status, error } : s))
  }
  emit()
}

/**
 * Runs one startup step and records its outcome. A failing step is reported
 * but never rejects, so one broken service can't hold the rest of startup.
 * Return 'skipped' from `run` when the step had nothing to do.
 */
export async function runStartupStep(
  id: StartupStepId,
  run: () => Promise<void | 'skipped'> | void | 'skipped'
): Promise<void> {
  setStartupStep(id, 'running')
  try {
    const result = await run()
    setStartupStep(id, result === 'skipped' ? 'skipped' : 'done')
  } catch (err) {
    console.warn(`[Startup] ${id} failed:`, err)
    setStartupStep(id, 'error', err instanceof Error ? err.message : String(err))
  }
}

export function finishStartup(): void {
  // Anything never reached (e.g. a step removed from the sequence) counts as skipped.
  state = {
    steps: state.steps.map((s) => (s.status === 'pending' || s.status === 'running' ? { ...s, status: 'skipped' } : s)),
    done: true
  }
  emit()
}

/** Test hook: start over with every step pending. */
export function resetStartupProgress(): void {
  state = createInitialState()
  listeners.clear()
}

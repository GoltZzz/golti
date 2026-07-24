import type { ResearchPlan, ResearchStep } from './types'

export type ResearchPhase = 'planning' | 'searching' | 'synthesizing' | 'done' | 'error'

export interface ResearchProgress {
  plan?: ResearchPlan
  steps: ResearchStep[]
  phase: ResearchPhase
}

export function createPlanningProgress(originalQuery: string): ResearchProgress {
  return {
    plan: {
      originalQuery,
      subQueries: [],
      reasoning: 'Planning searches…'
    },
    steps: [],
    phase: 'planning'
  }
}

export function seedPendingStepsFromPlan(plan: ResearchPlan): ResearchStep[] {
  return plan.subQueries.map((query, i) => ({
    stepIndex: i + 1,
    totalSteps: plan.subQueries.length,
    query,
    status: 'pending' as const,
    sourcesFound: 0
  }))
}

export function getResearchPhaseLabel(progress: ResearchProgress): string {
  switch (progress.phase) {
    case 'planning':
      return 'Planning searches…'
    case 'searching': {
      const active = progress.steps.find(
        (s) => s.status === 'searching' || s.status === 'reading'
      )
      const doneCount = progress.steps.filter((s) => s.status === 'done' || s.status === 'error').length
      const total = progress.steps.length || active?.totalSteps || 0
      if (active) {
        return `${active.status === 'reading' ? 'Reading' : 'Searching'} ${active.stepIndex}/${total}…`
      }
      if (total > 0) {
        return `Searching ${Math.min(doneCount + 1, total)}/${total}…`
      }
      return 'Searching…'
    }
    case 'synthesizing':
      return 'Writing report…'
    case 'done':
      return 'Research complete'
    case 'error':
      return 'Research failed'
    default:
      return 'Deep Research'
  }
}

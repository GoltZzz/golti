import { describe, expect, it } from 'vitest'
import {
  createPlanningProgress,
  getResearchPhaseLabel,
  seedPendingStepsFromPlan,
  type ResearchProgress
} from './research-progress'
import type { ResearchPlan } from './types'

describe('research-progress helpers', () => {
  it('createPlanningProgress seeds planning phase', () => {
    const progress = createPlanningProgress('What is React 19?')
    expect(progress.phase).toBe('planning')
    expect(progress.steps).toEqual([])
    expect(progress.plan?.originalQuery).toBe('What is React 19?')
    expect(progress.plan?.reasoning).toBe('Planning searches…')
  })

  it('seedPendingStepsFromPlan creates pending checklist', () => {
    const plan: ResearchPlan = {
      originalQuery: 'topic',
      subQueries: ['a', 'b', 'c'],
      reasoning: 'Cover three angles'
    }
    const steps = seedPendingStepsFromPlan(plan)
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatchObject({
      stepIndex: 1,
      totalSteps: 3,
      query: 'a',
      status: 'pending',
      sourcesFound: 0
    })
    expect(steps[2].stepIndex).toBe(3)
  })

  it('getResearchPhaseLabel covers all phases', () => {
    expect(getResearchPhaseLabel(createPlanningProgress('q'))).toBe('Planning searches…')

    const searching: ResearchProgress = {
      phase: 'searching',
      plan: { originalQuery: 'q', subQueries: ['a', 'b'], reasoning: 'r' },
      steps: [
        {
          stepIndex: 1,
          totalSteps: 2,
          query: 'a',
          status: 'done',
          sourcesFound: 2
        },
        {
          stepIndex: 2,
          totalSteps: 2,
          query: 'b',
          status: 'searching',
          sourcesFound: 0
        }
      ]
    }
    expect(getResearchPhaseLabel(searching)).toBe('Searching 2/2…')

    searching.steps[1].status = 'reading'
    expect(getResearchPhaseLabel(searching)).toBe('Reading 2/2…')

    expect(
      getResearchPhaseLabel({ ...searching, phase: 'synthesizing', steps: searching.steps })
    ).toBe('Writing report…')
    expect(getResearchPhaseLabel({ ...searching, phase: 'done' })).toBe('Research complete')
    expect(getResearchPhaseLabel({ ...searching, phase: 'error' })).toBe('Research failed')
  })

  it('handles planner JSON with queries field used in production', () => {
    const rawOutput =
      '```json\n{\n  "queries": ["query 1", "query 2"],\n  "reasoning": "Strategy explanation"\n}\n```'
    const cleanJson = rawOutput.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleanJson) as { queries: string[]; reasoning: string }
    const plan: ResearchPlan = {
      originalQuery: 'topic',
      subQueries: parsed.queries,
      reasoning: parsed.reasoning
    }
    expect(seedPendingStepsFromPlan(plan).map((s) => s.query)).toEqual(['query 1', 'query 2'])
  })
})

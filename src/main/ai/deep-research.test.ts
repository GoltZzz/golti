import { describe, expect, it } from 'vitest'
import type { ResearchPlan, ResearchStep } from '../../shared/types'

describe('Deep Research Data Structures & Utilities', () => {
  it('correctly builds research step progression', () => {
    const steps: ResearchStep[] = []
    
    const step1: ResearchStep = {
      stepIndex: 1,
      totalSteps: 3,
      query: 'React 19 features',
      status: 'searching',
      sourcesFound: 0
    }
    steps.push(step1)

    expect(steps.length).toBe(1)
    expect(steps[0].status).toBe('searching')

    // Transition to done
    const updatedStep1: ResearchStep = { ...step1, status: 'done', sourcesFound: 4 }
    const idx = steps.findIndex(s => s.stepIndex === updatedStep1.stepIndex)
    if (idx >= 0) steps[idx] = updatedStep1

    expect(steps[0].status).toBe('done')
    expect(steps[0].sourcesFound).toBe(4)
  })

  it('handles JSON cleaning for LLM planner output', () => {
    const rawOutput = '```json\n{\n  "subQueries": ["query 1", "query 2"],\n  "reasoning": "Strategy explanation"\n}\n```'
    const cleanJson = rawOutput.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleanJson) as ResearchPlan

    expect(parsed.subQueries).toEqual(['query 1', 'query 2'])
    expect(parsed.reasoning).toBe('Strategy explanation')
  })
})

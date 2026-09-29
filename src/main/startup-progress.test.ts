import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finishStartup,
  getStartupState,
  onStartupProgress,
  resetStartupProgress,
  runStartupStep
} from './startup-progress'

afterEach(() => resetStartupProgress())

function statusOf(id: string) {
  return getStartupState().steps.find((s) => s.id === id)?.status
}

describe('startup progress', () => {
  it('reports each step as it runs and finishes', async () => {
    const seen: string[] = []
    onStartupProgress((state) => seen.push(state.steps.find((s) => s.id === 'engine')!.status))

    await runStartupStep('engine', async () => undefined)

    expect(seen).toEqual(['running', 'done'])
    expect(getStartupState().done).toBe(false)
  })

  it('records skipped and failed steps without throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await runStartupStep('memory', () => 'skipped')
    await runStartupStep('embedding', async () => {
      throw new Error('model missing')
    })

    expect(statusOf('memory')).toBe('skipped')
    expect(statusOf('embedding')).toBe('error')
    expect(getStartupState().steps.find((s) => s.id === 'embedding')?.error).toBe('model missing')
  })

  it('marks unfinished steps skipped when startup ends', async () => {
    await runStartupStep('attachments', () => undefined)
    finishStartup()

    const state = getStartupState()
    expect(state.done).toBe(true)
    expect(statusOf('attachments')).toBe('done')
    expect(state.steps.filter((s) => s.id !== 'attachments').every((s) => s.status === 'skipped')).toBe(true)
  })
})

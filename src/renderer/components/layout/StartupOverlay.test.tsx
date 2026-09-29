// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { StartupState, StartupStep } from '../../../shared/types'
import { StartupOverlay, STARTUP_SKIP_DELAY_MS } from './StartupOverlay'

let progress: ((state: StartupState) => void) | null = null
let initial: StartupState

function state(steps: Array<Partial<StartupStep> & Pick<StartupStep, 'id' | 'status'>>, done = false): StartupState {
  return { steps: steps.map((s) => ({ label: `Step ${s.id}`, ...s })), done }
}

beforeEach(() => {
  vi.useFakeTimers()
  progress = null
  initial = state([
    { id: 'database', status: 'done' },
    { id: 'engine', status: 'running', label: 'Starting local engine' },
    { id: 'memory', status: 'pending' }
  ])
  ;(window as any).goltiAPI = {
    getStartupState: vi.fn(async () => initial),
    onStartupProgress: vi.fn((cb: (s: StartupState) => void) => {
      progress = cb
      return () => {
        progress = null
      }
    })
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function mount() {
  render(<StartupOverlay />)
  await act(async () => {
    await Promise.resolve()
  })
}

describe('StartupOverlay', () => {
  it('shows the running step and leaves once startup is done', async () => {
    await mount()
    expect(screen.getByText('Starting local engine…')).toBeTruthy()

    act(() => {
      progress!(state([
        { id: 'database', status: 'done' },
        { id: 'engine', status: 'done' },
        { id: 'memory', status: 'skipped' }
      ], true))
    })
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.queryByText('Step memory')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not replay after a reload once startup already finished', async () => {
    initial = state([{ id: 'database', status: 'done' }], true)
    await mount()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offers to continue when startup runs long', async () => {
    await mount()
    expect(screen.queryByText('Continue while loading')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(STARTUP_SKIP_DELAY_MS)
    })
    fireEvent.click(screen.getByText('Continue while loading'))
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

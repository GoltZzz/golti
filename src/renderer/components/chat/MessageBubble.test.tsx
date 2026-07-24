// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../../shared/types'
import type { ResearchProgress } from '../../../shared/research-progress'

afterEach(() => {
  cleanup()
})

let researchProgress: ResearchProgress | undefined
let mockMessages: Message[] = []

vi.mock('../../stores/chatStore', () => ({
  useChatStore: (selector: any) => {
    const mockStore = {
      regenerate: vi.fn(),
      editAndResend: vi.fn(),
      sendMessage: vi.fn(),
      selectBranch: vi.fn(),
      stopGeneration: vi.fn(),
      isGenerating: false,
      citations: [],
      artifacts: [],
      messages: mockMessages,
      searchStatusByMessageId: {},
      researchProgressByMessageId: researchProgress
        ? { [mockMessages[0]?.id || 'msg_a']: researchProgress }
        : {}
    }
    return selector ? selector(mockStore) : mockStore
  }
}))

vi.mock('../../stores/inspectorStore', () => ({
  useInspectorStore: () => ({
    selectShell: vi.fn(),
    selectArtifact: vi.fn()
  })
}))

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: any) => {
    const state = { settings: { showThinkingProcess: true } }
    return selector ? selector(state) : state
  }
}))

function assistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_a',
    conversationId: 'conv_1',
    role: 'assistant',
    content: '',
    createdAt: 1000,
    isStreaming: true,
    isDeepResearch: true,
    ...overrides
  }
}

describe('MessageBubble Deep Research UI', () => {
  it('shows planning status instead of blank dots', () => {
    const msg = assistantMessage()
    mockMessages = [msg]
    researchProgress = {
      phase: 'planning',
      plan: {
        originalQuery: 'AI chips',
        subQueries: [],
        reasoning: 'Planning searches…'
      },
      steps: []
    }

    render(<MessageBubble message={msg} />)

    expect(screen.getByText('Planning searches…')).toBeTruthy()
    expect(screen.getByText('Breaking the topic into search queries…')).toBeTruthy()
    expect(document.querySelector('.dot-flashing')).toBeNull()
  })

  it('renders seeded pending steps and live searching label', () => {
    const msg = assistantMessage()
    mockMessages = [msg]
    researchProgress = {
      phase: 'searching',
      plan: {
        originalQuery: 'AI chips',
        subQueries: ['overview', 'benchmarks'],
        reasoning: 'Cover overview and benchmarks'
      },
      steps: [
        {
          stepIndex: 1,
          totalSteps: 2,
          query: 'overview',
          status: 'searching',
          sourcesFound: 0
        },
        {
          stepIndex: 2,
          totalSteps: 2,
          query: 'benchmarks',
          status: 'pending',
          sourcesFound: 0
        }
      ]
    }

    render(<MessageBubble message={msg} />)

    expect(screen.getByText('Searching 1/2…')).toBeTruthy()
    expect(screen.getByText('overview')).toBeTruthy()
    expect(screen.getByText('benchmarks')).toBeTruthy()
    expect(screen.getByText('Cover overview and benchmarks')).toBeTruthy()
  })

  it('shows step error text when a search step fails', () => {
    const msg = assistantMessage({ content: 'Partial answer', isStreaming: false })
    mockMessages = [msg]
    researchProgress = {
      phase: 'done',
      plan: {
        originalQuery: 'topic',
        subQueries: ['failed query'],
        reasoning: 'One angle'
      },
      steps: [
        {
          stepIndex: 1,
          totalSteps: 1,
          query: 'failed query',
          status: 'error',
          sourcesFound: 0,
          error: 'Search runtime unavailable'
        }
      ]
    }

    render(<MessageBubble message={msg} />)

    expect(screen.getByText('Research complete')).toBeTruthy()
    expect(screen.getByText('Search runtime unavailable')).toBeTruthy()
  })

  it('shows synthesizing status while waiting for report text', () => {
    const msg = assistantMessage({ content: '' })
    mockMessages = [msg]
    researchProgress = {
      phase: 'synthesizing',
      plan: {
        originalQuery: 'topic',
        subQueries: ['q1'],
        reasoning: 'Done searching'
      },
      steps: [
        {
          stepIndex: 1,
          totalSteps: 1,
          query: 'q1',
          status: 'done',
          sourcesFound: 3
        }
      ]
    }

    render(<MessageBubble message={msg} />)

    expect(screen.getByText('Writing report…')).toBeTruthy()
    expect(screen.getByText('Synthesizing findings into a report…')).toBeTruthy()
  })
})

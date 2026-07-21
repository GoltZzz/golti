// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MessageList } from './MessageList'
import type { Message } from '../../../shared/types'

afterEach(() => {
  cleanup()
})

// Mock useChatStore and useInspectorStore
vi.mock('../../stores/chatStore', () => ({
  useChatStore: (selector: any) => {
    const mockStore = {
      regenerate: vi.fn(),
      editAndResend: vi.fn(),
      selectBranch: vi.fn(),
      stopGeneration: vi.fn(),
      isGenerating: false,
      citations: [],
      artifacts: [],
      messages: [],
      searchStatusByMessageId: {},
      researchProgressByMessageId: {}
    }
    return selector ? selector(mockStore) : mockStore
  }
}))

vi.mock('../../stores/inspectorStore', () => ({
  useInspectorStore: () => ({
    selectArtifact: vi.fn()
  })
}))

describe('MessageList', () => {
  const dummyMessages: Message[] = [
    {
      id: 'msg_1',
      conversationId: 'conv_1',
      role: 'user',
      content: 'Hello AI',
      createdAt: 1000
    },
    {
      id: 'msg_2',
      conversationId: 'conv_1',
      role: 'assistant',
      content: 'Hello! How can I help you today?',
      createdAt: 1001,
      isStreaming: true
    }
  ]

  it('renders chat messages properly', () => {
    render(<MessageList messages={dummyMessages} />)
    expect(screen.getByText('Hello AI')).toBeTruthy()
    expect(screen.getByText('Hello! How can I help you today?')).toBeTruthy()
  })

  it('shows scroll to bottom button when user scrolls up', () => {
    render(<MessageList messages={dummyMessages} />)
    const transcript = screen.getByRole('log')
    
    // Simulate user scrolling up via mouse wheel
    fireEvent.wheel(transcript, { deltaY: -50 })

    expect(screen.getByText(/AI responding/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /scroll to bottom/i })).toBeTruthy()
  })
})



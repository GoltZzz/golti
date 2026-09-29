// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Conversation, ConversationGroup } from '../../../shared/types'

const updateConversation = vi.fn(async () => undefined)
const getMessages = vi.fn(async () => [])
const createConversationGroup = vi.fn(async () => undefined)
const deleteConversationGroup = vi.fn(async () => undefined)

// Every other IPC call resolves to nothing; subscriptions return an unsubscribe.
;(window as any).goltiAPI = new Proxy(
  { updateConversation, getMessages, createConversationGroup, deleteConversationGroup },
  {
    get: (target: Record<string, unknown>, key: string) =>
      target[key] ?? (key.startsWith('on') ? () => () => undefined : async () => undefined)
  }
)

import { Sidebar } from './Sidebar'
import { useChatStore } from '../../stores/chatStore'

function conversation(id: string, title: string): Conversation {
  return { id, title, model: 'm', providerId: 'p', createdAt: 1, updatedAt: 1, pinned: false, archived: false }
}

beforeEach(() => {
  updateConversation.mockClear()
  getMessages.mockClear()
  createConversationGroup.mockClear()
  deleteConversationGroup.mockClear()
  useChatStore.setState({
    conversationGroups: [],
    currentConversationId: null,
    conversationError: null,
    conversations: [conversation('c1', 'Old title'), conversation('c2', 'Other chat')],
    actionUndoStack: [],
    actionRedoStack: []
  })
})

afterEach(() => cleanup())

function titleOf(id: string) {
  return useChatStore.getState().conversations.find((c) => c.id === id)?.title
}

describe('Sidebar conversation rename', () => {
  it('renames on double-click + Enter and persists the new title', async () => {
    render(<Sidebar />)
    fireEvent.doubleClick(screen.getByText('Old title'))

    const input = screen.getByLabelText('Conversation title') as HTMLInputElement
    expect(input.value).toBe('Old title')
    fireEvent.change(input, { target: { value: '  Trip   plans  ' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    expect(screen.queryByLabelText('Conversation title')).toBeNull()
    expect(screen.getByText('Trip plans')).toBeTruthy()
    expect(updateConversation).toHaveBeenCalledWith('c1', { title: 'Trip plans' })
    expect(titleOf('c2')).toBe('Other chat')
  })

  it('opens from the rename button and saves when focus leaves', async () => {
    render(<Sidebar />)
    fireEvent.click(screen.getAllByLabelText('Rename conversation')[1])

    const input = screen.getByLabelText('Conversation title')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    await act(async () => {
      fireEvent.blur(input)
    })

    expect(titleOf('c2')).toBe('Renamed')
  })

  it('keeps the old title on Escape or when the new one is blank', async () => {
    render(<Sidebar />)

    fireEvent.doubleClick(screen.getByText('Old title'))
    fireEvent.change(screen.getByLabelText('Conversation title'), { target: { value: 'Nope' } })
    fireEvent.keyDown(screen.getByLabelText('Conversation title'), { key: 'Escape' })

    fireEvent.doubleClick(screen.getByText('Old title'))
    fireEvent.change(screen.getByLabelText('Conversation title'), { target: { value: '   ' } })
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Conversation title'), { key: 'Enter' })
    })

    expect(titleOf('c1')).toBe('Old title')
    expect(updateConversation).not.toHaveBeenCalled()
  })

  it('can be undone', async () => {
    await act(async () => {
      await useChatStore.getState().renameConversation('c1', 'New title')
    })
    const [entry] = useChatStore.getState().actionUndoStack
    expect(entry.label).toBe('Rename conversation')

    await act(async () => {
      await entry.undo()
    })
    expect(titleOf('c1')).toBe('Old title')
    expect(updateConversation).toHaveBeenLastCalledWith('c1', { title: 'Old title' })
  })
})

describe('Sidebar conversation selection', () => {
  it('does not reload the chat that is already open', async () => {
    render(<Sidebar />)
    await act(async () => {
      fireEvent.click(screen.getByText('Old title'))
    })
    expect(getMessages).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().currentConversationId).toBe('c1')

    await act(async () => {
      fireEvent.click(screen.getByText('Old title'))
      fireEvent.click(screen.getByText('Old title'))
    })
    expect(getMessages).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByText('Other chat'))
    })
    expect(getMessages).toHaveBeenCalledTimes(2)
  })

  it('retries the open chat when its last load failed', async () => {
    useChatStore.setState({ currentConversationId: 'c1', conversationError: 'Failed to load conversation' })
    render(<Sidebar />)
    await act(async () => {
      fireEvent.click(screen.getByText('Old title'))
    })
    expect(getMessages).toHaveBeenCalledTimes(1)
  })
})

function group(id: string, name: string, extra: Partial<ConversationGroup> = {}): ConversationGroup {
  return { id, name, sortOrder: 0, collapsed: false, createdAt: 1, ...extra }
}

function groupOf(id: string) {
  return useChatStore.getState().conversations.find((c) => c.id === id)?.groupId ?? null
}

describe('Sidebar conversation groups', () => {
  it('shows grouped chats under their group and hides them when collapsed', async () => {
    useChatStore.setState({
      conversationGroups: [group('g1', 'Work')],
      conversations: [{ ...conversation('c1', 'Old title'), groupId: 'g1' }, conversation('c2', 'Other chat')]
    })
    render(<Sidebar />)

    const header = screen.getByText('Work').closest('.conv-group') as HTMLElement
    expect(header.textContent).toContain('Old title')
    expect(header.textContent).not.toContain('Other chat')

    await act(async () => {
      fireEvent.click(screen.getByText('Work'))
    })
    expect(screen.queryByText('Old title')).toBeNull()
    expect(screen.getByText('Other chat')).toBeTruthy()
  })

  it('moves a chat through the menu and undoes the move', async () => {
    useChatStore.setState({ conversationGroups: [group('g1', 'Work')] })
    render(<Sidebar />)

    fireEvent.click(screen.getAllByLabelText('Move conversation to group')[1])
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Work' }))
    })
    expect(groupOf('c2')).toBe('g1')
    expect(updateConversation).toHaveBeenCalledWith('c2', { groupId: 'g1' })

    await act(async () => {
      await useChatStore.getState().actionUndoStack.at(-1)!.undo()
    })
    expect(groupOf('c2')).toBeNull()
  })

  it('creates a group from the move menu and puts the chat in it', async () => {
    render(<Sidebar />)

    fireEvent.click(screen.getAllByLabelText('Move conversation to group')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'New group…' }))
    fireEvent.change(screen.getByLabelText('New group name'), { target: { value: 'Research' } })
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('New group name'), { key: 'Enter' })
    })

    const created = useChatStore.getState().conversationGroups
    expect(created.map((g) => g.name)).toEqual(['Research'])
    expect(createConversationGroup).toHaveBeenCalledTimes(1)
    expect(groupOf('c1')).toBe(created[0].id)
  })

  it('moves a chat by dropping it on a group', async () => {
    useChatStore.setState({ conversationGroups: [group('g1', 'Work')] })
    render(<Sidebar />)

    const data = new Map<string, string>()
    const dataTransfer = {
      types: [] as string[],
      setData: (type: string, value: string) => {
        data.set(type, value)
        dataTransfer.types.push(type)
      },
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: 'all',
      dropEffect: 'none'
    }
    fireEvent.dragStart(screen.getByText('Other chat'), { dataTransfer })
    const target = screen.getByText('Work').closest('.conv-group') as HTMLElement
    fireEvent.dragOver(target, { dataTransfer })
    await act(async () => {
      fireEvent.drop(target, { dataTransfer })
    })
    expect(groupOf('c2')).toBe('g1')
  })

  it('deleting a group keeps its chats', async () => {
    useChatStore.setState({
      conversationGroups: [group('g1', 'Work')],
      conversations: [{ ...conversation('c1', 'Old title'), groupId: 'g1' }]
    })
    render(<Sidebar />)

    fireEvent.click(screen.getByLabelText('Delete group'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    expect(deleteConversationGroup).toHaveBeenCalledWith('g1')
    expect(useChatStore.getState().conversationGroups).toEqual([])
    expect(groupOf('c1')).toBeNull()
    expect(screen.getByText('Old title')).toBeTruthy()
  })
})

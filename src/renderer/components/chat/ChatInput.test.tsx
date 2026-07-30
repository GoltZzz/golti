// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatInput } from './ChatInput'
import type { MessageAttachment, ModelCapabilities, ModelInfo } from '../../../shared/types'

const actions = {
  sendMessage: vi.fn(),
  stageAttachmentFiles: vi.fn(),
  stageAttachmentBytes: vi.fn(),
  pickAttachments: vi.fn(),
  addContextPaths: vi.fn(),
  addContextText: vi.fn(),
  removeStagedAttachment: vi.fn(),
  clearAttachmentError: vi.fn(),
  setSelectedModel: vi.fn(),
  setDraft: vi.fn()
}

let storeOverrides: Record<string, unknown> = {}

vi.mock('../../stores/chatStore', () => ({
  useChatStore: (selector?: any) => {
    const store = {
      draft: 'describe this',
      isGenerating: false,
      stopGeneration: vi.fn(),
      webSearchEnabled: false,
      setWebSearchEnabled: vi.fn(),
      forceWebSearchNext: false,
      setForceWebSearchNext: vi.fn(),
      deepResearchEnabled: false,
      setDeepResearchEnabled: vi.fn(),
      composerMode: 'chat',
      cycleComposerMode: vi.fn(),
      searchSetupError: null,
      repairWebSearchSetup: vi.fn(),
      addContext: vi.fn(),
      stagedAttachments: [] as MessageAttachment[],
      attachmentError: null as string | null,
      modelCapabilities: null as ModelCapabilities | null,
      models: [] as ModelInfo[],
      selectedModel: null as ModelInfo | null,
      undoDraft: vi.fn(),
      redoDraft: vi.fn(),
      draftUndoStack: [],
      draftRedoStack: [],
      generationSettings: { temperature: 0.7, topP: 0.9 },
      setGenerationSettings: vi.fn(),
      tokenBudget: null,
      visibleMessages: [],
      researchProgressByMessageId: {},
      ...actions,
      ...storeOverrides
    }
    return selector ? selector(store) : store
  }
}))

vi.mock('../../stores/searchRuntimeStore', () => ({
  useSearchRuntimeStore: () => ({
    runtimeState: { status: 'stopped' },
    progress: null,
    setupListeners: () => () => undefined
  })
}))

vi.mock('../../stores/sidebarStore', () => ({
  useSidebarStore: (selector?: any) => {
    const store = { openSettings: vi.fn() }
    return selector ? selector(store) : store
  }
}))

vi.mock('../../stores/skillStore', () => ({
  useSkillStore: (selector?: any) => {
    const store = { skills: [], fetchSkills: vi.fn() }
    return selector ? selector(store) : store
  }
}))

vi.mock('./ModelSelector', () => ({ ModelSelector: () => <div /> }))
vi.mock('./UsageMeter', () => ({ UsageMeter: () => <div /> }))
vi.mock('./ContextTray', () => ({ ContextTray: () => <div /> }))

const attachment = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'att1',
  conversationId: 'c1',
  messageId: null,
  kind: 'image',
  mimeType: 'image/png',
  name: 'shot.png',
  storagePath: '/store/ab/shot.png',
  byteSize: 2048,
  width: 800,
  height: 600,
  tokenEstimate: 1024,
  createdAt: 1,
  ...over
})

beforeEach(() => {
  storeOverrides = {}
  Object.values(actions).forEach((fn) => fn.mockReset())
  ;(window as any).goltiAPI = {
    getPathForFile: vi.fn(() => ''),
    readAttachmentThumbUrl: vi.fn().mockResolvedValue(null),
    readAttachmentDataUrl: vi.fn().mockResolvedValue(null)
  }
})

afterEach(() => {
  cleanup()
})

const textarea = () => screen.getByRole('textbox')
const sendButton = () => screen.getByRole('button', { name: 'Send message' })

function pasteImage(mimeType = 'image/png'): void {
  const file = new File([new Uint8Array([1, 2, 3])], 'clip.png', { type: mimeType })
  fireEvent.paste(textarea(), {
    clipboardData: {
      items: [{ kind: 'file', type: mimeType, getAsFile: () => file }],
      files: [file],
      getData: () => ''
    }
  })
}

describe('ChatInput image paste', () => {
  it('stages a pasted image as an attachment, not as text context', async () => {
    render(<ChatInput />)
    pasteImage()

    await waitFor(() => expect(actions.stageAttachmentBytes).toHaveBeenCalledTimes(1))
    expect(actions.stageAttachmentBytes.mock.calls[0][0]).toBeInstanceOf(File)
    expect(actions.addContextText).not.toHaveBeenCalled()
    expect(actions.addContextPaths).not.toHaveBeenCalled()
  })

  it('ignores a paste that carries no image', async () => {
    render(<ChatInput />)
    fireEvent.paste(textarea(), {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [],
        getData: () => 'hello'
      }
    })

    await Promise.resolve()
    expect(actions.stageAttachmentBytes).not.toHaveBeenCalled()
  })

  it('ignores an unsupported image type', async () => {
    render(<ChatInput />)
    pasteImage('image/avif')

    await Promise.resolve()
    expect(actions.stageAttachmentBytes).not.toHaveBeenCalled()
  })
})

describe('ChatInput image drop', () => {
  const drop = (files: File[]) => {
    fireEvent.drop(textarea().closest('.composer-box')!, {
      dataTransfer: { files, items: [], types: ['Files'] }
    })
  }

  it('routes a dropped image to attachments and a text file to context', async () => {
    render(<ChatInput />)
    const image = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
    const note = new File(['hello'], 'note.txt', { type: 'text/plain' })
    note.text = () => Promise.resolve('hello')

    drop([image, note])

    await waitFor(() => expect(actions.stageAttachmentBytes).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(actions.addContextText).toHaveBeenCalledWith('note.txt', 'hello'))
  })

  it('uses the resolved OS path when webUtils provides one', async () => {
    ;(window as any).goltiAPI.getPathForFile = vi.fn(() => '/Users/me/shot.png')
    render(<ChatInput />)
    drop([new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })])

    await waitFor(() =>
      expect(actions.stageAttachmentFiles).toHaveBeenCalledWith(['/Users/me/shot.png'])
    )
    expect(actions.stageAttachmentBytes).not.toHaveBeenCalled()
  })
})

describe('ChatInput vision gating', () => {
  it('blocks the send button and Enter when the model cannot see images', () => {
    storeOverrides = {
      stagedAttachments: [attachment()],
      modelCapabilities: { image: false, pdf: false, reason: 'gpt-4 cannot read images' }
    }
    render(<ChatInput />)

    expect(sendButton().hasAttribute('disabled')).toBe(true)

    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(actions.sendMessage).not.toHaveBeenCalled()
  })

  it('explains why and offers a vision-capable model on the same provider', () => {
    storeOverrides = {
      stagedAttachments: [attachment()],
      modelCapabilities: { image: false, pdf: false, reason: 'gpt-4 cannot read images' },
      selectedModel: {
        id: 'openai:gpt-4',
        name: 'gpt-4',
        providerId: 'openai',
        providerType: 'openai'
      },
      models: [
        { id: 'openai:gpt-4', name: 'gpt-4', providerId: 'openai', providerType: 'openai' },
        { id: 'openai:gpt-4o', name: 'gpt-4o', providerId: 'openai', providerType: 'openai' }
      ]
    }
    render(<ChatInput />)

    expect(screen.getByText(/gpt-4 cannot read images/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Use gpt-4o/ }))
    expect(actions.setSelectedModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'gpt-4o' })
    )
  })

  it('offers no model switch for a local engine model', () => {
    storeOverrides = {
      stagedAttachments: [attachment()],
      modelCapabilities: { image: false, pdf: false, reason: 'no vision projector installed' },
      selectedModel: {
        id: 'local:qwen',
        name: 'qwen.gguf',
        providerId: 'local',
        providerType: 'golti-engine'
      },
      models: [
        {
          id: 'local:other',
          name: 'other.gguf',
          providerId: 'local',
          providerType: 'golti-engine'
        }
      ]
    }
    render(<ChatInput />)

    expect(screen.getByText(/no vision projector installed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  })

  it('allows sending when the model supports images', () => {
    storeOverrides = {
      stagedAttachments: [attachment()],
      modelCapabilities: { image: true, pdf: false }
    }
    render(<ChatInput />)

    expect(sendButton().hasAttribute('disabled')).toBe(false)
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(actions.sendMessage).toHaveBeenCalled()
  })

  it('allows sending with no attachments even on a text-only model', () => {
    storeOverrides = {
      stagedAttachments: [],
      modelCapabilities: { image: false, pdf: false, reason: 'gpt-4 cannot read images' }
    }
    render(<ChatInput />)

    expect(sendButton().hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText(/cannot read images/)).toBeNull()
  })
})

describe('ChatInput attachment tray', () => {
  it('lists staged attachments and removes one on click', async () => {
    storeOverrides = { stagedAttachments: [attachment({ name: 'diagram.png' })] }
    render(<ChatInput />)

    expect(screen.getByText('diagram.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove diagram.png' }))
    expect(actions.removeStagedAttachment).toHaveBeenCalledWith('att1')
  })

  it('surfaces a staging error with a dismiss control', () => {
    storeOverrides = { attachmentError: 'big.png: Image exceeds 20MB limit' }
    render(<ChatInput />)

    expect(screen.getByRole('alert').textContent).toContain('Image exceeds 20MB limit')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss attachment error' }))
    expect(actions.clearAttachmentError).toHaveBeenCalled()
  })
})

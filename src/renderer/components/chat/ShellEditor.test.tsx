// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { ShellEditor } from './ShellEditor'

const mockShell = {
  id: 'shell_1',
  conversationId: 'conv_1',
  messageId: 'msg_1',
  type: 'code' as const,
  title: 'landing-page.html',
  language: 'html',
  content: '<h1>Hello Golti</h1>',
  version: 1,
  createdAt: 1000,
  updatedAt: 1000
}

const mockMermaidShell = {
  ...mockShell,
  id: 'shell_mermaid',
  title: 'flow.mmd',
  language: 'mermaid',
  content: `graph LR
A[User] ---| Login Page| B
E[Success| Login| Authenticate| Authenticated| Failure| Login Faile`,
  type: 'code' as const
}

vi.mock('../../stores/chatStore', () => ({
  useChatStore: () => ({
    artifacts: [mockShell, mockMermaidShell],
    updateArtifactContent: vi.fn(),
    restoreArtifactVersion: vi.fn()
  })
}))

vi.mock('./ShellCanvasPreview', () => ({
  ShellCanvasPreview: (props: {
    content: string
    language?: string
    onApplyFixedContent?: (fixed: string) => void
  }) => (
    <div data-testid="shell-canvas-preview">
      {props.onApplyFixedContent ? (
        <button
          type="button"
          onClick={() =>
            props.onApplyFixedContent?.(
              'graph LR\nA[User] ---| Login Page| B\nE[Success / Login / Authenticate]'
            )
          }
        >
          Apply to editor
        </button>
      ) : null}
    </div>
  )
}))

describe('ShellEditor Component', () => {
  beforeEach(() => {
    window.goltiAPI = {
      listArtifactVersions: vi.fn().mockResolvedValue([{ version: 1, createdAt: 1000 }]),
      saveShellToFile: vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/landing-page.html' })
    } as any
  })

  afterEach(() => {
    cleanup()
  })

  it('renders title, sub-navbar tabs, and default preview', () => {
    render(<ShellEditor shellId="shell_1" onBack={() => {}} />)

    expect(screen.getByText('landing-page.html')).toBeTruthy()
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByText('Code')).toBeTruthy()
    expect(screen.getByText('Diff')).toBeTruthy()
  })

  it('switches to Code tab and allows content editing', () => {
    render(<ShellEditor shellId="shell_1" onBack={() => {}} />)

    const codeTab = screen.getByText('Code')
    fireEvent.click(codeTab)

    const textarea = screen.getByLabelText('Shell content editor') as HTMLTextAreaElement
    expect(textarea.value).toBe('<h1>Hello Golti</h1>')

    fireEvent.change(textarea, { target: { value: '<h1>Updated Golti</h1>' } })
    expect(textarea.value).toBe('<h1>Updated Golti</h1>')
  })

  it('opens Apply to File input box and triggers saveShellToFile API', async () => {
    render(<ShellEditor shellId="shell_1" onBack={() => {}} />)

    const applyBtn = screen.getByText('Apply to File')
    fireEvent.click(applyBtn)

    expect(screen.getByPlaceholderText('e.g. src/components/MyWidget.tsx')).toBeTruthy()

    const writeBtn = screen.getByText('Write')
    fireEvent.click(writeBtn)

    expect(window.goltiAPI.saveShellToFile).toHaveBeenCalled()
  })

  it('applies auto-fixed Mermaid content into the editor and marks Diff dirty', () => {
    render(<ShellEditor shellId="shell_mermaid" onBack={() => {}} />)

    fireEvent.click(screen.getByText('Apply to editor'))

    expect(screen.getByText('Diff •')).toBeTruthy()

    fireEvent.click(screen.getByText('Code'))
    const textarea = screen.getByLabelText('Shell content editor') as HTMLTextAreaElement
    expect(textarea.value).toContain('Success / Login / Authenticate')
  })
})

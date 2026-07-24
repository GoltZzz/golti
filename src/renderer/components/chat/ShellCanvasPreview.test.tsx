// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ShellCanvasPreview } from './ShellCanvasPreview'
import { sanitizeMermaid } from '../../../shared/mermaid-sanitize'

const renderMock = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: (...args: unknown[]) => renderMock(...args)
  }
}))

const BAD_DIAGRAM = `graph LR
A[User] ---| Login Page| B
E[Success| Login| Authenticate| Authenticated| Failure| Login Faile`

afterEach(() => {
  cleanup()
  renderMock.mockReset()
})

describe('ShellCanvasPreview Mermaid auto-fix', () => {
  it('retries with sanitized content and offers Apply to editor', async () => {
    renderMock.mockImplementation(async (_id: string, source: string) => {
      if (source === BAD_DIAGRAM) {
        throw new Error(
          "Parse error on line 3:\nE[Success| Login|\n--------^\nExpecting 'TAGEND', got 'PIPE'"
        )
      }
      return { svg: '<svg data-testid="mermaid-svg">ok</svg>', bindFunctions: undefined }
    })

    const onApply = vi.fn()
    render(
      <ShellCanvasPreview content={BAD_DIAGRAM} language="mermaid" onApplyFixedContent={onApply} />
    )

    await waitFor(() => {
      expect(screen.getByText('Auto-fixed Mermaid syntax')).toBeTruthy()
    })

    expect(screen.getByText('Replaced | inside node labels')).toBeTruthy()
    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(renderMock.mock.calls[1][1]).toBe(sanitizeMermaid(BAD_DIAGRAM).content)

    fireEvent.click(screen.getByText('Apply to editor'))
    expect(onApply).toHaveBeenCalledTimes(1)
    const fixed = onApply.mock.calls[0][0] as string
    expect(fixed).toBe(sanitizeMermaid(BAD_DIAGRAM).content)
  })

  it('shows a friendly error when sanitize cannot recover', async () => {
    renderMock.mockRejectedValue(
      new Error("Parse error on line 1:\nfoo\n---^\nExpecting 'TAGEND', got 'PIPE'")
    )

    // Content that sanitize cannot make renderable (mock always rejects)
    render(<ShellCanvasPreview content={'graph LR\nA[broken|still'} language="mermaid" />)

    await waitFor(() => {
      expect(screen.getByText('Mermaid parse error on line 1')).toBeTruthy()
    })
    expect(screen.getByText(/Remove `\|` from inside node labels/)).toBeTruthy()
    expect(screen.getByText(/Switch to the Code tab/)).toBeTruthy()
  })

  it('renders valid Mermaid without an auto-fix banner', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>valid</svg>', bindFunctions: undefined })

    render(
      <ShellCanvasPreview
        content={'graph LR\nA[User] ---| Login Page| B[Next]'}
        language="mermaid"
        onApplyFixedContent={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Auto-fixed Mermaid syntax')).toBeNull()
  })
})

/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { explainMermaidError, sanitizeMermaid } from './mermaid-sanitize'

const SCREENSHOT_DIAGRAM = `graph LR
A[User] ---| Login Page| B
B[Username] ---| Input Username| C
C[Username] ---| Input Password| D
D[Password] ---| Submit| E
E[Success| Login| Authenticate| Authenticated| Failure| Login Faile`

describe('sanitizeMermaid', () => {
  it('fixes pipes inside node labels and closes unclosed brackets (screenshot fixture)', async () => {
    const { content, fixes } = sanitizeMermaid(SCREENSHOT_DIAGRAM)

    expect(fixes).toContain('Replaced | inside node labels')
    expect(fixes).toContain('Closed unclosed node labels')

    const lastLine = content.trimEnd().split('\n').at(-1)!
    expect(lastLine).toMatch(/^E\[/)
    expect(lastLine).toMatch(/\]$/)
    // No raw pipes remain inside the node brackets
    const inside = lastLine.slice(lastLine.indexOf('[') + 1, lastLine.lastIndexOf(']'))
    expect(inside).not.toContain('|')
    expect(inside).toContain(' / ')

    // Edge labels on earlier lines preserved
    expect(content).toContain('---| Login Page|')
    expect(content).toContain('---| Submit|')

    mermaid.initialize({ startOnLoad: false })
    await expect(mermaid.parse(content)).resolves.toBeTruthy()
  })

  it('preserves edge labels unchanged', () => {
    const source = 'A[User] ---| Login Page| B'
    const { content, fixes } = sanitizeMermaid(source)
    expect(content).toBe(source)
    expect(fixes).toEqual([])
  })

  it('is idempotent for already-valid Mermaid', () => {
    const source = `flowchart TD
  Start[Start] --> Middle{Decision}
  Middle -->|Yes| Ok[OK]
  Middle -->|No| Fail[Fail]`
    const once = sanitizeMermaid(source)
    expect(once.content).toBe(source)
    expect(once.fixes).toEqual([])

    const twice = sanitizeMermaid(once.content)
    expect(twice.content).toBe(once.content)
    expect(twice.fixes).toEqual([])
  })

  it('strips a dangling trailing edge pipe', () => {
    const { content, fixes } = sanitizeMermaid('A[Start] ---|')
    expect(content).toBe('A[Start] ---')
    expect(fixes).toContain('Removed dangling edge | at end of line')
  })
})

describe('explainMermaidError', () => {
  it('extracts line number and PIPE tip', () => {
    const message =
      "Parse error on line 6:\n...ubmit| E\nE[Success| Login| Authenticat\n-----------------------^\nExpecting 'SQE', 'TAGEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'PIPE'"

    const explained = explainMermaidError(message, SCREENSHOT_DIAGRAM)
    expect(explained.line).toBe(6)
    expect(explained.summary).toBe('Mermaid parse error on line 6')
    expect(explained.tip).toMatch(/node labels/)
    expect(explained.offendingLine).toContain('E[Success|')
  })

  it('suggests closing brackets for TAGEND errors', () => {
    const explained = explainMermaidError("Parse error on line 2: Expecting 'TAGEND'", 'A[oops')
    expect(explained.tip).toMatch(/Close node labels/)
  })
})

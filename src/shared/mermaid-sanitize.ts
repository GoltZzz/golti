const OPEN_TO_CLOSE: Record<string, string> = {
  '[': ']',
  '(': ')',
  '{': '}'
}

export interface SanitizeMermaidResult {
  content: string
  fixes: string[]
}

export interface MermaidErrorExplanation {
  summary: string
  line?: number
  tip?: string
  offendingLine?: string
}

/**
 * Deterministic Mermaid cleanup for common AI mistakes (flowchart-focused).
 * Does not touch edge labels like `---| Login Page|`.
 */
export function sanitizeMermaid(source: string): SanitizeMermaidResult {
  const lines = source.split('\n')
  let replacedPipes = false
  let closedBrackets = false
  let trimmedTrailing = false

  const fixedLines = lines.map((line) => {
    const result = sanitizeLine(line)
    if (result.replacedPipes) replacedPipes = true
    if (result.closedBrackets) closedBrackets = true
    if (result.trimmedTrailing) trimmedTrailing = true
    return result.line
  })

  const fixes: string[] = []
  if (replacedPipes) fixes.push('Replaced | inside node labels')
  if (closedBrackets) fixes.push('Closed unclosed node labels')
  if (trimmedTrailing) fixes.push('Removed dangling edge | at end of line')

  return {
    content: fixedLines.join('\n'),
    fixes
  }
}

function sanitizeLine(line: string): {
  line: string
  replacedPipes: boolean
  closedBrackets: boolean
  trimmedTrailing: boolean
} {
  let out = ''
  const closerStack: string[] = []
  let replacedPipes = false
  let closedBrackets = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (closerStack.length > 0 && ch === '|') {
      out += ' / '
      replacedPipes = true
      continue
    }

    const closer = OPEN_TO_CLOSE[ch]
    if (closer) {
      closerStack.push(closer)
      out += ch
      continue
    }

    if (closerStack.length > 0 && ch === closerStack[closerStack.length - 1]) {
      closerStack.pop()
      out += ch
      continue
    }

    out += ch
  }

  if (closerStack.length > 0) {
    while (closerStack.length > 0) {
      out += closerStack.pop()
    }
    closedBrackets = true
  }

  let trimmedTrailing = false
  // Incomplete edge fragment ending with an unmatched `|` (odd count outside node shapes).
  if (/\|\s*$/.test(out) && countOutsidePipes(out) % 2 === 1) {
    out = out.replace(/\s*\|\s*$/, '')
    trimmedTrailing = true
  }

  return { line: out, replacedPipes, closedBrackets, trimmedTrailing }
}

function countOutsidePipes(line: string): number {
  let count = 0
  const closerStack: string[] = []
  for (const ch of line) {
    const closer = OPEN_TO_CLOSE[ch]
    if (closer) {
      closerStack.push(closer)
      continue
    }
    if (closerStack.length > 0 && ch === closerStack[closerStack.length - 1]) {
      closerStack.pop()
      continue
    }
    if (closerStack.length === 0 && ch === '|') count++
  }
  return count
}

export function explainMermaidError(message: string, source: string): MermaidErrorExplanation {
  const lineMatch = message.match(/on line\s+(\d+)/i)
  const line = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined

  let tip: string | undefined
  if (/got\s+'PIPE'|got\s+"PIPE"/i.test(message)) {
    tip = 'Remove `|` from inside node labels; use `|label|` only on edges.'
  } else if (/TAGEND/i.test(message)) {
    tip = 'Close node labels with `]` / `)` / `}`.'
  }

  const lines = source.split('\n')
  const offendingLine =
    line !== undefined && line >= 1 && line <= lines.length ? lines[line - 1] : undefined

  const summary =
    line !== undefined ? `Mermaid parse error on line ${line}` : 'Mermaid failed to parse this diagram'

  return { summary, line, tip, offendingLine }
}

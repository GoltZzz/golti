import React from 'react'

interface ShellDiffViewProps {
  originalContent: string
  editedContent: string
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed'
  lineNumOriginal?: number
  lineNumEdited?: number
  text: string
}

function computeSimpleDiff(original: string, edited: string): DiffLine[] {
  const origLines = original.split('\n')
  const editLines = edited.split('\n')
  const result: DiffLine[] = []

  let i = 0
  let j = 0

  while (i < origLines.length || j < editLines.length) {
    if (i < origLines.length && j < editLines.length && origLines[i] === editLines[j]) {
      result.push({
        type: 'unchanged',
        lineNumOriginal: i + 1,
        lineNumEdited: j + 1,
        text: origLines[i]
      })
      i++
      j++
    } else {
      if (i < origLines.length && !editLines.includes(origLines[i], j)) {
        result.push({
          type: 'removed',
          lineNumOriginal: i + 1,
          text: origLines[i]
        })
        i++
      } else if (j < editLines.length) {
        result.push({
          type: 'added',
          lineNumEdited: j + 1,
          text: editLines[j]
        })
        j++
      } else {
        result.push({
          type: 'removed',
          lineNumOriginal: i + 1,
          text: origLines[i]
        })
        i++
      }
    }
  }

  return result
}

export const ShellDiffView: React.FC<ShellDiffViewProps> = ({ originalContent, editedContent }) => {
  const diffLines = computeSimpleDiff(originalContent, editedContent)

  return (
    <div
      className="shell-diff-container"
      style={{
        height: '100%',
        overflow: 'auto',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        background: 'var(--bg-main, #0f1117)',
        borderRadius: 'var(--radius-md, 6px)',
        border: '1px solid var(--border-subtle, #2d3342)',
        padding: '8px 0'
      }}
    >
      {diffLines.map((line, idx) => {
        let bg = 'transparent'
        let color = 'var(--text-muted, #94a3b8)'
        let prefix = ' '

        if (line.type === 'added') {
          bg = 'rgba(34, 197, 94, 0.12)'
          color = '#4ade80'
          prefix = '+'
        } else if (line.type === 'removed') {
          bg = 'rgba(239, 68, 68, 0.12)'
          color = '#f87171'
          prefix = '-'
        } else {
          color = 'var(--text-primary, #e2e8f0)'
        }

        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              background: bg,
              lineHeight: '1.6',
              padding: '0 8px',
              gap: 12
            }}
          >
            <span
              style={{
                width: 32,
                textAlign: 'right',
                userSelect: 'none',
                color: 'var(--text-muted, #64748b)',
                fontSize: 11
              }}
            >
              {line.lineNumOriginal || ''}
            </span>
            <span
              style={{
                width: 32,
                textAlign: 'right',
                userSelect: 'none',
                color: 'var(--text-muted, #64748b)',
                fontSize: 11
              }}
            >
              {line.lineNumEdited || ''}
            </span>
            <span style={{ width: 12, userSelect: 'none', color, fontWeight: 'bold' }}>{prefix}</span>
            <span style={{ flex: 1, whiteSpace: 'pre-wrap', color }}>{line.text}</span>
          </div>
        )
      })}
    </div>
  )
}

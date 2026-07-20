import React, { useState, useRef, useEffect } from 'react'
import { Send, ArrowUp } from 'lucide-react'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (text.trim() && !disabled) {
        onSend(text.trim())
        setText('')
      }
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [text])

  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      borderTop: '1px solid var(--border-subtle)',
      backgroundColor: 'var(--bg-app)'
    }}>
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--bg-input)',
        border: '1px solid var(--border-medium)',
        padding: '8px 12px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Golti anything... (Shift+Enter for newline)"
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '14px',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
            maxHeight: '180px',
            fontFamily: 'var(--font-sans)'
          }}
        />

        <button
          onClick={() => {
            if (text.trim() && !disabled) {
              onSend(text.trim())
              setText('')
            }
          }}
          disabled={!text.trim() || disabled}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: text.trim() && !disabled ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
            color: text.trim() && !disabled ? 'var(--text-on-accent)' : 'var(--text-muted)',
            transition: 'all var(--transition-fast)',
            marginLeft: 'var(--space-2)'
          }}
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  )
}

import React, { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  label: React.ReactNode
  shortcut?: string
  position?: 'top' | 'bottom'
  multiline?: boolean
  maxWidth?: string | number
  delay?: number
  children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  shortcut,
  position = 'bottom',
  multiline = false,
  maxWidth,
  delay = 400,
  children
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsVisible(false)
  }

  const handleFocus = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsVisible(true)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const bubbleClasses = [
    'tooltip-bubble',
    position === 'top' ? 'tooltip-top' : 'tooltip-bottom',
    multiline ? 'tooltip-multiline' : ''
  ].filter(Boolean).join(' ')

  const style: React.CSSProperties = {}
  if (maxWidth) {
    style.maxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth
  }

  return (
    <div
      className="tooltip-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div className={bubbleClasses} style={style} role="tooltip">
          <span>{label}</span>
          {shortcut && (
            <>
              <span className="tooltip-sep">•</span>
              <kbd className="tooltip-shortcut">{shortcut}</kbd>
            </>
          )}
        </div>
      )}
    </div>
  )
}

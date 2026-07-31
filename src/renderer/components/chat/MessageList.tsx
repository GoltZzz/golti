import React, { useEffect, useLayoutEffect, useRef } from 'react'
import type { Message } from '../../../shared/types'
import { MessageBubble } from './MessageBubble'
import { useChatStore } from '../../stores/chatStore'

interface MessageListProps {
  messages: Message[]
  onScrollStateChange?: (isScrolled: boolean) => void
}

export const MessageList: React.FC<MessageListProps> = ({ messages, onScrollStateChange }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const prevMessageCountRef = useRef(messages.length)
  const touchStartYRef = useRef<number | null>(null)

  // Synchronously catch mouse wheel up to un-stick auto-scroll before stream updates fire
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      userScrolledUpRef.current = true
    } else if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current
      if (scrollHeight - scrollTop - clientHeight <= 15) {
        userScrolledUpRef.current = false
      }
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current !== null) {
      const deltaY = e.touches[0].clientY - touchStartYRef.current
      // Swiping down on screen moves scroll upwards
      if (deltaY > 6) {
        userScrolledUpRef.current = true
      }
    }
  }

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

    if (onScrollStateChange) {
      onScrollStateChange(scrollTop > 20)
    }

    if (distanceToBottom <= 15) {
      userScrolledUpRef.current = false
    } else if (distanceToBottom > 25) {
      userScrolledUpRef.current = true
    }
  }

  const highlightedMessageId = useChatStore((s) => s.highlightedMessageId)
  const setHighlightedMessageId = useChatStore((s) => s.setHighlightedMessageId)

  useEffect(() => {
    if (!highlightedMessageId) return
    const el = document.getElementById(`msg-${highlightedMessageId}`)
    if (el) {
      userScrolledUpRef.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const timer = setTimeout(() => {
        setHighlightedMessageId(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightedMessageId, messages, setHighlightedMessageId])

  useEffect(() => {
    // If a new message was added (e.g. user submitted a message), reset scroll state to bottom
    if (messages.length > prevMessageCountRef.current) {
      userScrolledUpRef.current = false
      prevMessageCountRef.current = messages.length
    }
  }, [messages.length])

  // Instant scroll-to-bottom on stream updates without layout thrashing or scrollIntoView jitter
  useLayoutEffect(() => {
    if (!userScrolledUpRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className="chat-transcript"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div className="chat-transcript-inner">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  )
}


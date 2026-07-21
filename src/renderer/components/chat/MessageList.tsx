import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import type { Message } from '../../../shared/types'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: Message[]
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)
  const userScrolledUpRef = useRef(false)
  const prevMessageCountRef = useRef(messages.length)
  const touchStartYRef = useRef<number | null>(null)

  const lastMessage = messages[messages.length - 1]
  const isStreaming = Boolean(lastMessage?.isStreaming)

  // Synchronously catch mouse wheel up to un-stick auto-scroll before stream updates fire
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      userScrolledUpRef.current = true
      setShowScrollBottomBtn(true)
    } else if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current
      if (scrollHeight - scrollTop - clientHeight <= 30) {
        userScrolledUpRef.current = false
        setShowScrollBottomBtn(false)
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
        setShowScrollBottomBtn(true)
      }
    }
  }

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

    if (distanceToBottom <= 40) {
      userScrolledUpRef.current = false
      setShowScrollBottomBtn(false)
    } else if (distanceToBottom > 80 && !userScrolledUpRef.current) {
      userScrolledUpRef.current = true
      setShowScrollBottomBtn(true)
    }
  }

  useEffect(() => {
    // If a new message was added (e.g. user submitted a message), reset scroll state to bottom
    if (messages.length > prevMessageCountRef.current) {
      userScrolledUpRef.current = false
      setShowScrollBottomBtn(false)
      prevMessageCountRef.current = messages.length
    }
  }, [messages.length])

  // Instant scroll-to-bottom on stream updates without layout thrashing or scrollIntoView jitter
  useLayoutEffect(() => {
    if (!userScrolledUpRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  const scrollToBottom = () => {
    userScrolledUpRef.current = false
    setShowScrollBottomBtn(false)
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

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

      {showScrollBottomBtn && (
        <button
          className="chat-scroll-bottom-btn animate-fade-in"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          {isStreaming ? (
            <>
              <span className="scroll-btn-pulse" />
              <span>AI responding…</span>
              <ArrowDown size={13} />
            </>
          ) : (
            <>
              <span>Scroll to bottom</span>
              <ArrowDown size={13} />
            </>
          )}
        </button>
      )}
    </div>
  )
}

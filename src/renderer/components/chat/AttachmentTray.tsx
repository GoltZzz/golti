import React, { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { MessageAttachment } from '../../../shared/types'

/**
 * Thumbnails arrive as data URLs over IPC rather than file:// paths, so the
 * renderer never needs filesystem access and no custom protocol is required.
 */
export function useAttachmentThumb(id: string, thumbPath?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    window.goltiAPI
      .readAttachmentThumbUrl(id)
      .then((data: string | null) => {
        if (!cancelled) setUrl(data)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [id, thumbPath])

  return url
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ChipProps {
  attachment: MessageAttachment
  onRemove: (id: string) => void
  warn?: boolean
}

function AttachmentChip({ attachment, onRemove, warn }: ChipProps): React.JSX.Element {
  const thumb = useAttachmentThumb(attachment.id, attachment.thumbPath)
  const dims =
    attachment.width && attachment.height ? `${attachment.width}×${attachment.height}` : null

  return (
    <div
      className={`attachment-chip ${warn ? 'is-warn' : ''} ${attachment.error ? 'is-error' : ''}`}
      title={[attachment.name, dims, formatBytes(attachment.byteSize)]
        .filter(Boolean)
        .join(' · ')}
    >
      <span className="attachment-chip-thumb">
        {thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <span className="attachment-chip-placeholder" aria-hidden="true" />
        )}
      </span>
      <span className="attachment-chip-meta">
        <span className="attachment-chip-name">{attachment.name}</span>
        <span className="attachment-chip-sub">
          {warn && <AlertTriangle size={10} aria-hidden="true" />}
          {attachment.error || dims || formatBytes(attachment.byteSize)}
        </span>
      </span>
      <button
        type="button"
        className="attachment-chip-remove"
        onClick={() => onRemove(attachment.id)}
        aria-label={`Remove ${attachment.name}`}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  )
}

interface TrayProps {
  attachments: MessageAttachment[]
  onRemove: (id: string) => void
  warn?: boolean
}

export function AttachmentTray({ attachments, onRemove, warn }: TrayProps): React.JSX.Element | null {
  if (attachments.length === 0) return null

  return (
    <div className="attachment-tray">
      {attachments.map((att) => (
        <AttachmentChip key={att.id} attachment={att} onRemove={onRemove} warn={warn} />
      ))}
    </div>
  )
}

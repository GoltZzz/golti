import React, { useState } from 'react'
import { X } from 'lucide-react'
import type { MessageAttachment } from '../../../shared/types'
import { useAttachmentThumb } from './AttachmentTray'

interface ThumbProps {
  attachment: MessageAttachment
  onOpen: (id: string) => void
}

function AttachmentThumb({ attachment, onOpen }: ThumbProps): React.JSX.Element {
  const thumb = useAttachmentThumb(attachment.id, attachment.thumbPath)
  const ratio =
    attachment.width && attachment.height ? attachment.width / attachment.height : undefined

  if (attachment.error) {
    return (
      <div className="msg-attachment is-error" title={attachment.error}>
        <span>{attachment.name}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="msg-attachment"
      style={ratio ? { aspectRatio: String(ratio) } : undefined}
      onClick={() => onOpen(attachment.id)}
      aria-label={`View ${attachment.name} full size`}
    >
      {thumb ? <img src={thumb} alt={attachment.name} /> : <span className="msg-attachment-skeleton" />}
    </button>
  )
}

interface LightboxProps {
  id: string
  onClose: () => void
}

function Lightbox({ id, onClose }: LightboxProps): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    window.goltiAPI
      .readAttachmentDataUrl(id)
      .then((data: string | null) => {
        if (!cancelled) setUrl(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="attachment-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button
        type="button"
        className="attachment-lightbox-close"
        onClick={onClose}
        aria-label="Close image"
      >
        <X size={18} aria-hidden="true" />
      </button>
      {url && <img src={url} alt="" onClick={(e) => e.stopPropagation()} />}
    </div>
  )
}

interface Props {
  attachments: MessageAttachment[]
}

export function MessageAttachments({ attachments }: Props): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <>
      <div className="msg-attachments">
        {attachments.map((att) => (
          <AttachmentThumb key={att.id} attachment={att} onOpen={setOpenId} />
        ))}
      </div>
      {openId && <Lightbox id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}

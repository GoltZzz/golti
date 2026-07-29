import React, { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Body copy. Pass a node when part of it needs emphasis. */
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busyLabel?: string
  isBusy?: boolean
  error?: string | null
  icon?: React.ReactNode
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal yes/no confirmation for destructive actions. Reuses the cookbook delete
 * dialog styling so confirmations look the same everywhere in the app.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busyLabel,
  isBusy = false,
  error = null,
  icon,
  onConfirm,
  onCancel
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    cancelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, isBusy, onCancel])

  if (!open) return null

  return (
    <div
      className="delete-model-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel()
      }}
    >
      <div
        className="delete-model-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="delete-model-header">
          <div className="delete-model-title-row">
            {icon ?? <AlertTriangle size={18} className="delete-model-icon" />}
            <h3 id="confirm-dialog-title">{title}</h3>
          </div>
          <button
            type="button"
            className="delete-model-close"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p id="confirm-dialog-desc" className="delete-model-desc">
          {message}
        </p>

        {error && (
          <div className="delete-model-error" role="alert">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div className="delete-model-actions">
          <button
            type="button"
            ref={cancelRef}
            className="delete-cancel-btn"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="delete-confirm-btn"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

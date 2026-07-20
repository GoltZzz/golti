import React, { useEffect, useRef } from 'react'
import { AlertTriangle, Trash2, X, Zap, CheckCircle2 } from 'lucide-react'

export type DeleteSource = 'engine' | 'ollama'

export interface DeleteSourceOption {
  id: DeleteSource
  label: string
  detail: string
  blocked: boolean
  blockedReason?: string
}

interface DeleteModelDialogProps {
  open: boolean
  modelName: string
  sources: DeleteSourceOption[]
  selectedSource: DeleteSource | null
  onSelectSource: (source: DeleteSource) => void
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  error: string | null
}

export const DeleteModelDialog: React.FC<DeleteModelDialogProps> = ({
  open,
  modelName,
  sources,
  selectedSource,
  onSelectSource,
  onConfirm,
  onCancel,
  isDeleting,
  error
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    cancelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, isDeleting, onCancel])

  if (!open) return null

  const selected = sources.find((s) => s.id === selectedSource)
  const canConfirm =
    !!selectedSource &&
    !!selected &&
    !selected.blocked &&
    !isDeleting

  const needsChoice = sources.length > 1

  return (
    <div
      className="delete-model-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onCancel()
      }}
    >
      <div
        className="delete-model-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-model-title"
        aria-describedby="delete-model-desc"
        ref={dialogRef}
      >
        <div className="delete-model-header">
          <div className="delete-model-title-row">
            <Trash2 size={18} className="delete-model-icon" />
            <h3 id="delete-model-title">Delete downloaded model</h3>
          </div>
          <button
            type="button"
            className="delete-model-close"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p id="delete-model-desc" className="delete-model-desc">
          Remove <strong>{modelName}</strong> from your device? This frees disk space and
          cannot be undone without re-downloading.
        </p>

        {needsChoice && (
          <p className="delete-model-hint">
            This model is installed from more than one source. Choose which copy to delete.
          </p>
        )}

        <div className="delete-source-list" role="radiogroup" aria-label="Delete source">
          {sources.map((source) => {
            const Icon = source.id === 'engine' ? Zap : CheckCircle2
            const isSelected = selectedSource === source.id
            return (
              <label
                key={source.id}
                className={`delete-source-option ${isSelected ? 'selected' : ''} ${
                  source.blocked ? 'blocked' : ''
                }`}
              >
                <input
                  type="radio"
                  name="delete-source"
                  value={source.id}
                  checked={isSelected}
                  disabled={source.blocked || isDeleting}
                  onChange={() => onSelectSource(source.id)}
                />
                <Icon size={16} className="delete-source-icon" />
                <div className="delete-source-text">
                  <span className="delete-source-label">{source.label}</span>
                  <span className="delete-source-detail">{source.detail}</span>
                  {source.blocked && source.blockedReason && (
                    <span className="delete-source-blocked">
                      <AlertTriangle size={12} /> {source.blockedReason}
                    </span>
                  )}
                </div>
              </label>
            )
          })}
        </div>

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
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="delete-confirm-btn"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

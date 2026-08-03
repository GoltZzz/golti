import React, { useEffect, useState } from 'react'
import { InstalledLocalModelInfo } from '../../../shared/types'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useChatStore } from '../../stores/chatStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useEngineStore } from '../../stores/engineStore'
import {
  MessageSquare,
  Trash2,
  HardDrive,
  Cpu,
  Zap,
  AlertTriangle,
  Layers,
  Eye,
  Loader2,
  Pause,
  Play,
  X
} from 'lucide-react'

interface InstalledModelCardProps {
  model: InstalledLocalModelInfo
}

export const InstalledModelCard: React.FC<InstalledModelCardProps> = ({ model }) => {
  const { deleteLocalEngineModel, deletingModel } = useCookbookStore()
  const {
    loadModel,
    localModels,
    projectors,
    projectorBusy,
    projectorErrors,
    projectorTargets,
    downloadingModels,
    fetchProjectorFor,
    installProjector,
    removeProjector,
    clearProjectorDownload,
    pauseDownload,
    cancelDownload
  } = useEngineStore()
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isGenerating = useChatStore((s) => s.isGenerating)
  const engineState = useEngineStore((s) => s.engineState)
  const engineBusy = isGenerating || engineState.status === 'starting' || engineState.status === 'stopping'

  const isDeletingThis = deletingModel === model.tag || isDeleting

  const projectorPath = projectors[model.tag]
  const projectorPending = !!projectorBusy[model.tag]
  const projectorError = projectorErrors[model.tag]
  const projectorTarget = projectorTargets[model.tag]
  const projectorProgress = projectorTarget ? downloadingModels[projectorTarget.filename] : undefined
  const projectorStatus = projectorProgress?.status
  const isProjectorDownloading =
    Boolean(projectorProgress) && (!projectorStatus || projectorStatus === 'downloading')
  const isProjectorPaused = projectorStatus === 'paused'
  const isProjectorErrored = projectorStatus === 'error'
  const showProjectorProgress =
    Boolean(projectorTarget) && (isProjectorDownloading || isProjectorPaused || isProjectorErrored)

  useEffect(() => {
    if (model.isGoltiEngine && projectors[model.tag] === undefined) {
      void fetchProjectorFor(model.tag)
    }
  }, [model.isGoltiEngine, model.tag, projectors, fetchProjectorFor])

  const handleStartChat = async () => {
    const chatStore = useChatStore.getState()
    const sidebarStore = useSidebarStore.getState()

    if (model.isGoltiEngine) {
      const matchLocal = localModels.find((lm) => lm.filename === model.tag)
      if (matchLocal) {
        await loadModel(matchLocal.filepath)
      }
    }

    if (chatStore.models.length === 0) {
      await chatStore.fetchModels()
    }

    const matchingModel = chatStore.models.find((m) => m.providerType === 'golti-engine')

    const providerId = matchingModel ? matchingModel.providerId : 'golti-engine-local'

    const fullModelTag = matchingModel ? matchingModel.name : model.tag

    const targetModelInfo = matchingModel || {
      id: `${providerId}:${fullModelTag}`,
      name: fullModelTag,
      providerId,
      providerType: model.providerType
    }

    chatStore.setSelectedModel(targetModelInfo)

    if (chatStore.currentConversationId) {
      if (chatStore.messages.length === 0) {
        await window.goltiAPI.updateConversation(chatStore.currentConversationId, {
          model: fullModelTag,
          providerId
        })
      }
      chatStore.fetchConversations()
    } else {
      await chatStore.newConversation()
    }

    sidebarStore.setActiveTab('chat')
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setIsDeleting(true)
    setErrorMsg(null)

    try {
      const res = await deleteLocalEngineModel(model.tag)

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to delete model')
        setIsDeleting(false)
        setConfirmDelete(false)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error deleting model')
      setIsDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="installed-model-card animate-fade-in">
      <div className="installed-card-header">
        <div className="installed-card-title">
          <div className="title-row">
            <h3>{model.name}</h3>
            <span className={`provider-badge provider-${model.providerType}`}>
              {model.isGoltiEngine ? <Zap size={12} /> : <Layers size={12} />}
              {model.providerName}
            </span>
          </div>
          <span className="installed-tag-subtitle">
            {model.tag} {model.catalogModelId ? '• Catalog Model' : '• Custom Local Model'}
          </span>
        </div>
      </div>

      <div className="installed-card-specs">
        {model.sizeFormatted && (
          <div className="spec-chip">
            <HardDrive size={13} />
            <span>{model.sizeFormatted}</span>
          </div>
        )}
        {model.parameterSize && (
          <div className="spec-chip">
            <Cpu size={13} />
            <span>{model.parameterSize}</span>
          </div>
        )}
        {model.quantizationLevel && (
          <div className="spec-chip">
            <Zap size={13} />
            <span>{model.quantizationLevel}</span>
          </div>
        )}
        {model.family && (
          <div className="spec-chip">
            <Layers size={13} />
            <span style={{ textTransform: 'capitalize' }}>{model.family}</span>
          </div>
        )}
      </div>

      {model.isGoltiEngine && (
        <div className="installed-card-vision">
          <div className="vision-status">
            <Eye size={13} />
            {projectorPath ? (
              <span>Vision enabled — {projectorPath.split('/').pop()}</span>
            ) : (
              <span>No vision support — images are disabled for this model</span>
            )}
          </div>
          {projectorPath ? (
            <button className="btn-vision" onClick={() => void removeProjector(model.tag)}>
              Remove
            </button>
          ) : !showProjectorProgress ? (
            <button
              className="btn-vision"
              onClick={() => void installProjector(model.tag)}
              disabled={projectorPending}
            >
              {projectorPending ? (
                <>
                  <Loader2 size={13} className="spin" /> Finding...
                </>
              ) : (
                'Add vision support'
              )}
            </button>
          ) : null}
        </div>
      )}

      {showProjectorProgress && projectorTarget && (
        <div className="pull-progress-container projector-progress">
          <div className="pull-status-row">
            <span className="status-text">
              {isProjectorDownloading ? (
                <Loader2 size={12} className="spin" />
              ) : isProjectorPaused ? (
                <Pause size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}{' '}
              {isProjectorPaused
                ? 'Paused'
                : isProjectorErrored
                  ? 'Projector download failed'
                  : projectorProgress?.speed || 'Downloading vision projector...'}
            </span>
            <span className="percent-text">{projectorProgress?.percent || 0}%</span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${projectorProgress?.percent || 0}%`,
                backgroundColor: isProjectorErrored ? '#e06c75' : '#e5c07b'
              }}
            ></div>
          </div>
          <div className="pull-action-row">
            {isProjectorDownloading ? (
              <>
                <button
                  type="button"
                  className="pull-action-btn"
                  onClick={() => void pauseDownload(projectorTarget.filename)}
                >
                  <Pause size={12} /> Pause
                </button>
                <button
                  type="button"
                  className="pull-action-btn pull-action-danger"
                  onClick={() => void cancelDownload(projectorTarget.filename)}
                >
                  <X size={12} /> Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="pull-action-btn"
                  onClick={() => void installProjector(model.tag)}
                >
                  <Play size={12} /> Resume
                </button>
                <button
                  type="button"
                  className="pull-action-btn pull-action-danger"
                  onClick={() => void clearProjectorDownload(model.tag)}
                >
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {projectorError && (
        <div className="installed-card-error">
          <AlertTriangle size={13} /> {projectorError}
        </div>
      )}

      {errorMsg && (
        <div className="installed-card-error">
          <AlertTriangle size={13} /> {errorMsg}
        </div>
      )}

      <div className="installed-card-actions">
        <button
          className="btn-chat-installed"
          onClick={handleStartChat}
          disabled={engineBusy}
          title={engineBusy ? 'Engine is busy' : undefined}
        >
          <MessageSquare size={14} /> Start Chat
        </button>

        <button
          className={`btn-delete-installed ${confirmDelete ? 'confirming' : ''}`}
          onClick={handleDelete}
          disabled={isDeletingThis || engineBusy}
          title={engineBusy ? 'Engine is busy' : undefined}
        >
          <Trash2 size={14} />
          {isDeletingThis
            ? 'Deleting...'
            : confirmDelete
            ? 'Confirm Delete?'
            : 'Delete'}
        </button>
      </div>
    </div>
  )
}

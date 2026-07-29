import React, { useMemo, useState } from 'react'
import { CookbookModel, SystemInfoFull } from '../../../shared/types'
import { describeDiskFit, getCompatibility, getDiskFit } from '../../../shared/compatibility'
import { describeOffload, estimateOffload } from '../../../shared/gpu-offload'
import { useChatStore } from '../../stores/chatStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useEngineStore } from '../../stores/engineStore'
import {
  DeleteModelDialog,
  DeleteSource,
  DeleteSourceOption
} from './DeleteModelDialog'
import {
  Cpu,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Zap,
  Trash2,
  Pause,
  Play,
  X,
  Search,
  Gauge
} from 'lucide-react'

interface ModelCardProps {
  model: CookbookModel
  systemInfo: SystemInfoFull | null
  isInstalled?: boolean
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  systemInfo,
  isInstalled
}) => {
  const {
    localModels,
    downloadingModels,
    downloadErrors,
    isInstallingBinary,
    engineState,
    resolving,
    resolvedModels,
    resolveErrors,
    clearResolveError,
    installEngine,
    downloadModel,
    resolveAndDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    clearDownload,
    loadModel,
    deleteLocalModel
  } = useEngineStore()

  const selectedModel = useChatStore((s) => s.selectedModel)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedSource, setSelectedSource] = useState<DeleteSource | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [engineActionBusy, setEngineActionBusy] = useState(false)

  const isEngineInstalled = engineState.status !== 'not-installed'

  const resolved = model.ollamaTag ? resolvedModels[model.ollamaTag] : undefined
  const ggufFilename = model.ggufFilename || resolved?.ggufFilename
  const ggufUrl = model.ggufUrl || resolved?.ggufUrl

  const isEngineModelDownloaded = ggufFilename
    ? localModels.some((lm) => lm.filename === ggufFilename)
    : false

  const engineDownloadProgress = ggufFilename ? downloadingModels[ggufFilename] : undefined
  const engineDownloadError = ggufFilename
    ? downloadErrors[ggufFilename] || engineDownloadProgress?.error
    : undefined
  const engineStatus = engineDownloadProgress?.status
  const isEngineDownloading = Boolean(engineDownloadProgress) && (!engineStatus || engineStatus === 'downloading')
  const isEnginePaused = engineStatus === 'paused'
  const isEngineErrored = engineStatus === 'error' || Boolean(engineDownloadError && engineDownloadProgress)
  const showEngineProgress =
    Boolean(engineDownloadProgress) &&
    (isEngineDownloading || isEnginePaused || isEngineErrored)

  const isResolving = !!resolving[model.ollamaTag]
  const resolveError = model.ollamaTag ? resolveErrors[model.ollamaTag] : undefined

  const comp = getCompatibility(systemInfo, model)
  const diskFit = getDiskFit(systemInfo, model)
  const diskNote = describeDiskFit(systemInfo, model)
  // How much of this model the GPU can hold. Rated against total VRAM, not the
  // live reading, so the badge does not change while the user is looking at it.
  // Downloaded models carry their real GGUF geometry, which upgrades the
  // estimate to a measurement and drops the hedging language.
  const localGeometry = ggufFilename
    ? localModels.find((lm) => lm.filename === ggufFilename)?.geometry
    : undefined
  const offloadNote = describeOffload(systemInfo, model, localGeometry)
  const offloadFit = estimateOffload(systemInfo, model, localGeometry).fit
  const diskBlocked = diskFit === 'insufficient'

  const isEngineActive = useMemo(() => {
    if (!ggufFilename || !engineState.loadedModel) return false
    return engineState.loadedModel.split(/[/\\]/).pop() === ggufFilename
  }, [ggufFilename, engineState.loadedModel])

  const isEngineSelectedInChat = useMemo(() => {
    if (!selectedModel || selectedModel.providerType !== 'golti-engine' || !ggufFilename) {
      return false
    }
    const selectedName = selectedModel.name.toLowerCase().replace(/\.gguf$/, '')
    const ggufName = ggufFilename.toLowerCase().replace(/\.gguf$/, '')
    return selectedName === ggufName || selectedModel.name === ggufFilename
  }, [selectedModel, ggufFilename])

  const deleteSources: DeleteSourceOption[] = useMemo(() => {
    const sources: DeleteSourceOption[] = []
    if (isEngineModelDownloaded && ggufFilename) {
      const blocked = isEngineActive || isEngineSelectedInChat
      sources.push({
        id: 'engine',
        label: 'Golti Engine (GGUF)',
        detail: ggufFilename,
        blocked,
        blockedReason: blocked
          ? isEngineActive
            ? 'Currently loaded in Golti Engine. Switch or unload it first.'
            : 'Currently selected for chat. Choose a different model first.'
          : undefined
      })
    }
    return sources
  }, [isEngineModelDownloaded, ggufFilename, isEngineActive, isEngineSelectedInChat])

  const getCompBadge = () => {
    switch (comp) {
      case 'great':
        return (
          <span className="comp-badge comp-great">
            <CheckCircle2 size={12} /> Runs Great
          </span>
        )
      case 'runs':
        return (
          <span className="comp-badge comp-runs">
            <CheckCircle2 size={12} /> Runs
          </span>
        )
      case 'tight':
        return (
          <span className="comp-badge comp-tight">
            <AlertTriangle size={12} /> Tight Fit
          </span>
        )
      case 'wont_fit':
        return (
          <span className="comp-badge comp-wont">
            <XCircle size={12} /> Won't Fit
          </span>
        )
      default:
        return null
    }
  }

  const handleOpenInChat = async () => {
    const chatStore = useChatStore.getState()
    const sidebarStore = useSidebarStore.getState()

    if (ggufFilename) {
      const matchLocal = localModels.find((lm) => lm.filename === ggufFilename)
      if (matchLocal) {
        await loadModel(matchLocal.filepath)
      }
    }

    if (chatStore.models.length === 0) {
      await chatStore.fetchModels()
    }

    const matchingModel = chatStore.models.find((m) => m.providerType === 'golti-engine')

    const providerId = matchingModel ? matchingModel.providerId : 'golti-engine-local'
    const fullModelTag = matchingModel
      ? matchingModel.name
      : ggufFilename?.replace(/\.gguf$/, '') || model.name

    const targetModelInfo = matchingModel || {
      id: `${providerId}:${fullModelTag}`,
      name: fullModelTag,
      providerId,
      providerType: 'golti-engine' as const
    }

    chatStore.setSelectedModel(targetModelInfo)

    if (chatStore.currentConversationId) {
      if (chatStore.messages.length === 0) {
        await window.goltiAPI.updateConversation(chatStore.currentConversationId, {
          model: fullModelTag,
          providerId
        })
        await chatStore.selectConversation(chatStore.currentConversationId)
      } else {
        const newConvId = await chatStore.newConversation()
        await window.goltiAPI.updateConversation(newConvId, {
          model: fullModelTag,
          providerId
        })
        await chatStore.selectConversation(newConvId)
      }
    } else {
      const newConvId = await chatStore.newConversation()
      await window.goltiAPI.updateConversation(newConvId, {
        model: fullModelTag,
        providerId
      })
      await chatStore.selectConversation(newConvId)
    }

    sidebarStore.setActiveTab('chat')
  }

  const handleEngineInstall = async () => {
    if (isInstallingBinary || isEngineDownloading || engineActionBusy || diskBlocked || isResolving) return
    setEngineActionBusy(true)
    try {
      if (!isEngineInstalled) {
        await installEngine()
      }
      if (ggufUrl && ggufFilename) {
        void downloadModel(ggufUrl, ggufFilename)
      } else if (model.ollamaTag) {
        void resolveAndDownload(model.ollamaTag, model.quantization)
      }
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleEnginePause = async () => {
    if (!ggufFilename || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      await pauseDownload(ggufFilename)
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleEngineCancel = async () => {
    if (!ggufFilename || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      await cancelDownload(ggufFilename)
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleEngineResume = () => {
    if (!ggufUrl || !ggufFilename || engineActionBusy || isEngineDownloading) return
    if (diskBlocked) return
    void resumeDownload(ggufUrl, ggufFilename)
  }

  const handleEngineClear = async () => {
    if (!ggufFilename || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      await clearDownload(ggufFilename)
    } finally {
      setEngineActionBusy(false)
    }
  }

  const openDeleteDialog = () => {
    setDeleteError(null)
    const available = deleteSources.filter((s) => !s.blocked)
    if (deleteSources.length === 1) {
      setSelectedSource(deleteSources[0].id)
    } else if (available.length === 1) {
      setSelectedSource(available[0].id)
    } else {
      setSelectedSource(null)
    }
    setDialogOpen(true)
  }

  const closeDeleteDialog = () => {
    if (isDeleting) return
    setDialogOpen(false)
    setDeleteError(null)
    setSelectedSource(null)
  }

  const handleConfirmDelete = async () => {
    if (!selectedSource || selectedSource !== 'engine') return
    const source = deleteSources.find((s) => s.id === selectedSource)
    if (!source || source.blocked || !ggufFilename) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const result = await deleteLocalModel(ggufFilename)
      if (!result.success) {
        setDeleteError(result.error || 'Failed to delete model')
        setIsDeleting(false)
        return
      }
      setIsDeleting(false)
      setDialogOpen(false)
      setSelectedSource(null)
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete model')
      setIsDeleting(false)
    }
  }

  const showDelete = isEngineModelDownloaded
  const hasGgufUrl = !!ggufUrl
  const canDownload = hasGgufUrl || !!model.ollamaTag

  return (
    <div className={`model-card animate-scale-in ${isEngineModelDownloaded ? 'installed-border' : ''}`}>
      {/* Card Header */}
      <div className="card-header">
        <div className="title-row">
          <h3 className="model-name">{model.name}</h3>
          {getCompBadge()}
        </div>
        <div className="meta-row">
          <span className="family-badge">{model.family.toUpperCase()}</span>
          <span className="meta-dot">•</span>
          <span>{model.parameterBillions}B parameters</span>
          <span className="meta-dot">•</span>
          <span className="quant-badge">{model.quantization}</span>
        </div>
      </div>

      {/* Description */}
      <p className="model-desc">{model.description}</p>

      {/* Highlights */}
      <div className="highlights-container">
        {model.highlights.map((h, i) => (
          <div key={i} className="highlight-item">
            <Sparkles size={10} className="sparkle-icon" />
            <span>{h}</span>
          </div>
        ))}
      </div>

      {/* Requirements Info */}
      <div className="requirements-grid">
        <div
          className="req-item"
          title={`Minimum RAM needed. Recommended: ${model.ramRecommendedGB} GB for long context.`}
        >
          <Cpu size={14} className="req-icon" />
          <div className="req-text">
            <span className="req-label">RAM Required</span>
            <span className="req-val">{model.ramRequiredGB} GB</span>
          </div>
        </div>
        <div className="req-item" title="Storage disk space required for GGUF model file">
          <HardDrive size={14} className="req-icon" />
          <div className="req-text">
            <span className="req-label">Disk Space</span>
            <span className="req-val">{model.diskSizeGB} GB</span>
          </div>
        </div>
      </div>

      {diskNote && !isEngineModelDownloaded && (
        <div className={`disk-note ${diskBlocked ? 'disk-note-blocked' : ''}`}>
          <AlertTriangle size={13} />
          <span>{diskNote}</span>
        </div>
      )}

      {offloadNote && (
        <div className={`offload-note ${offloadFit === 'cpu_only' ? 'offload-note-cpu' : ''}`}>
          <Gauge size={13} />
          <span>{offloadNote}</span>
        </div>
      )}

      {/* Footer / Actions */}
      <div className="card-footer" style={{ flexDirection: 'column', gap: '8px' }}>
        {isEngineModelDownloaded ? (
          <div className="installed-action-container" style={{ width: '100%' }}>
            <span className="installed-label" style={{ color: '#98c379' }}>
              <Zap size={14} className="installed-icon" /> Ready
            </span>
            <button onClick={handleOpenInChat} className="action-btn open-chat-btn">
              <MessageSquare size={13} /> Chat
            </button>
          </div>
        ) : showEngineProgress ? (
          <div className="pull-progress-container" style={{ width: '100%' }}>
            <div className="pull-status-row">
              <span className="status-text">
                {isEngineDownloading ? (
                  <RefreshCw size={12} className="spin" />
                ) : isEnginePaused ? (
                  <Pause size={12} />
                ) : (
                  <AlertTriangle size={12} />
                )}{' '}
                {isEnginePaused
                  ? 'Paused'
                  : isEngineErrored
                    ? 'Download failed'
                    : engineDownloadProgress?.speed || 'Downloading...'}
              </span>
              <span className="percent-text">{engineDownloadProgress?.percent || 0}%</span>
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${engineDownloadProgress?.percent || 0}%`,
                  backgroundColor: isEngineErrored ? '#e06c75' : '#e5c07b'
                }}
              ></div>
            </div>
            <div className="pull-action-row">
              {isEngineDownloading ? (
                <>
                  <button
                    type="button"
                    className="pull-action-btn"
                    onClick={handleEnginePause}
                    disabled={engineActionBusy}
                    title="Pause download"
                  >
                    <Pause size={12} /> Pause
                  </button>
                  <button
                    type="button"
                    className="pull-action-btn pull-action-danger"
                    onClick={handleEngineCancel}
                    disabled={engineActionBusy}
                    title="Cancel and discard partial download"
                  >
                    <X size={12} /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="pull-action-btn"
                    onClick={handleEngineResume}
                    disabled={engineActionBusy}
                    title="Resume download"
                  >
                    <Play size={12} /> Resume
                  </button>
                  <button
                    type="button"
                    className="pull-action-btn pull-action-danger"
                    onClick={handleEngineClear}
                    disabled={engineActionBusy}
                    title="Delete partial download"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ) : canDownload ? (
          <button
            onClick={handleEngineInstall}
            disabled={isInstallingBinary || isEngineDownloading || engineActionBusy || diskBlocked || isResolving}
            title={diskBlocked ? diskNote || 'Not enough free disk space' : undefined}
            className="action-btn"
            style={{
              width: '100%',
              backgroundColor: 'rgba(229, 192, 123, 0.15)',
              color: '#e5c07b',
              border: '1px solid rgba(229, 192, 123, 0.3)',
              borderRadius: '6px',
              padding: '7px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: 500,
              fontSize: '12px',
              cursor: diskBlocked ? 'not-allowed' : 'pointer',
              opacity: diskBlocked ? 0.5 : 1
            }}
          >
            {isResolving ? (
              <>
                <Search size={14} className="spin" />
                <span>Finding GGUF on Hugging Face…</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>
                  {diskBlocked
                    ? 'Not enough disk space'
                    : isInstallingBinary
                      ? 'Installing Golti Engine...'
                      : !isEngineInstalled
                        ? 'Install & Download (1-Click)'
                        : 'Download'}
                </span>
              </>
            )}
          </button>
        ) : null}

        {showDelete && (
          <button
            type="button"
            className="action-btn delete-model-btn"
            onClick={openDeleteDialog}
            disabled={isDeleting}
            title="Delete downloaded model"
          >
            <Trash2 size={14} />
            <span>{isDeleting ? 'Deleting…' : 'Delete'}</span>
          </button>
        )}
      </div>

      {engineDownloadError && (
        <div className="card-error-banner" role="alert">
          <AlertTriangle size={12} /> {engineDownloadError}
        </div>
      )}

      {!engineDownloadError && resolveError && (
        <div className="card-error-banner" role="alert">
          <AlertTriangle size={12} /> {resolveError}
          <button
            type="button"
            className="card-error-dismiss"
            onClick={() => clearResolveError(model.ollamaTag)}
            aria-label="Dismiss error"
          >
            <X size={11} />
          </button>
        </div>
      )}

      <DeleteModelDialog
        open={dialogOpen}
        modelName={model.name}
        sources={deleteSources}
        selectedSource={selectedSource}
        onSelectSource={setSelectedSource}
        onConfirm={handleConfirmDelete}
        onCancel={closeDeleteDialog}
        isDeleting={isDeleting}
        error={deleteError}
      />
    </div>
  )
}

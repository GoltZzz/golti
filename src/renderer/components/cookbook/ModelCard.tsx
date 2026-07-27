import React, { useMemo, useState } from 'react'
import { CookbookModel, SystemInfoFull } from '../../../shared/types'
import { getCompatibility } from '../../../shared/compatibility'
import { normalizeOllamaTag } from '../../../shared/ollama-tags'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useChatStore } from '../../stores/chatStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useEngineStore } from '../../stores/engineStore'
import { useOllamaProcessStore } from '../../stores/ollamaProcessStore'
import {
  DeleteModelDialog,
  DeleteSource,
  DeleteSourceOption
} from './DeleteModelDialog'
import {
  Cpu,
  HardDrive,
  CheckCircle2,
  Download,
  AlertTriangle,
  XCircle,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Zap,
  Trash2,
  Pause,
  Play,
  X
} from 'lucide-react'

interface ModelCardProps {
  model: CookbookModel
  systemInfo: SystemInfoFull | null
  isInstalled: boolean
  installedOllamaTag?: string
  isOllamaOnline: boolean
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  systemInfo,
  isInstalled,
  installedOllamaTag,
  isOllamaOnline
}) => {
  const {
    pullingModels,
    pullErrors,
    pullModel,
    cancelPull,
    clearPullState,
    deleteOllamaModel,
    deletingOllamaTag
  } = useCookbookStore()
  const {
    localModels,
    downloadingModels,
    downloadErrors,
    isInstallingBinary,
    engineState,
    installEngine,
    downloadModel,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    clearDownload,
    loadModel,
    deleteLocalModel
  } = useEngineStore()

  const selectedModel = useChatStore((s) => s.selectedModel)
  const ollamaProcessState = useOllamaProcessStore((s) => s.processState)
  const startOllama = useOllamaProcessStore((s) => s.startOllama)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedSource, setSelectedSource] = useState<DeleteSource | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [engineActionBusy, setEngineActionBusy] = useState(false)
  const [ollamaActionBusy, setOllamaActionBusy] = useState(false)

  const isOllamaStarting = ollamaProcessState.status === 'starting'

  const isEngineInstalled = engineState.status !== 'not-installed'
  const isEngineModelDownloaded = model.ggufFilename
    ? localModels.some((lm) => lm.filename === model.ggufFilename)
    : false

  const engineDownloadProgress = model.ggufFilename
    ? downloadingModels[model.ggufFilename]
    : undefined
  const engineDownloadError = model.ggufFilename
    ? downloadErrors[model.ggufFilename] || engineDownloadProgress?.error
    : undefined
  const engineStatus = engineDownloadProgress?.status
  const isEngineDownloading = Boolean(engineDownloadProgress) && (!engineStatus || engineStatus === 'downloading')
  const isEnginePaused = engineStatus === 'paused'
  const isEngineErrored = engineStatus === 'error' || Boolean(engineDownloadError && engineDownloadProgress)
  const showEngineProgress =
    Boolean(engineDownloadProgress) &&
    (isEngineDownloading || isEnginePaused || isEngineErrored)

  const pullProgress = pullingModels[model.ollamaTag]
  const pullError = pullErrors[model.ollamaTag]
  const isPullCancelled = pullProgress?.status === 'cancelled'
  const isPullErrored = pullProgress?.status === 'error' || Boolean(pullError)
  const isCurrentPulling =
    Boolean(pullProgress) && pullProgress?.status !== 'cancelled' && pullProgress?.status !== 'error'
  const showOllamaProgress = isCurrentPulling || isPullCancelled || (isPullErrored && Boolean(pullProgress))

  const comp = getCompatibility(systemInfo, model)

  const isEngineActive = useMemo(() => {
    if (!model.ggufFilename || !engineState.loadedModel) return false
    return engineState.loadedModel.split(/[/\\]/).pop() === model.ggufFilename
  }, [model.ggufFilename, engineState.loadedModel])

  const isEngineSelectedInChat = useMemo(() => {
    if (!selectedModel || selectedModel.providerType !== 'golti-engine' || !model.ggufFilename) {
      return false
    }
    const selectedName = selectedModel.name.toLowerCase().replace(/\.gguf$/, '')
    const ggufName = model.ggufFilename.toLowerCase().replace(/\.gguf$/, '')
    return selectedName === ggufName || selectedModel.name === model.ggufFilename
  }, [selectedModel, model.ggufFilename])

  const isOllamaActive = useMemo(() => {
    if (!selectedModel || selectedModel.providerType !== 'ollama') return false
    const tag = installedOllamaTag || model.ollamaTag
    return normalizeOllamaTag(selectedModel.name) === normalizeOllamaTag(tag)
  }, [selectedModel, installedOllamaTag, model.ollamaTag])

  const deleteSources: DeleteSourceOption[] = useMemo(() => {
    const sources: DeleteSourceOption[] = []

    if (isEngineModelDownloaded && model.ggufFilename) {
      const blocked = isEngineActive || isEngineSelectedInChat
      sources.push({
        id: 'engine',
        label: 'Golti Engine (GGUF)',
        detail: model.ggufFilename,
        blocked,
        blockedReason: blocked
          ? isEngineActive
            ? 'Currently loaded in Golti Engine. Switch or unload it in Chat or Settings first.'
            : 'Currently selected for chat. Choose a different model first.'
          : undefined
      })
    }

    if (isInstalled) {
      const tag = installedOllamaTag || model.ollamaTag
      sources.push({
        id: 'ollama',
        label: 'Ollama',
        detail: tag,
        blocked: isOllamaActive,
        blockedReason: isOllamaActive
          ? 'Currently selected for chat. Choose a different model first.'
          : undefined
      })
    }

    return sources
  }, [
    isEngineModelDownloaded,
    model.ggufFilename,
    isEngineActive,
    isEngineSelectedInChat,
    isInstalled,
    installedOllamaTag,
    model.ollamaTag,
    isOllamaActive
  ])

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

  const handleOpenInChat = async (viaEngine = false) => {
    const chatStore = useChatStore.getState()
    const sidebarStore = useSidebarStore.getState()

    if (viaEngine && model.ggufFilename) {
      const matchLocal = localModels.find((lm) => lm.filename === model.ggufFilename)
      if (matchLocal) {
        await loadModel(matchLocal.filepath)
      }
    }

    if (chatStore.models.length === 0) {
      await chatStore.fetchModels()
    }

    let matchingModel
    if (viaEngine) {
      matchingModel = chatStore.models.find((m) => m.providerType === 'golti-engine')
    } else {
      matchingModel = chatStore.models.find(
        (m) =>
          m.providerType === 'ollama' &&
          normalizeOllamaTag(m.name) === normalizeOllamaTag(installedOllamaTag || model.ollamaTag)
      )
    }

    const providerId = matchingModel ? matchingModel.providerId : viaEngine ? 'golti-engine-local' : 'ollama-local'
    const fullModelTag = matchingModel
      ? matchingModel.name
      : viaEngine
        ? model.ggufFilename?.replace(/\.gguf$/, '') || model.name
        : installedOllamaTag || model.ollamaTag

    const targetModelInfo = matchingModel || {
      id: `${providerId}:${fullModelTag}`,
      name: fullModelTag,
      providerId,
      providerType: viaEngine ? 'golti-engine' : 'ollama'
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

  const handleOllamaInstall = () => {
    if (!isOllamaOnline || isCurrentPulling) return
    // Fire-and-forget so Engine downloads on this/other cards stay independently clickable
    void pullModel(model.ollamaTag)
  }

  const handleOllamaStart = () => {
    if (isOllamaStarting) return
    void startOllama()
  }

  const handleEngineInstall = async () => {
    if (isInstallingBinary || isEngineDownloading || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      if (!isEngineInstalled) {
        await installEngine()
      }
      // Do not await the transfer — progress is tracked in engineStore so
      // Ollama pulls (and other Engine downloads) can start concurrently.
      if (model.ggufUrl && model.ggufFilename) {
        void downloadModel(model.ggufUrl, model.ggufFilename)
      }
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleEnginePause = async () => {
    if (!model.ggufFilename || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      await pauseDownload(model.ggufFilename)
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleEngineCancel = async () => {
    if (!model.ggufFilename || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      await cancelDownload(model.ggufFilename)
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleEngineResume = () => {
    if (!model.ggufUrl || !model.ggufFilename || engineActionBusy || isEngineDownloading) return
    // Kick off resume without awaiting the full download (keeps Pause/Cancel usable
    // and allows concurrent Ollama pulls).
    void resumeDownload(model.ggufUrl, model.ggufFilename)
  }

  const handleEngineClear = async () => {
    if (!model.ggufFilename || engineActionBusy) return
    setEngineActionBusy(true)
    try {
      await clearDownload(model.ggufFilename)
    } finally {
      setEngineActionBusy(false)
    }
  }

  const handleOllamaCancel = async () => {
    if (ollamaActionBusy) return
    setOllamaActionBusy(true)
    try {
      await cancelPull(model.ollamaTag)
    } finally {
      setOllamaActionBusy(false)
    }
  }

  const handleOllamaResume = () => {
    if (!isOllamaOnline || ollamaActionBusy || isCurrentPulling) return
    void pullModel(model.ollamaTag)
  }

  const handleOllamaClear = () => {
    clearPullState(model.ollamaTag)
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
    if (!selectedSource) return
    const source = deleteSources.find((s) => s.id === selectedSource)
    if (!source || source.blocked) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      if (selectedSource === 'engine') {
        if (!model.ggufFilename) {
          setDeleteError('Missing GGUF filename')
          setIsDeleting(false)
          return
        }
        const result = await deleteLocalModel(model.ggufFilename)
        if (!result.success) {
          setDeleteError(result.error || 'Failed to delete Engine model')
          setIsDeleting(false)
          return
        }
      } else {
        const tag = installedOllamaTag || model.ollamaTag
        const result = await deleteOllamaModel(tag)
        if (!result.success) {
          setDeleteError(result.error || 'Failed to delete Ollama model')
          setIsDeleting(false)
          return
        }
      }

      setIsDeleting(false)
      setDialogOpen(false)
      setSelectedSource(null)
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete model')
      setIsDeleting(false)
    }
  }

  const showDelete = isInstalled || isEngineModelDownloaded
  const deletingThisOllama =
    deletingOllamaTag !== null &&
    normalizeOllamaTag(deletingOllamaTag) ===
      normalizeOllamaTag(installedOllamaTag || model.ollamaTag)

  return (
    <div className={`model-card animate-scale-in ${isInstalled || isEngineModelDownloaded ? 'installed-border' : ''}`}>
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
          title={`Minimum RAM needed (Model weights + ~4K KV context buffer). Recommended: ${model.ramRecommendedGB} GB for long context.`}
        >
          <Cpu size={14} className="req-icon" />
          <div className="req-text">
            <span className="req-label">RAM Required</span>
            <span className="req-val">{model.ramRequiredGB} GB</span>
          </div>
        </div>
        <div className="req-item" title="Storage disk space required for GGUF model binary file">
          <HardDrive size={14} className="req-icon" />
          <div className="req-text">
            <span className="req-label">Disk Space</span>
            <span className="req-val">{model.diskSizeGB} GB</span>
          </div>
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="card-footer" style={{ flexDirection: 'column', gap: '8px' }}>
        {/* Engine Section */}
        {isEngineModelDownloaded ? (
          <div className="installed-action-container" style={{ width: '100%' }}>
            <span className="installed-label" style={{ color: '#98c379' }}>
              <Zap size={14} className="installed-icon" /> Golti Engine Ready
            </span>
            <button onClick={() => handleOpenInChat(true)} className="action-btn open-chat-btn">
              <MessageSquare size={13} /> Chat (Engine)
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
                    : engineDownloadProgress?.speed || 'Downloading GGUF...'}
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
        ) : model.ggufUrl ? (
          <button
            onClick={handleEngineInstall}
            disabled={isInstallingBinary || isEngineDownloading || engineActionBusy}
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
              cursor: 'pointer'
            }}
          >
            <Zap size={14} />
            <span>
              {isInstallingBinary
                ? 'Installing Golti Engine...'
                : !isEngineInstalled
                ? 'Install with Golti Engine (1-Click)'
                : 'Download for Golti Engine'}
            </span>
          </button>
        ) : null}

        {/* Ollama Section */}
        {isInstalled ? (
          <div className="installed-action-container" style={{ width: '100%' }}>
            <span className="installed-label">
              <CheckCircle2 size={14} className="installed-icon" /> Ollama Installed
            </span>
            <button onClick={() => handleOpenInChat(false)} className="action-btn open-chat-btn">
              <MessageSquare size={13} /> Chat (Ollama)
            </button>
          </div>
        ) : showOllamaProgress ? (
          <div className="pull-progress-container" style={{ width: '100%' }}>
            <div className="pull-status-row">
              <span className="status-text">
                {isCurrentPulling ? (
                  <RefreshCw size={12} className="spin" />
                ) : isPullErrored ? (
                  <AlertTriangle size={12} />
                ) : (
                  <Pause size={12} />
                )}{' '}
                {isPullCancelled
                  ? 'Cancelled'
                  : isPullErrored
                    ? 'Download failed'
                    : pullProgress?.status || 'Downloading...'}
              </span>
              <span className="percent-text">{pullProgress?.percent || 0}%</span>
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${pullProgress?.percent || 0}%`,
                  backgroundColor: isPullErrored ? '#e06c75' : undefined
                }}
              ></div>
            </div>
            <div className="pull-action-row">
              {isCurrentPulling ? (
                <button
                  type="button"
                  className="pull-action-btn pull-action-danger"
                  onClick={handleOllamaCancel}
                  disabled={ollamaActionBusy}
                  title="Cancel pull"
                >
                  <X size={12} /> Cancel
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="pull-action-btn"
                    onClick={handleOllamaResume}
                    disabled={!isOllamaOnline || ollamaActionBusy}
                    title="Resume pull"
                  >
                    <Play size={12} /> Resume
                  </button>
                  <button
                    type="button"
                    className="pull-action-btn pull-action-danger"
                    onClick={handleOllamaClear}
                    disabled={ollamaActionBusy}
                    title="Clear cancelled pull"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ) : !isOllamaOnline ? (
          <div className="ollama-offline-hint">
            <button
              type="button"
              className="action-btn install-btn"
              style={{ width: '100%' }}
              onClick={handleOllamaStart}
              disabled={isOllamaStarting}
            >
              {isOllamaStarting ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
              <span>{isOllamaStarting ? 'Starting Ollama…' : 'Start Ollama server'}</span>
            </button>
            <p className="ollama-offline-hint-text">
              Golti runs Ollama for you — you don&apos;t need to start it from a terminal.
            </p>
          </div>
        ) : (
          <button
            onClick={handleOllamaInstall}
            disabled={isCurrentPulling}
            className="action-btn install-btn"
            style={{ width: '100%' }}
            title="Pull model to Ollama"
          >
            <Download size={14} />
            <span>Install with Ollama</span>
          </button>
        )}

        {showDelete && (
          <button
            type="button"
            className="action-btn delete-model-btn"
            onClick={openDeleteDialog}
            disabled={isDeleting || deletingThisOllama}
            title="Delete downloaded copy"
          >
            <Trash2 size={14} />
            <span>{isDeleting || deletingThisOllama ? 'Deleting…' : 'Delete downloaded'}</span>
          </button>
        )}
      </div>

      {(pullError || engineDownloadError) && (
        <div className="card-error-banner" role="alert">
          <AlertTriangle size={12} /> {pullError || engineDownloadError}
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

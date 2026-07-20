import React from 'react'
import { CookbookModel, SystemInfoFull } from '../../../shared/types'
import { getCompatibility } from '../../../shared/compatibility'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useChatStore } from '../../stores/chatStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useEngineStore } from '../../stores/engineStore'
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
  Zap
} from 'lucide-react'

interface ModelCardProps {
  model: CookbookModel
  systemInfo: SystemInfoFull | null
  isInstalled: boolean
  isOllamaOnline: boolean
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  systemInfo,
  isInstalled,
  isOllamaOnline
}) => {
  const { pullingModel, pullProgress, pullError, pullModel } = useCookbookStore()
  const {
    localModels,
    downloadingModelFilename,
    downloadProgress,
    isInstallingBinary,
    engineState,
    installEngine,
    downloadModel,
    loadModel
  } = useEngineStore()

  const isEngineInstalled = engineState.status !== 'not-installed'
  const isEngineModelDownloaded = model.ggufFilename
    ? localModels.some((lm) => lm.filename === model.ggufFilename)
    : false

  const isCurrentEngineDownloading = model.ggufFilename && downloadingModelFilename === model.ggufFilename

  const comp = getCompatibility(systemInfo, model)

  const isCurrentPulling = pullingModel === model.ollamaTag

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
        (m) => m.providerType === 'ollama' && m.name.split(':')[0] === model.ollamaTag.split(':')[0]
      )
    }

    const providerId = matchingModel ? matchingModel.providerId : viaEngine ? 'golti-engine-local' : 'ollama-local'
    const fullModelTag = matchingModel ? matchingModel.name : viaEngine ? (model.ggufFilename?.replace(/\.gguf$/, '') || model.name) : model.ollamaTag

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
    if (!isOllamaOnline) return
    pullModel(model.ollamaTag)
  }

  const handleEngineInstall = async () => {
    if (!isEngineInstalled) {
      await installEngine()
    }
    if (model.ggufUrl && model.ggufFilename) {
      await downloadModel(model.ggufUrl, model.ggufFilename)
    }
  }

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
        <div className="req-item">
          <Cpu size={14} className="req-icon" />
          <div className="req-text">
            <span className="req-label">RAM Required</span>
            <span className="req-val">{model.ramRequiredGB} GB</span>
          </div>
        </div>
        <div className="req-item">
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
        ) : isCurrentEngineDownloading ? (
          <div className="pull-progress-container" style={{ width: '100%' }}>
            <div className="pull-status-row">
              <span className="status-text">
                <RefreshCw size={12} className="spin" /> {downloadProgress?.speed || 'Downloading GGUF...'}
              </span>
              <span className="percent-text">{downloadProgress?.percent || 0}%</span>
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: `${downloadProgress?.percent || 0}%`, backgroundColor: '#e5c07b' }}
              ></div>
            </div>
          </div>
        ) : model.ggufUrl ? (
          <button
            onClick={handleEngineInstall}
            disabled={isInstallingBinary || downloadingModelFilename !== null}
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
        ) : isCurrentPulling ? (
          <div className="pull-progress-container" style={{ width: '100%' }}>
            <div className="pull-status-row">
              <span className="status-text">
                <RefreshCw size={12} className="spin" /> {pullProgress?.status || 'Downloading...'}
              </span>
              <span className="percent-text">{pullProgress?.percent || 0}%</span>
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: `${pullProgress?.percent || 0}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleOllamaInstall}
            disabled={!isOllamaOnline || pullingModel !== null}
            className={`action-btn install-btn ${!isOllamaOnline ? 'disabled' : ''}`}
            style={{ width: '100%' }}
            title={!isOllamaOnline ? 'Ollama is offline. Start Ollama to install.' : 'Pull model to Ollama'}
          >
            <Download size={14} />
            <span>{isOllamaOnline ? 'Install with Ollama' : 'Ollama Offline'}</span>
          </button>
        )}
      </div>

      {isCurrentPulling && pullError && (
        <div className="card-error-banner">
          <AlertTriangle size={12} /> {pullError}
        </div>
      )}
    </div>
  )
}


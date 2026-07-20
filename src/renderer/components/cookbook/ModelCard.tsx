import React from 'react'
import { CookbookModel, SystemInfoFull } from '../../../shared/types'
import { getCompatibility } from '../../../shared/compatibility'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useChatStore } from '../../stores/chatStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import {
  Cpu,
  HardDrive,
  CheckCircle2,
  Download,
  AlertTriangle,
  XCircle,
  MessageSquare,
  Sparkles,
  RefreshCw
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

  const handleOpenInChat = async () => {
    const chatStore = useChatStore.getState()
    const sidebarStore = useSidebarStore.getState()

    if (chatStore.models.length === 0) {
      await chatStore.fetchModels()
    }

    const matchingModel = chatStore.models.find(
      (m) => m.providerType === 'ollama' && m.name.split(':')[0] === model.ollamaTag.split(':')[0]
    )

    if (matchingModel) {
      chatStore.setSelectedModel(matchingModel)
    }

    const providerId = matchingModel ? matchingModel.providerId : 'ollama'
    const fullModelTag = matchingModel ? matchingModel.name : model.ollamaTag

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

  const handleInstall = () => {
    if (!isOllamaOnline) return
    pullModel(model.ollamaTag)
  }

  return (
    <div className={`model-card animate-scale-in ${isInstalled ? 'installed-border' : ''}`}>
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
      <div className="card-footer">
        {isInstalled ? (
          <div className="installed-action-container">
            <span className="installed-label">
              <CheckCircle2 size={14} className="installed-icon" /> Installed
            </span>
            <button onClick={handleOpenInChat} className="action-btn open-chat-btn">
              <MessageSquare size={13} /> Open Chat
            </button>
          </div>
        ) : isCurrentPulling ? (
          <div className="pull-progress-container">
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
            onClick={handleInstall}
            disabled={!isOllamaOnline || pullingModel !== null}
            className={`action-btn install-btn ${!isOllamaOnline ? 'disabled' : ''}`}
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

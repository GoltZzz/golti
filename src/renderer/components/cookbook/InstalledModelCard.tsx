import React, { useState } from 'react'
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
  CheckCircle2,
  AlertTriangle,
  Layers
} from 'lucide-react'

interface InstalledModelCardProps {
  model: InstalledLocalModelInfo
}

export const InstalledModelCard: React.FC<InstalledModelCardProps> = ({ model }) => {
  const { deleteLocalEngineModel, deletingModel } = useCookbookStore()
  const { loadModel, localModels } = useEngineStore()
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isDeletingThis = deletingModel === model.tag || isDeleting

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

      {errorMsg && (
        <div className="installed-card-error">
          <AlertTriangle size={13} /> {errorMsg}
        </div>
      )}

      <div className="installed-card-actions">
        <button
          className="btn-chat-installed"
          onClick={handleStartChat}
        >
          <MessageSquare size={14} /> Start Chat
        </button>

        <button
          className={`btn-delete-installed ${confirmDelete ? 'confirming' : ''}`}
          onClick={handleDelete}
          disabled={isDeletingThis}
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

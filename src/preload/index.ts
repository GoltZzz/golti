import { contextBridge, ipcRenderer } from 'electron'
import type {
  Artifact,
  Citation,
  ContextItem,
  Conversation,
  ConversationExportOptions,
  ConversationSearchHit,
  Message,
  MessageVersion,
  Memory,
  MemorySearchHit,
  Skill,
  ModelInfo,
  SendMessagePayload,
  Settings,
  StreamChunkPayload,
  TokenBudget,
  AIProviderConfig,
  ArtifactVersion,
  WebSearchTestResult,
  SearchRuntimeState,
  SearchRuntimeProgress,
  InstalledLocalModelInfo,
  CookbookModel,
  VramReading
} from '../shared/types'
import type { HFModelSummary } from '../shared/hf-catalog'

const api = {
  // DB Conversations
  getConversations: (): Promise<Conversation[]> => ipcRenderer.invoke('db:conversations:list'),
  getConversation: (id: string): Promise<Conversation | undefined> =>
    ipcRenderer.invoke('db:conversations:get', id),
  createConversation: (conv: Conversation): Promise<void> =>
    ipcRenderer.invoke('db:conversations:create', conv),
  updateConversation: (id: string, updates: Partial<Conversation>): Promise<void> =>
    ipcRenderer.invoke('db:conversations:update', id, updates),
  deleteConversation: (id: string): Promise<void> => ipcRenderer.invoke('db:conversations:delete', id),
  searchConversations: (query: string): Promise<ConversationSearchHit[]> =>
    ipcRenderer.invoke('db:conversations:search', query),
  exportConversation: (options: ConversationExportOptions) =>
    ipcRenderer.invoke('conversations:export', options),

  // DB Messages
  getMessages: (conversationId: string): Promise<Message[]> =>
    ipcRenderer.invoke('db:messages:list', conversationId),
  createMessage: (msg: Message): Promise<void> => ipcRenderer.invoke('db:messages:create', msg),
  updateMessage: (id: string, updates: Partial<Message>): Promise<void> =>
    ipcRenderer.invoke('db:messages:update', id, updates),
  getMessageVersions: (messageId: string): Promise<MessageVersion[]> =>
    ipcRenderer.invoke('db:messages:versions', messageId),
  setActiveLeaf: (conversationId: string, leafId: string): Promise<Message[]> =>
    ipcRenderer.invoke('db:messages:set-active-leaf', conversationId, leafId),

  // Context
  listContext: (conversationId: string): Promise<ContextItem[]> =>
    ipcRenderer.invoke('context:list', conversationId),
  addContextPaths: (conversationId: string, paths: string[]): Promise<ContextItem[]> =>
    ipcRenderer.invoke('context:add-paths', conversationId, paths),
  pickContext: (conversationId: string): Promise<ContextItem[]> =>
    ipcRenderer.invoke('context:pick', conversationId),
  pickContextFiles: (conversationId: string): Promise<ContextItem[]> =>
    ipcRenderer.invoke('context:pick-files', conversationId),
  pickContextFolder: (conversationId: string): Promise<ContextItem | null> =>
    ipcRenderer.invoke('context:pick-folder', conversationId),
  addContextText: (conversationId: string, name: string, content: string): Promise<ContextItem> =>
    ipcRenderer.invoke('context:add-text', conversationId, name, content),
  addContextUrl: (conversationId: string, url: string): Promise<ContextItem> =>
    ipcRenderer.invoke('context:add-url', conversationId, url),
  updateContext: (id: string, updates: Partial<ContextItem>): Promise<boolean> =>
    ipcRenderer.invoke('context:update', id, updates),
  deleteContext: (id: string): Promise<boolean> => ipcRenderer.invoke('context:delete', id),

  // Artifacts
  listArtifacts: (conversationId: string): Promise<Artifact[]> =>
    ipcRenderer.invoke('artifacts:list', conversationId),
  updateArtifact: (id: string, content: string): Promise<Artifact | undefined> =>
    ipcRenderer.invoke('artifacts:update', id, content),
  listArtifactVersions: (artifactId: string): Promise<ArtifactVersion[]> =>
    ipcRenderer.invoke('artifacts:versions', artifactId),
  restoreArtifactVersion: (artifactId: string, version: number): Promise<Artifact | undefined> =>
    ipcRenderer.invoke('artifacts:restore', artifactId, version),
  saveShellToFile: (opts: { content: string; filePath?: string; defaultFilename?: string }): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> =>
    ipcRenderer.invoke('artifacts:save-to-file', opts),

  // Citations
  listCitations: (conversationId: string): Promise<Citation[]> =>
    ipcRenderer.invoke('citations:list', conversationId),

  // Memories (Brain & Memory)
  listMemories: (): Promise<Memory[]> => ipcRenderer.invoke('memory:list'),
  deleteMemory: (id: string): Promise<boolean> => ipcRenderer.invoke('memory:delete', id),
  searchMemories: (query: string): Promise<MemorySearchHit[]> =>
    ipcRenderer.invoke('memory:search', query),
  onMemorySaved: (callback: (memories: Memory[]) => void) => {
    const listener = (_: unknown, memories: Memory[]) => callback(memories)
    ipcRenderer.on('memory:saved', listener)
    return () => ipcRenderer.removeListener('memory:saved', listener)
  },

  // Skills (slash commands)
  listSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:list'),
  createSkill: (input: { name: string; description?: string; instructions: string }): Promise<Skill> =>
    ipcRenderer.invoke('skills:create', input),
  updateSkill: (
    id: string,
    input: { name?: string; description?: string; instructions?: string }
  ): Promise<Skill | undefined> => ipcRenderer.invoke('skills:update', id, input),
  deleteSkill: (id: string): Promise<boolean> => ipcRenderer.invoke('skills:delete', id),
  onSkillSaved: (callback: (skill: Skill) => void) => {
    const listener = (_: unknown, skill: Skill) => callback(skill)
    ipcRenderer.on('skill:saved', listener)
    return () => ipcRenderer.removeListener('skill:saved', listener)
  },

  // Tokens
  getTokenBudget: (conversationId: string, draft?: string): Promise<TokenBudget> =>
    ipcRenderer.invoke('tokens:budget', conversationId, draft),

  // DB Providers
  getProviders: (): Promise<AIProviderConfig[]> => ipcRenderer.invoke('db:providers:list'),
  saveProvider: (provider: AIProviderConfig): Promise<void> =>
    ipcRenderer.invoke('db:providers:upsert', provider),
  deleteProvider: (id: string): Promise<void> => ipcRenderer.invoke('db:providers:delete', id),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<Settings>): Promise<void> =>
    ipcRenderer.invoke('settings:update', settings),
  testWebSearch: (query?: string): Promise<WebSearchTestResult> =>
    ipcRenderer.invoke('web-search:test', query),
  getSearchRuntimeStatus: (): Promise<SearchRuntimeState> =>
    ipcRenderer.invoke('search-runtime:status'),
  installSearchRuntime: (): Promise<SearchRuntimeState> =>
    ipcRenderer.invoke('search-runtime:install'),
  startSearchRuntime: (): Promise<SearchRuntimeState> => ipcRenderer.invoke('search-runtime:start'),
  stopSearchRuntime: (): Promise<SearchRuntimeState> => ipcRenderer.invoke('search-runtime:stop'),
  repairSearchRuntime: (): Promise<SearchRuntimeState> =>
    ipcRenderer.invoke('search-runtime:repair'),
  onSearchRuntimeProgress: (callback: (progress: SearchRuntimeProgress) => void) => {
    const listener = (_: unknown, progress: SearchRuntimeProgress) => callback(progress)
    ipcRenderer.on('search-runtime:progress', listener)
    return () => ipcRenderer.removeListener('search-runtime:progress', listener)
  },
  onSearchRuntimeStatusChange: (callback: (state: SearchRuntimeState) => void) => {
    const listener = (_: unknown, state: SearchRuntimeState) => callback(state)
    ipcRenderer.on('search-runtime:status-change', listener)
    return () => ipcRenderer.removeListener('search-runtime:status-change', listener)
  },

  // AI & Models
  getModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke('ai:models'),
  sendMessage: (
    payload: SendMessagePayload
  ): Promise<{ userMsgId?: string; assistantMsgId: string; generationId: string }> =>
    ipcRenderer.invoke('ai:chat', payload),
  cancelGeneration: (generationId: string): Promise<boolean> =>
    ipcRenderer.invoke('ai:chat:cancel', generationId),
  resyncGeneration: (
    conversationId: string
  ): Promise<{ generationId: string; messageId: string } | null> =>
    ipcRenderer.invoke('ai:chat:resync', conversationId),
  regenerateMessage: (
    payload: SendMessagePayload & { messageId: string }
  ): Promise<{ assistantMsgId: string; generationId: string }> =>
    ipcRenderer.invoke('ai:chat:regenerate', payload),
  continueMessage: (
    payload: SendMessagePayload & { messageId: string }
  ): Promise<{ assistantMsgId: string; generationId: string }> =>
    ipcRenderer.invoke('ai:chat:continue', payload),
  generateConversationTitle: (request: {
    providerId: string
    model: string
    prompt: string
  }): Promise<string | null> => ipcRenderer.invoke('ai:generate-title', request),
  onStreamChunk: (callback: (chunk: StreamChunkPayload) => void) => {
    const listener = (_: unknown, chunk: StreamChunkPayload) => callback(chunk)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },

  // System
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getSystemInfoFull: () => ipcRenderer.invoke('system:info:full'),
  getVramReading: (): Promise<VramReading | null> => ipcRenderer.invoke('system:vram'),
  getDetailedInstalledModels: (): Promise<InstalledLocalModelInfo[]> =>
    ipcRenderer.invoke('cookbook:detailed-installed-models'),
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window:control', action),
  getPlatform: (): Promise<'darwin' | 'win32' | 'linux'> => ipcRenderer.invoke('system:platform'),

  // Golti Engine
  getEngineStatus: () => ipcRenderer.invoke('engine:status'),
  installEngine: () => ipcRenderer.invoke('engine:install'),
  reinstallEngine: () => ipcRenderer.invoke('engine:reinstall'),
  startEngine: () => ipcRenderer.invoke('engine:start'),
  stopEngine: () => ipcRenderer.invoke('engine:stop'),
  loadEngineModel: (ggufPath: string) => ipcRenderer.invoke('engine:load-model', ggufPath),
  listEngineDevices: () =>
    ipcRenderer.invoke('engine:list-devices') as Promise<
      { id: string; name: string; totalMiB: number; freeMiB: number }[]
    >,
  downloadModel: (url: string, filename: string) =>
    ipcRenderer.invoke('engine:download-model', url, filename),
  pauseModelDownload: (filename: string) =>
    ipcRenderer.invoke('engine:pause-download', filename) as Promise<{ success: boolean }>,
  cancelModelDownload: (filename: string) =>
    ipcRenderer.invoke('engine:cancel-download', filename) as Promise<{ success: boolean }>,
  deletePartialModel: (filename: string) =>
    ipcRenderer.invoke('engine:delete-partial', filename) as Promise<{
      success: boolean
      error?: string
    }>,
  listLocalModels: () => ipcRenderer.invoke('engine:list-models'),
  searchHuggingFaceModels: (query: string, limit?: number) =>
    ipcRenderer.invoke('hf:search', query, limit) as Promise<{
      models: HFModelSummary[]
      stale: boolean
      error?: string
    }>,
  getHuggingFaceModelDetail: (repoId: string) =>
    ipcRenderer.invoke('hf:model-detail', repoId) as Promise<{
      repoId: string
      models: CookbookModel[]
      error?: string
    }>,
  resolveModelGguf: (ollamaTag: string, quantization?: string) =>
    ipcRenderer.invoke('hf:resolve-gguf', ollamaTag, quantization) as Promise<{
      resolution: {
        ggufUrl: string
        ggufFilename: string
        ggufFileSize: number
        repoId: string
      } | null
      error?: string
    }>,
  deleteLocalModel: (filename: string) =>
    ipcRenderer.invoke('engine:delete-model', filename) as Promise<{ success: boolean; error?: string }>,
  onEngineProgress: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('engine:download-progress', listener)
    return () => ipcRenderer.removeListener('engine:download-progress', listener)
  },
  onEngineStatusChange: (callback: (state: any) => void) => {
    const listener = (_: any, state: any) => callback(state)
    ipcRenderer.on('engine:status-change', listener)
    return () => ipcRenderer.removeListener('engine:status-change', listener)
  },
  onProvidersUpdated: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('providers:updated', listener)
    return () => ipcRenderer.removeListener('providers:updated', listener)
  }
}

contextBridge.exposeInMainWorld('goltiAPI', api)

export type GoltiAPI = typeof api

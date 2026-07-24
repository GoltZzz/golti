export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'google' | 'golti-engine'

/** Composer Chat vs Agent mode (Cursor-style Shift+Tab toggle). */
export type ComposerMode = 'chat' | 'agent'

export type EngineStatus = 'not-installed' | 'downloading' | 'stopped' | 'starting' | 'running' | 'error'

export interface EngineState {
  status: EngineStatus
  binaryVersion?: string
  binaryPath?: string
  port?: number
  pid?: number
  loadedModel?: string
  error?: string
  isSystemProcess?: boolean
  host?: string
  vramUsage?: string
  /** Backend of the running engine binary: 'metal' | 'vulkan' | 'cpu'. */
  backend?: string
  /** GPU layers the engine was started with (-1 = all, 0 = CPU-only). */
  gpuLayers?: number
  /** Set when the engine fell back to fewer layers / CPU after a GPU failure. */
  fellBackToCpu?: boolean
}

export interface OllamaState {
  status: 'not-installed' | 'stopped' | 'starting' | 'running' | 'error'
  error?: string
  binaryPath?: string | null
  port?: number
  pid?: number | null
  isSystemProcess?: boolean
  /** systemd unit owning the process, when Ollama is installed as a Linux service. */
  serviceUnit?: string
  /** True when stopping the owning unit requires root. */
  needsPrivilegedStop?: boolean
  host?: string
  version?: string
  logs?: string[]
}

export type EngineDownloadStatus =
  | 'downloading'
  | 'paused'
  | 'error'
  | 'cancelled'
  | 'complete'

export interface EngineDownloadProgress {
  type: 'binary' | 'model'
  name: string
  completed: number
  total: number
  percent: number
  speed?: string
  status?: EngineDownloadStatus
  error?: string
}

export type ModelDownloadResult =
  | { status: 'complete'; path: string }
  | { status: 'paused' }
  | { status: 'cancelled' }

export interface AIProviderConfig {
  id: string
  type: ProviderType
  name: string
  endpoint?: string
  apiKey?: string
  isActive: boolean
  models: string[]
  error?: string
}

export interface ModelInfo {
  id: string
  name: string
  providerId: string
  providerType: ProviderType
  size?: string
  description?: string
  contextWindow?: number
}

export interface GenerationSettings {
  temperature?: number
  topP?: number
  maxTokens?: number
  stopSequences?: string[]
}

export interface Conversation {
  id: string
  title: string
  model: string
  providerId: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  archived: boolean
  systemPrompt?: string
  generationSettings?: GenerationSettings
  activeLeafId?: string | null
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface Citation {
  id: string
  messageId: string
  url: string
  title: string
  snippet: string
  retrievedAt: number
  rank?: number
}

export interface MessagePart {
  type: 'text' | 'context_ref' | 'citation_ref' | 'shell_ref' | 'artifact_ref'
  text?: string
  contextItemId?: string
  citationId?: string
  shellId?: string
  artifactId?: string
}

export interface ResearchStep {
  stepIndex: number
  totalSteps: number
  query: string
  status: 'pending' | 'searching' | 'reading' | 'done' | 'error'
  sourcesFound: number
  error?: string
}

export interface ResearchPlan {
  originalQuery: string
  subQueries: string[]
  reasoning: string
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  model?: string
  tokensIn?: number
  tokensOut?: number
  createdAt: number
  updatedAt?: number
  isStreaming?: boolean
  error?: string
  parentId?: string | null
  variantGroupId?: string | null
  variantIndex?: number
  parts?: MessagePart[]
  citations?: Citation[]
  shellIds?: string[]
  artifactIds?: string[]
  generationId?: string
  isDeepResearch?: boolean
  reasoningContent?: string
  thinkingDurationMs?: number
}

export interface MessageVersion {
  id: string
  messageId: string
  content: string
  editedAt: number
  editSource: 'user' | 'system' | 'restore'
}

export type ContextItemType = 'file' | 'folder' | 'text' | 'url' | 'system'

export interface ContextItem {
  id: string
  conversationId: string
  type: ContextItemType
  name: string
  content: string
  sourcePath?: string
  mimeType?: string
  tokenEstimate: number
  createdAt: number
  enabled: boolean
  error?: string
}

export type ShellType = 'code' | 'markdown'
export type ArtifactType = ShellType

export interface Shell {
  id: string
  conversationId: string
  messageId: string
  type: ShellType
  title: string
  language?: string
  content: string
  version: number
  createdAt: number
  updatedAt: number
}
export type Artifact = Shell

export interface ShellVersion {
  id: string
  shellId: string
  artifactId?: string
  content: string
  version: number
  createdAt: number
}
export type ArtifactVersion = ShellVersion

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimated?: boolean
}

export interface TokenBudget {
  contextWindow: number
  usedTokens: number
  reservedOutputTokens: number
  availableTokens: number
  overflow: boolean
  items: Array<{ id: string; label: string; tokens: number; category: 'system' | 'context' | 'history' | 'draft' | 'reserve' }>
}

export type WebSearchMode = 'off' | 'auto' | 'on'

export type WebSearchStatusState = 'searching' | 'success' | 'no-results' | 'skipped' | 'error'

export interface WebSearchStatus {
  state: WebSearchStatusState
  message?: string
  resultCount?: number
  mode?: WebSearchMode
}

export interface SendMessagePayload {
  conversationId: string
  content: string
  model: string
  providerId: string
  systemPrompt?: string
  parentId?: string | null
  regenerateFromId?: string
  editMessageId?: string
  /** @deprecated Prefer webSearchEnabled / forceWebSearch */
  webSearch?: boolean
  /** @deprecated Prefer webSearchEnabled / forceWebSearch */
  webSearchMode?: WebSearchMode
  /** Composer toggle: when true, Auto intent decides whether to search. */
  webSearchEnabled?: boolean
  /** Force search for this message even if Auto would skip. */
  forceWebSearch?: boolean
  /** Deep Research mode toggle */
  deepResearchEnabled?: boolean
  /** Composer Chat vs Agent mode */
  composerMode?: ComposerMode
  contextItemIds?: string[]
  generationSettings?: GenerationSettings
}

export type StreamEventType =
  | 'text'
  | 'thinking'
  | 'usage'
  | 'citation'
  | 'shell'
  | 'artifact'
  | 'error'
  | 'done'
  | 'search'
  | 'research-plan'
  | 'research-step'
  | 'research-sources'
  | 'correction'

export interface StreamChunkPayload {
  conversationId: string
  messageId: string
  generationId?: string
  contentDelta?: string
  correctedContent?: string
  reasoningContent?: string
  thinkingDelta?: string
  thinkingDurationMs?: number
  done: boolean
  error?: string
  usage?: TokenUsage
  citation?: Citation
  shell?: Shell
  artifact?: Artifact
  searchStatus?: WebSearchStatus
  researchPlan?: ResearchPlan
  researchStep?: ResearchStep
  eventType?: StreamEventType
}

export interface ChatRequestOptions {
  signal?: AbortSignal
  generationSettings?: GenerationSettings
}

export type ProviderStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'error'; error: string }
  | { type: 'done'; finishReason?: string }

export interface SystemInfo {
  platform: string
  arch: string
  cpuModel: string
  totalRamGB: number
  freeRamGB: number
  gpuName?: string
  gpuVramGB?: number
}

export interface SystemInfoFull {
  platform: string
  arch: string
  cpu: {
    model: string
    cores: number
    threads: number
    speedGHz: number
  }
  ram: {
    totalGB: number
    freeGB: number
    usedPercent: number
  }
  gpu: {
    name: string
    vramGB: number | null
    isAppleSilicon: boolean
    unifiedMemoryGB?: number
  }
  disk: {
    readMBps: number | null
    writeMBps: number | null
  }
  thermals: {
    cpuTempC: number | null
  }
}

export type ModelCompatibility = 'great' | 'runs' | 'tight' | 'wont_fit'

export type ModelUseCase = 'chat' | 'code' | 'vision' | 'embedding' | 'reasoning' | 'creative' | 'agentic'

export type ModelFamily = 'llama' | 'mistral' | 'gemma' | 'phi' | 'qwen' | 'deepseek' | 'codellama' | 'nomic' | 'starcoder' | 'yi' | 'glm' | 'falcon' | 'smollm' | 'internlm' | 'command-r' | 'devstral' | 'kimi' | 'other'

export type ModelSizeTier = 'tiny' | 'small' | 'medium' | 'large' | 'xl' | 'xxl' | 'datacenter'

export type QuantizationType = 'Q4_0' | 'Q4_K_M' | 'Q5_K_M' | 'Q6_K' | 'Q8_0' | 'FP16'

export interface CookbookModel {
  id: string
  name: string
  family: ModelFamily
  parameterBillions: number
  sizeTier: ModelSizeTier
  quantization: QuantizationType
  useCases: ModelUseCase[]
  ramRequiredGB: number
  ramRecommendedGB: number
  diskSizeGB: number
  ollamaTag: string
  ggufUrl?: string
  ggufFilename?: string
  ggufFileSize?: number
  description: string
  highlights: string[]
}

export interface PullProgress {
  modelTag: string
  status: string
  completed: number
  total: number
  percent: number
}

export interface InstalledLocalModelInfo {
  id: string
  name: string
  tag: string
  providerType: ProviderType
  providerId: string
  providerName: string
  sizeBytes?: number
  sizeFormatted?: string
  parameterSize?: string
  quantizationLevel?: string
  family?: string
  modifiedAt?: string
  modifiedAtFormatted?: string
  isGoltiEngine?: boolean
  isOllama?: boolean
  isCatalogModel?: boolean
  catalogModelId?: string
}

export type PlatformType = 'darwin' | 'win32' | 'linux' | 'unknown'

export type WebSearchProvider = 'local' | 'brave' | 'tavily' | 'none'

export interface WebSearchSettings {
  provider: WebSearchProvider
  /** @deprecated Legacy cloud providers only */
  apiKey?: string
  maxResults: number
  enabled: boolean
  endpoint?: string
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchTestResult {
  ok: boolean
  results: WebSearchResult[]
  error?: string
  engine?: string
}

export type SearchRuntimeStatus =
  | 'not-installed'
  | 'downloading'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error'

export interface SearchRuntimeState {
  status: SearchRuntimeStatus
  version?: string
  apiPort?: number
  searxPort?: number
  apiHealthy: boolean
  searxHealthy: boolean
  engine?: string
  error?: string
  lastLog?: string
}

export interface SearchRuntimeProgress {
  name: string
  completed: number
  total: number
  percent: number
  speed?: string
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  fontSize: 'small' | 'medium' | 'large'
  defaultModel?: string
  defaultProviderId?: string
  sidebarCollapsed: boolean
  ollamaAutoDetect: boolean
  systemPrompt: string
  osPlatformOverride?: 'auto' | 'darwin' | 'win32' | 'linux'
  engineEnabled: boolean
  engineModelDir?: string
  enginePort: number
  engineGpuLayers: number
  webSearch?: WebSearchSettings
  /** When true, composer Web Search toggle is on (Auto intent). */
  webSearchEnabled?: boolean
  /** When true, composer Deep Research toggle is on. */
  deepResearchEnabled?: boolean
  /** Composer Chat vs Agent mode preference. */
  composerMode?: ComposerMode
  /** @deprecated Migrated to webSearchEnabled */
  defaultWebSearchMode?: WebSearchMode
  searchRuntimePort?: number
  searchRuntimeSearxPort?: number
  defaultGenerationSettings?: GenerationSettings
  defaultContextWindow?: number
  reservedOutputTokens?: number
  showThinkingProcess?: boolean
}

export interface ConversationExportOptions {
  conversationId: string
  format: 'markdown' | 'json'
}

export interface ConversationSearchHit {
  conversationId: string
  title: string
  snippet: string
  updatedAt: number
  pinned: boolean
}

export interface BranchSibling {
  id: string
  variantIndex: number
  createdAt: number
  preview: string
}

export interface UndoableAction {
  id: string
  type: string
  label: string
  timestamp: number
}

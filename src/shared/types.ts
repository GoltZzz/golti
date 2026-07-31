import type { EngineFailure } from './engine-startup'

export type { EngineFailure }

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'golti-engine'

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
  /** Human-readable name of the GPU the engine is offloading to, when any. */
  gpuDevice?: string
  /** GPU layers the engine was started with (-1 = all, 0 = CPU-only). */
  gpuLayers?: number
  /** Set when the engine fell back to fewer layers / CPU after a GPU failure. */
  fellBackToCpu?: boolean
  /** Context window the running engine was started with (`--ctx-size`). */
  contextSize?: number
  /** Last stderr output lines for error diagnostic log copying. */
  lastLogs?: string
  /** Plain-language classification of the last startup failure. */
  failure?: EngineFailure
  /** True when the engine loaded a multimodal projector and can accept images. */
  visionEnabled?: boolean
  projectorPath?: string
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

export interface Memory {
  id: string
  category: string
  title: string
  summary: string
  details: string[]
  sourceConversationId?: string
  sourceMessageId?: string
  embeddingModel?: string
  createdAt: number
  updatedAt: number
}

export function memorySearchText(m: Pick<Memory, 'title' | 'summary' | 'details'>): string {
  return [m.title, m.summary, ...m.details].filter(Boolean).join('\n')
}

export interface MemorySearchHit extends Memory {
  score: number
}

export interface Skill {
  id: string
  name: string
  description: string
  instructions: string
  createdBy: 'user' | 'model'
  createdAt: number
  updatedAt: number
}

/** Skills shipped with the app: hidden from skill management, not user-editable. */
export const BUILTIN_SKILL_NAMES = ['grill-me']

export function isBuiltinSkill(skill: { name: string }): boolean {
  return BUILTIN_SKILL_NAMES.includes(skill.name)
}

/** Normalize a skill name into a slug usable as a /slash-command. */
export function normalizeSkillName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const SKILL_NAME_STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'that', 'this', 'me', 'my', 'i', 'you',
  'and', 'or', 'with', 'skill', 'create', 'make', 'about', 'like', 'when', 'asking',
  'ask', 'please', 'can', 'help'
])

const SKILL_REQUEST_PREFIX =
  /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:(?:i(?:'d| would)?\s+(?:want|like)\s+(?:you\s+)?to\s+)?)(?:create|make|build|save|add|write|generate|set\s+up)\s+(?:me\s+)?(?:a|an|the)?\s*(?:new\s+|reusable\s+|custom\s+)*skill\b/i

/**
 * Turn a free-text "/skill make me a skill that ..." request into a one-line
 * description of what the skill does, dropping the imperative framing.
 */
export function deriveSkillDescription(raw: string): string {
  let text = raw.trim().replace(/\s+/g, ' ')
  text = text.replace(SKILL_REQUEST_PREFIX, '')
  text = text.replace(/^\s*(?:named|called)\s+["'`]?[a-z0-9][\w-]*["'`]?/i, '')
  text = text.replace(/^\s*(?:that\s+(?:will\s+|can\s+|should\s+)?|which\s+|to\s+|for\s+|so\s+that\s+|:|-|—)\s*/i, '')
  text = text.replace(/^please\s+/i, '').trim()
  if (!text) return ''
  const sentence = text.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '').trim()
  if (!sentence) return ''
  return (sentence.charAt(0).toUpperCase() + sentence.slice(1)).slice(0, 120)
}

/** Pull the name out of a request that states one ("a skill called weekly-recap"). */
export function extractExplicitSkillName(raw: string): string {
  const m = /\b(?:named|called)\s+["'`/]?([a-z0-9][a-z0-9 _-]{0,39})["'`]?/i.exec(raw)
  return m ? normalizeSkillName(m[1].split(/\s+(?:that|which|to|for|so)\b/i)[0]) : ''
}

/** Derive a short hyphenated skill name from a free-text description. */
export function deriveSkillName(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SKILL_NAME_STOPWORDS.has(w))
  const picked = (words.length ? words : description.split(/\s+/)).slice(0, 4).join('-')
  return normalizeSkillName(picked) || `skill-${Date.now().toString(36).slice(-4)}`
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

export type AttachmentKind = 'image' | 'document'

export interface ModelCapabilities {
  image: boolean
  pdf: boolean
  imageTokens?: number
  reason?: string
}

export interface LoadedAttachment {
  id: string
  kind: AttachmentKind
  mimeType: string
  name: string
  base64: string
}

export interface MessageAttachment {
  id: string
  conversationId: string
  messageId: string | null
  kind: AttachmentKind
  mimeType: string
  name: string
  storagePath: string
  thumbPath?: string
  byteSize: number
  width?: number
  height?: number
  extractedText?: string
  tokenEstimate: number
  createdAt: number
  error?: string
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  displayContent?: string
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
  ttftMs?: number
  tokensPerSec?: number
  finishReason?: string
  attachments?: MessageAttachment[]
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
  trimmedMessages: number
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
  /** What to show in the user bubble when `content` was expanded from a /skill. */
  displayContent?: string
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
  attachmentIds?: string[]
  generationSettings?: GenerationSettings
  continueMessageId?: string
  /** Set when the user ran /skill: capture this reply as a new skill's instructions. */
  skillRequest?: { description: string }
  /** Set when the message came from a skill that asks clarifying questions (e.g. /grill-me). */
  askUserEnabled?: boolean
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
  ttftMs?: number
  tokensPerSec?: number
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
  finishReason?: string
}

export interface ChatRequestOptions {
  signal?: AbortSignal
  generationSettings?: GenerationSettings
  /**
   * Lower bound for the local engine's output budget. Only set it for short
   * utility completions; chat replies want the default floor.
   */
  outputTokenFloor?: number
  /**
   * JSON Schema the reply must conform to. Honoured by the local engine via
   * llama.cpp grammar constraints; providers that cannot enforce it ignore it.
   */
  responseSchema?: Record<string, unknown>
  /** Attachment bytes for this generation, keyed by message id. */
  attachments?: Map<string, LoadedAttachment[]>
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

/**
 * Driver-level VRAM reading for one GPU. Counts every consumer on the card, not
 * just the processes Golti started, which is what makes it usable as a live
 * capacity signal rather than an estimate.
 */
export interface VramReading {
  /** Vendor device index, matching the ids used for device selection. */
  index: string
  name: string
  totalMiB: number
  usedMiB: number
  freeMiB: number
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
    freeGB: number | null
    totalGB: number | null
  }
  thermals: {
    cpuTempC: number | null
  }
}

export type ModelCompatibility = 'great' | 'runs' | 'tight' | 'wont_fit'

export type MemoryPressure = 'ok' | 'busy' | 'critical'

export type DiskFit = 'ok' | 'tight' | 'insufficient' | 'unknown'

export type ModelUseCase = 'chat' | 'code' | 'vision' | 'embedding' | 'reasoning' | 'creative' | 'agentic'

export type ModelFamily = 'llama' | 'mistral' | 'gemma' | 'phi' | 'qwen' | 'deepseek' | 'codellama' | 'nomic' | 'starcoder' | 'yi' | 'glm' | 'falcon' | 'smollm' | 'internlm' | 'command-r' | 'devstral' | 'kimi' | 'hermes' | 'other'

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
  systemPrompt: string
  osPlatformOverride?: 'auto' | 'darwin' | 'win32' | 'linux'
  engineEnabled: boolean
  memoryEnabled: boolean
  engineModelDir?: string
  enginePort: number
  /** GPU layers to offload. Negative = Auto (size from VRAM), 0 = CPU-only, N = exact. */
  engineGpuLayers: number
  /** GPU offload target: 'auto' (pick discrete GPU), 'cpu' (no offload), or a device id like 'Vulkan1'. */
  engineDevice?: string
  /** GGUF filename of the model used for memory extraction. Empty/undefined = reuse the loaded chat model. */
  memoryModel?: string
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

export interface MessageSearchHit {
  messageId: string
  conversationId: string
  conversationTitle: string
  role: MessageRole
  contentSnippet: string
  createdAt: number
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

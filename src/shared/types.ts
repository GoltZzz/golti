export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'google'

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
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  tokensIn?: number
  tokensOut?: number
  createdAt: number
  isStreaming?: boolean
  error?: string
}

export interface SendMessagePayload {
  conversationId: string
  content: string
  model: string
  providerId: string
  systemPrompt?: string
}

export interface StreamChunkPayload {
  conversationId: string
  messageId: string
  contentDelta: string
  done: boolean
  error?: string
}

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

export type ModelUseCase = 'chat' | 'code' | 'vision' | 'embedding' | 'reasoning' | 'creative'

export type ModelFamily = 'llama' | 'mistral' | 'gemma' | 'phi' | 'qwen' | 'deepseek' | 'codellama' | 'nomic' | 'starcoder' | 'yi' | 'other'

export type ModelSizeTier = 'tiny' | 'small' | 'medium' | 'large' | 'xl'

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

export type PlatformType = 'darwin' | 'win32' | 'linux' | 'unknown'

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
}


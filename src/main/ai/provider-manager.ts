import type {
  ChatRequestOptions,
  Message,
  ModelInfo,
  ProviderStreamEvent
} from '../../shared/types'
import { dbProviders } from '../db/database'
import { fetchOllamaModels, streamOllamaChat } from './providers/ollama'
import { fetchOpenAIModels, streamOpenAIChat } from './providers/openai'
import { fetchAnthropicModels, streamAnthropicChat } from './providers/anthropic'
import { fetchGoogleModels, streamGoogleChat } from './providers/google'
import { fetchGoltiEngineModels, streamGoltiEngineChat } from './providers/golti-engine'
import { isBinaryInstalled, listLocalModels } from '../engine'

export async function getAllModels(): Promise<ModelInfo[]> {
  let providers = dbProviders.list()

  const engineProvider = providers.find((p) => p.type === 'golti-engine')
  if (engineProvider && !engineProvider.isActive) {
    if (isBinaryInstalled() || listLocalModels().length > 0) {
      dbProviders.upsert({ ...engineProvider, isActive: true })
      providers = dbProviders.list()
    }
  }

  const activeProviders = providers.filter((p) => p.isActive)
  const allModels: ModelInfo[] = []

  for (const provider of activeProviders) {
    try {
      let modelsList: string[] = []
      if (provider.type === 'ollama') {
        modelsList = await fetchOllamaModels(provider.endpoint)
      } else if (provider.type === 'openai') {
        modelsList = await fetchOpenAIModels(provider)
      } else if (provider.type === 'anthropic') {
        modelsList = await fetchAnthropicModels(provider)
      } else if (provider.type === 'google') {
        modelsList = await fetchGoogleModels(provider)
      } else if (provider.type === 'golti-engine') {
        modelsList = await fetchGoltiEngineModels(provider.endpoint)
      }

      dbProviders.upsert({ ...provider, models: modelsList, error: undefined })

      for (const m of modelsList) {
        allModels.push({
          id: `${provider.id}:${m}`,
          name: m,
          providerId: provider.id,
          providerType: provider.type,
          contextWindow: guessContextWindow(m)
        })
      }
    } catch (e: any) {
      console.warn(`Error fetching models for ${provider.name}: ${e.message || String(e)}`)
      dbProviders.upsert({ ...provider, error: e.message || String(e) })
    }
  }

  return allModels
}

function guessContextWindow(modelName: string): number {
  const n = modelName.toLowerCase()
  if (n.includes('128k') || n.includes('gpt-4o') || n.includes('claude-3-5') || n.includes('gemini')) {
    return 128000
  }
  if (n.includes('32k')) return 32768
  if (n.includes('16k')) return 16384
  if (n.includes('8k')) return 8192
  if (n.includes('1b') || n.includes('3b')) return 8192
  return 8192
}

export async function* streamChatResponse(
  providerId: string,
  model: string,
  messages: Message[],
  systemPrompt?: string,
  options?: ChatRequestOptions
): AsyncGenerator<ProviderStreamEvent, void, unknown> {
  const providers = dbProviders.list()
  const provider = providers.find((p) => p.id === providerId)

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  if (provider.type === 'ollama') {
    yield* streamOllamaChat(provider, model, messages, systemPrompt, options)
  } else if (provider.type === 'openai') {
    yield* streamOpenAIChat(provider, model, messages, systemPrompt, options)
  } else if (provider.type === 'anthropic') {
    yield* streamAnthropicChat(provider, model, messages, systemPrompt, options)
  } else if (provider.type === 'google') {
    yield* streamGoogleChat(provider, model, messages, systemPrompt, options)
  } else if (provider.type === 'golti-engine') {
    yield* streamGoltiEngineChat(provider, model, messages, systemPrompt, options)
  } else {
    throw new Error(`Unsupported provider type: ${provider.type}`)
  }
}

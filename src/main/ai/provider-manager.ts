import { AIProviderConfig, Message, ModelInfo } from '../../shared/types'
import { dbProviders } from '../db/database'
import { fetchOllamaModels, streamOllamaChat } from './providers/ollama'
import { fetchOpenAIModels, streamOpenAIChat } from './providers/openai'
import { fetchAnthropicModels, streamAnthropicChat } from './providers/anthropic'
import { fetchGoogleModels, streamGoogleChat } from './providers/google'
import { fetchGoltiEngineModels, streamGoltiEngineChat } from './providers/golti-engine'

import { isBinaryInstalled, listLocalModels } from '../engine'

export async function getAllModels(): Promise<ModelInfo[]> {
  let providers = dbProviders.list()

  // Ensure golti-engine is active if local models exist or binary is installed
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
          providerType: provider.type
        })
      }
    } catch (e: any) {
      console.warn(`Error fetching models for ${provider.name}: ${e.message || String(e)}`)
      dbProviders.upsert({ ...provider, error: e.message || String(e) })
    }
  }

  return allModels
}

export async function* streamChatResponse(
  providerId: string,
  model: string,
  messages: Message[],
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const providers = dbProviders.list()
  const provider = providers.find(p => p.id === providerId)

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  if (provider.type === 'ollama') {
    yield* streamOllamaChat(provider, model, messages, systemPrompt)
  } else if (provider.type === 'openai') {
    yield* streamOpenAIChat(provider, model, messages, systemPrompt)
  } else if (provider.type === 'anthropic') {
    yield* streamAnthropicChat(provider, model, messages, systemPrompt)
  } else if (provider.type === 'google') {
    yield* streamGoogleChat(provider, model, messages, systemPrompt)
  } else if (provider.type === 'golti-engine') {
    yield* streamGoltiEngineChat(provider, model, messages, systemPrompt)
  } else {
    throw new Error(`Unsupported provider type: ${provider.type}`)
  }
}


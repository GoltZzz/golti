import { AIProviderConfig, Message, ModelInfo } from '../../shared/types'
import { dbProviders } from '../db/database'
import { fetchOllamaModels, streamOllamaChat } from './providers/ollama'
import { fetchOpenAIModels, streamOpenAIChat } from './providers/openai'
import { fetchAnthropicModels, streamAnthropicChat } from './providers/anthropic'
import { fetchGoogleModels, streamGoogleChat } from './providers/google'

export async function getAllModels(): Promise<ModelInfo[]> {
  const providers = dbProviders.list().filter(p => p.isActive)
  const allModels: ModelInfo[] = []

  for (const provider of providers) {
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
      console.warn(`Error fetching models for ${provider.name}:`, e)
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
  } else {
    throw new Error(`Unsupported provider type: ${provider.type}`)
  }
}

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { AIProviderConfig, Conversation, Message, Settings } from '../../shared/types'
import { backupJsonStore, getSqlite } from './sqlite'
import {
  chatArtifacts,
  chatShells,
  chatCitations,
  chatContext,
  chatConversations,
  chatMessages
} from './chat-repos'

interface DBData {
  settings: Settings
  providers: AIProviderConfig[]
  conversations: Conversation[]
  messages: Message[]
  _chatMigratedToSqlite?: boolean
}

let dbData: DBData | null = null
let dbPath: string = ''

function getDbPath(): string {
  if (!dbPath) {
    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'golti_data')
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    dbPath = path.join(dbDir, 'golti_store.json')
  }
  return dbPath
}

const LEGACY_DEFAULT_SYSTEM_PROMPT = 'You are Golti, an intelligent, helpful AI personal assistant.'

const defaultSettings: Settings = {
  theme: 'dark',
  accentColor: '#e06c75',
  fontSize: 'medium',
  sidebarCollapsed: false,
  systemPrompt:
    'You are Golti, an intelligent, helpful AI personal assistant. Note: Golti is your name; do not confuse general terms or technologies (such as the Go/Golang programming language) with the app.',
  engineEnabled: true,
  enginePort: 8391,
  engineGpuLayers: -1,
  engineDevice: 'auto',
  webSearch: {
    provider: 'local',
    maxResults: 5,
    enabled: true,
    endpoint: 'http://127.0.0.1:8741'
  },
  webSearchEnabled: false,
  composerMode: 'chat',
  defaultWebSearchMode: 'off',
  searchRuntimePort: 8741,
  searchRuntimeSearxPort: 8742,
  defaultContextWindow: 8192,
  reservedOutputTokens: 1024,
  showThinkingProcess: true,
  defaultGenerationSettings: {
    temperature: 0.7,
    topP: 0.9
  }
}

const defaultProviders: AIProviderConfig[] = [
  {
    id: 'golti-engine-local',
    type: 'golti-engine',
    name: 'Golti Engine (Local)',
    endpoint: 'http://127.0.0.1:8391',
    apiKey: '',
    isActive: true,
    models: []
  }
]

function loadDb(): DBData {
  if (dbData) return dbData

  const p = getDbPath()
  if (fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf-8')
      dbData = JSON.parse(content)
      if (dbData) {
        if (!dbData.providers) {
          dbData.providers = []
        }
        if (!dbData.conversations) dbData.conversations = []
        if (!dbData.messages) dbData.messages = []
        dbData.settings = { ...defaultSettings, ...dbData.settings }
        let updated = false
        const withoutOllama = dbData.providers.filter(
          (prov) => (prov.type as string) !== 'ollama'
        )
        if (withoutOllama.length !== dbData.providers.length) {
          dbData.providers = withoutOllama
          updated = true
        }
        if (dbData.settings.systemPrompt === LEGACY_DEFAULT_SYSTEM_PROMPT) {
          dbData.settings.systemPrompt = defaultSettings.systemPrompt
          updated = true
        }
        for (const defProv of defaultProviders) {
          if (!dbData.providers.some((prov) => prov.id === defProv.id)) {
            dbData.providers.push({ ...defProv })
            updated = true
          }
        }
        if (updated) {
          saveDb()
        }
        return dbData
      }
    } catch (e) {
      console.warn('Failed to parse database JSON, initializing new DB:', e)
    }
  }

  dbData = {
    settings: defaultSettings,
    providers: defaultProviders,
    conversations: [],
    messages: [],
    _chatMigratedToSqlite: false
  }

  saveDb()
  return dbData
}

function saveDb(): void {
  if (!dbData) return
  const p = getDbPath()
  const tempPath = `${p}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(dbData, null, 2), 'utf-8')
  fs.renameSync(tempPath, p)
}

/**
 * One-time import of conversations/messages from JSON into SQLite.
 */
export function migrateChatToSqlite(): void {
  const data = loadDb()
  getSqlite() // ensure schema

  if (data._chatMigratedToSqlite) return

  backupJsonStore(getDbPath())

  const existing = chatConversations.list(true)
  if (existing.length === 0 && (data.conversations?.length || 0) > 0) {
    const run = getSqlite().transaction(() => {
      for (const conv of data.conversations || []) {
        if (!chatConversations.get(conv.id)) {
          chatConversations.create({
            ...conv,
            activeLeafId: null
          })
        }
      }
      for (const msg of data.messages || []) {
        if (!chatMessages.get(msg.id)) {
          chatMessages.create({
            ...msg,
            parentId: msg.parentId ?? null,
            variantIndex: msg.variantIndex ?? 0
          })
        }
      }
      // Set active leaf to latest message per conversation
      for (const conv of data.conversations || []) {
        const msgs = chatMessages.listForConversation(conv.id)
        if (msgs.length > 0) {
          const leaf = msgs[msgs.length - 1]
          chatConversations.update(conv.id, { activeLeafId: leaf.id })
        }
      }
    })
    run()
  }

  data._chatMigratedToSqlite = true
  // Keep conversations/messages arrays empty in JSON going forward (settings/providers only)
  data.conversations = []
  data.messages = []
  saveDb()
}

export function initDatabase(): void {
  migrateChatToSqlite()
}

// Conversation DB Helper Methods - SQLite-backed
export const dbConversations = {
  list: (): Conversation[] => chatConversations.list(false),
  listAll: (): Conversation[] => chatConversations.list(true),
  get: (id: string): Conversation | undefined => chatConversations.get(id),
  create: (conv: Conversation): void => chatConversations.create(conv),
  update: (id: string, updates: Partial<Conversation>): void => chatConversations.update(id, updates),
  delete: (id: string): void => chatConversations.delete(id),
  search: (query: string) => chatConversations.search(query)
}

// Message DB Helper Methods - SQLite-backed
export const dbMessages = {
  listForConversation: (conversationId: string): Message[] =>
    chatMessages.listForConversation(conversationId),
  get: (id: string) => chatMessages.get(id),
  create: (msg: Message): void => chatMessages.create(msg),
  update: (id: string, updates: Partial<Message>): void => chatMessages.update(id, updates),
  updateContent: (id: string, content: string): void => chatMessages.updateContent(id, content),
  delete: (id: string): void => chatMessages.delete(id),
  createVersion: chatMessages.createVersion,
  listVersions: chatMessages.listVersions
}

export const dbContext = chatContext
export const dbArtifacts = chatArtifacts
export const dbShells = chatShells
export const dbCitations = chatCitations

// Provider DB Helper Methods - JSON
export const dbProviders = {
  list: (): AIProviderConfig[] => {
    const db = loadDb()
    return db.providers
  },

  upsert: (provider: AIProviderConfig): void => {
    const db = loadDb()
    const index = db.providers.findIndex((p) => p.id === provider.id)
    if (index !== -1) {
      db.providers[index] = provider
    } else {
      db.providers.push(provider)
    }
    saveDb()
  },

  delete: (id: string): void => {
    const db = loadDb()
    db.providers = db.providers.filter((p) => p.id !== id)
    saveDb()
  }
}

// Settings DB Helper Methods - JSON
export const dbSettings = {
  get: (): Settings => {
    const db = loadDb()
    return { ...defaultSettings, ...db.settings }
  },

  update: (newSettings: Partial<Settings>): void => {
    const db = loadDb()
    db.settings = { ...db.settings, ...newSettings }
    saveDb()
  }
}

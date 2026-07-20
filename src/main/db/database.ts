import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { Conversation, Message, AIProviderConfig, Settings } from '../../shared/types'

interface DBData {
  settings: Settings
  providers: AIProviderConfig[]
  conversations: Conversation[]
  messages: Message[]
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

const defaultSettings: Settings = {
  theme: 'dark',
  accentColor: '#e06c75',
  fontSize: 'medium',
  sidebarCollapsed: false,
  ollamaAutoDetect: true,
  systemPrompt: 'You are Golti, an intelligent, helpful AI personal assistant.',
  engineEnabled: true,
  enginePort: 8391,
  engineGpuLayers: -1
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
  },
  {
    id: 'ollama-local',
    type: 'ollama',
    name: 'Ollama (Local)',
    endpoint: 'http://localhost:11434',
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
        let updated = false
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
    messages: []
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

// Conversation DB Helper Methods
export const dbConversations = {
  list: (): Conversation[] => {
    const db = loadDb()
    return db.conversations
      .filter(c => !c.archived)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt)
  },

  get: (id: string): Conversation | undefined => {
    const db = loadDb()
    return db.conversations.find(c => c.id === id)
  },

  create: (conv: Conversation): void => {
    const db = loadDb()
    db.conversations.unshift(conv)
    saveDb()
  },

  update: (id: string, updates: Partial<Conversation>): void => {
    const db = loadDb()
    const index = db.conversations.findIndex(c => c.id === id)
    if (index !== -1) {
      db.conversations[index] = { ...db.conversations[index], ...updates, updatedAt: Date.now() }
      saveDb()
    }
  },

  delete: (id: string): void => {
    const db = loadDb()
    db.conversations = db.conversations.filter(c => c.id !== id)
    db.messages = db.messages.filter(m => m.conversationId !== id)
    saveDb()
  }
}

// Message DB Helper Methods
export const dbMessages = {
  listForConversation: (conversationId: string): Message[] => {
    const db = loadDb()
    return db.messages
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt)
  },

  create: (msg: Message): void => {
    const db = loadDb()
    db.messages.push(msg)
    const conv = db.conversations.find(c => c.id === msg.conversationId)
    if (conv) {
      conv.updatedAt = Date.now()
    }
    saveDb()
  },

  updateContent: (id: string, content: string): void => {
    const db = loadDb()
    const msg = db.messages.find(m => m.id === id)
    if (msg) {
      msg.content = content
      saveDb()
    }
  }
}

// Provider DB Helper Methods
export const dbProviders = {
  list: (): AIProviderConfig[] => {
    const db = loadDb()
    return db.providers
  },

  upsert: (provider: AIProviderConfig): void => {
    const db = loadDb()
    const index = db.providers.findIndex(p => p.id === provider.id)
    if (index !== -1) {
      db.providers[index] = provider
    } else {
      db.providers.push(provider)
    }
    saveDb()
  },

  delete: (id: string): void => {
    const db = loadDb()
    db.providers = db.providers.filter(p => p.id !== id)
    saveDb()
  }
}

// Settings DB Helper Methods
export const dbSettings = {
  get: (): Settings => {
    const db = loadDb()
    return db.settings
  },

  update: (newSettings: Partial<Settings>): void => {
    const db = loadDb()
    db.settings = { ...db.settings, ...newSettings }
    saveDb()
  }
}

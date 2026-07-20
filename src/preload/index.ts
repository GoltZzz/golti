import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // DB Conversations
  getConversations: () => ipcRenderer.invoke('db:conversations:list'),
  getConversation: (id: string) => ipcRenderer.invoke('db:conversations:get', id),
  createConversation: (conv: any) => ipcRenderer.invoke('db:conversations:create', conv),
  updateConversation: (id: string, updates: any) => ipcRenderer.invoke('db:conversations:update', id, updates),
  deleteConversation: (id: string) => ipcRenderer.invoke('db:conversations:delete', id),

  // DB Messages
  getMessages: (conversationId: string) => ipcRenderer.invoke('db:messages:list', conversationId),
  createMessage: (msg: any) => ipcRenderer.invoke('db:messages:create', msg),

  // DB Providers
  getProviders: () => ipcRenderer.invoke('db:providers:list'),
  saveProvider: (provider: any) => ipcRenderer.invoke('db:providers:upsert', provider),
  deleteProvider: (id: string) => ipcRenderer.invoke('db:providers:delete', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: any) => ipcRenderer.invoke('settings:update', settings),

  // AI & Models
  getModels: () => ipcRenderer.invoke('ai:models'),
  sendMessage: (payload: any) => ipcRenderer.invoke('ai:chat', payload),
  onStreamChunk: (callback: (chunk: any) => void) => {
    const listener = (_: any, chunk: any) => callback(chunk)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },

  // System
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getSystemInfoFull: () => ipcRenderer.invoke('system:info:full'),
  getOllamaStatus: () => ipcRenderer.invoke('cookbook:ollama-status'),
  getInstalledModels: () => ipcRenderer.invoke('cookbook:installed-models'),
  pullOllamaModel: (modelTag: string) => ipcRenderer.invoke('cookbook:ollama-pull', modelTag),
  onPullProgress: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('cookbook:pull-progress', listener)
    return () => ipcRenderer.removeListener('cookbook:pull-progress', listener)
  },
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window:control', action),
  getPlatform: (): Promise<'darwin' | 'win32' | 'linux'> => ipcRenderer.invoke('system:platform')
}

contextBridge.exposeInMainWorld('goltiAPI', api)

export type GoltiAPI = typeof api

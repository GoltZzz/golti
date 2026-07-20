import fs from 'fs'
import path from 'path'
import { dialog, BrowserWindow } from 'electron'
import type { ContextItem, ContextItemType } from '../../shared/types'
import { estimateTokens } from '../../shared/chat-utils'
import { dbContext } from '../db/database'

const MAX_FILE_BYTES = 512 * 1024 // 512 KB per file
const MAX_FOLDER_FILES = 40
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.swift',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.graphql',
  '.vue',
  '.svelte',
  '.env',
  '.gitignore',
  '.dockerfile',
  '.csv',
  '.log'
])

function newId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isProbablyText(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return true
  const base = path.basename(filePath).toLowerCase()
  return base === 'dockerfile' || base === 'makefile' || base === 'readme'
}

function readTextFile(filePath: string): { content: string; error?: string } {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      return { content: '', error: 'Not a file' }
    }
    if (stat.size > MAX_FILE_BYTES) {
      return { content: '', error: `File exceeds ${MAX_FILE_BYTES / 1024}KB limit` }
    }
    if (!isProbablyText(filePath)) {
      return { content: '', error: 'Unsupported file type (text files only)' }
    }
    const buf = fs.readFileSync(filePath)
    // Reject binary-ish content
    if (buf.includes(0)) {
      return { content: '', error: 'Binary files are not supported' }
    }
    return { content: buf.toString('utf-8') }
  } catch (err: any) {
    return { content: '', error: err.message || 'Failed to read file' }
  }
}

function collectFolderFiles(dir: string, acc: string[] = []): string[] {
  if (acc.length >= MAX_FOLDER_FILES) return acc
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (acc.length >= MAX_FOLDER_FILES) break
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'out', '.git', 'vendor', '__pycache__'].includes(entry.name)) {
        continue
      }
      collectFolderFiles(full, acc)
    } else if (entry.isFile() && isProbablyText(full)) {
      acc.push(full)
    }
  }
  return acc
}

export function addContextFromPath(conversationId: string, filePath: string): ContextItem {
  const stat = fs.statSync(filePath)
  if (stat.isDirectory()) {
    const files = collectFolderFiles(filePath)
    const chunks: string[] = []
    const errors: string[] = []
    for (const f of files) {
      const { content, error } = readTextFile(f)
      if (error) {
        errors.push(`${path.basename(f)}: ${error}`)
        continue
      }
      const rel = path.relative(filePath, f)
      chunks.push(`--- ${rel} ---\n${content}`)
    }
    const content = chunks.join('\n\n')
    const item: ContextItem = {
      id: newId(),
      conversationId,
      type: 'folder',
      name: path.basename(filePath),
      content,
      sourcePath: filePath,
      tokenEstimate: estimateTokens(content),
      createdAt: Date.now(),
      enabled: true,
      error: errors.length ? errors.slice(0, 3).join('; ') : undefined
    }
    dbContext.create(item)
    return item
  }

  const { content, error } = readTextFile(filePath)
  const item: ContextItem = {
    id: newId(),
    conversationId,
    type: 'file',
    name: path.basename(filePath),
    content,
    sourcePath: filePath,
    mimeType: 'text/plain',
    tokenEstimate: estimateTokens(content),
    createdAt: Date.now(),
    enabled: !error,
    error
  }
  dbContext.create(item)
  return item
}

export function addContextText(
  conversationId: string,
  name: string,
  content: string,
  type: ContextItemType = 'text'
): ContextItem {
  const item: ContextItem = {
    id: newId(),
    conversationId,
    type,
    name,
    content,
    tokenEstimate: estimateTokens(content),
    createdAt: Date.now(),
    enabled: true
  }
  dbContext.create(item)
  return item
}

export async function addContextUrl(conversationId: string, url: string): Promise<ContextItem> {
  let content = ''
  let error: string | undefined
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Golti/1.0' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) {
      error = `HTTP ${res.status}`
    } else {
      const text = await res.text()
      // Strip scripts/styles roughly for HTML
      content = text
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_FILE_BYTES)
    }
  } catch (err: any) {
    error = err.message || 'Failed to fetch URL'
  }

  const item: ContextItem = {
    id: newId(),
    conversationId,
    type: 'url',
    name: url,
    content,
    sourcePath: url,
    tokenEstimate: estimateTokens(content),
    createdAt: Date.now(),
    enabled: !error && Boolean(content),
    error
  }
  dbContext.create(item)
  return item
}

export async function pickContextFiles(
  win: BrowserWindow | null,
  conversationId: string
): Promise<ContextItem[]> {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Text', extensions: Array.from(TEXT_EXTENSIONS).map((e) => e.slice(1)) }]
  })
  if (result.canceled) return []
  return result.filePaths.map((p) => addContextFromPath(conversationId, p))
}

export async function pickContextFolder(
  win: BrowserWindow | null,
  conversationId: string
): Promise<ContextItem | null> {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  return addContextFromPath(conversationId, result.filePaths[0])
}

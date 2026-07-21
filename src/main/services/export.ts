import { dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import type { ConversationExportOptions } from '../../shared/types'
import { formatConversationMarkdown, getBranchPath } from '../../shared/chat-utils'
import { dbArtifacts, dbCitations, dbConversations, dbMessages } from '../db/database'

export async function exportConversation(
  win: BrowserWindow | null,
  options: ConversationExportOptions
): Promise<{ success: boolean; path?: string; error?: string }> {
  const conv = dbConversations.get(options.conversationId)
  if (!conv) return { success: false, error: 'Conversation not found' }

  const messages = dbMessages.listForConversation(options.conversationId)
  const pathMessages = getBranchPath(messages, conv.activeLeafId)
  const citations = dbCitations.listForConversation(options.conversationId)
  const artifacts = dbArtifacts.listForConversation(options.conversationId)

  let content: string
  let defaultName: string
  let filters: Electron.FileFilter[]

  if (options.format === 'json') {
    content = JSON.stringify(
      {
        conversation: conv,
        messages: pathMessages,
        citations,
        shells: artifacts,
        artifacts
      },
      null,
      2
    )
    defaultName = `${sanitize(conv.title)}.json`
    filters = [{ name: 'JSON', extensions: ['json'] }]
  } else {
    content = formatConversationMarkdown(conv.title, pathMessages, citations, artifacts)
    defaultName = `${sanitize(conv.title)}.md`
    filters = [{ name: 'Markdown', extensions: ['md'] }]
  }

  const result = await dialog.showSaveDialog(win!, {
    defaultPath: defaultName,
    filters
  })

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'cancelled' }
  }

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true, path: result.filePath }
  } catch (err: any) {
    return { success: false, error: err.message || 'Write failed' }
  }
}

function sanitize(title: string): string {
  return (title || 'conversation').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'conversation'
}

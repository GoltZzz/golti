import type { BrowserWindow } from 'electron'
import type {
  Artifact,
  Shell,
  Citation,
  Message,
  SendMessagePayload,
  StreamChunkPayload,
  TokenUsage,
  WebSearchMode,
  WebSearchStatus
} from '../../shared/types'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_RESERVED_OUTPUT,
  computeTokenBudget,
  estimateTokens,
  extractArtifacts,
  extractShells,
  extractThinkingTags,
  createThinkStreamParser,
  getBranchPath
} from '../../shared/chat-utils'
import { decideWebSearch, resolveComposerSearchMode } from '../../shared/web-search-intent'
import { CONTINUE_INSTRUCTION, normalizeFinishReason } from '../../shared/finish-reason'
import { resolveContextWindow } from './context-window'
import {
  dbArtifacts,
  dbCitations,
  dbContext,
  dbConversations,
  dbMessages,
  dbSettings
} from '../db/database'
import { streamChatResponse } from './provider-manager'
import { ensureLocalSearchReady, runWebSearch } from '../services/web-search'
import { startDeepResearch } from './deep-research'

interface ActiveGeneration {
  generationId: string
  conversationId: string
  messageId: string
  controller: AbortController
  /** Everything streamed so far, so a re-selecting renderer can be re-synced. */
  content: string
  reasoningContent: string
}

const activeGenerations = new Map<string, ActiveGeneration>()

/** Appended when composerMode is 'agent' (tools not wired yet — prompt-only). */
const COMPOSER_AGENT_SYSTEM_SUFFIX = [
  'You are operating in Agent mode.',
  'Treat the user message as a task to accomplish: clarify the goal if needed, break work into clear steps, and work toward a concrete outcome.',
  'Be proactive and structured. Prefer actionable plans and specific recommendations over vague advice.',
  'Ask before suggesting destructive or irreversible actions.',
  'Note: filesystem, shell, and other tool execution are not available yet in this build — do not claim you ran tools or modified files. Reason through the task and provide the best guidance, plans, and code you can without tool access.'
].join(' ')

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sendChunk(win: BrowserWindow | null, chunk: StreamChunkPayload): void {
  // Guard against the window/webContents being torn down mid-stream (e.g. on quit).
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('ai:stream-chunk', chunk)
  }
}

function buildContextBlock(conversationId: string, contextItemIds?: string[]): string {
  const items = dbContext.list(conversationId).filter((c) => {
    if (!c.enabled) return false
    if (contextItemIds && contextItemIds.length > 0) {
      return contextItemIds.includes(c.id)
    }
    return true
  })
  if (items.length === 0) return ''
  const parts = items.map((item) => {
    return `<context name="${item.name}" type="${item.type}">\n${item.content}\n</context>`
  })
  return `Use the following attached context when relevant:\n\n${parts.join('\n\n')}`
}

/** Update the live buffer for an in-flight generation. Used by the streaming
 *  loops (chat + deep research) so background progress survives a re-select. */
export function updateGenerationBuffer(
  generationId: string,
  patch: { content?: string; reasoningContent?: string }
): void {
  const gen = activeGenerations.get(generationId)
  if (!gen) return
  if (patch.content !== undefined) gen.content = patch.content
  if (patch.reasoningContent !== undefined) gen.reasoningContent = patch.reasoningContent
}

/**
 * Re-emit the accumulated content for any generation still streaming in a
 * conversation. Called when the renderer re-selects a conversation whose stream
 * kept running while it was showing a different one — without this, the partial
 * text streamed while away is lost and the message renders blank until the
 * remaining deltas arrive. Emitting on the same stream channel keeps ordering
 * intact: this corrected snapshot lands after every prior delta and before every
 * future one. Returns the active generation ids so the renderer can restore its
 * generating state, or null when nothing is live for the conversation.
 */
export function resyncGeneration(
  win: BrowserWindow | null,
  conversationId: string
): { generationId: string; messageId: string } | null {
  let active: { generationId: string; messageId: string } | null = null
  for (const gen of activeGenerations.values()) {
    if (gen.conversationId !== conversationId) continue
    sendChunk(win, {
      conversationId,
      messageId: gen.messageId,
      generationId: gen.generationId,
      correctedContent: gen.content,
      reasoningContent: gen.reasoningContent || undefined,
      done: false,
      eventType: 'correction'
    })
    active = { generationId: gen.generationId, messageId: gen.messageId }
  }
  return active
}

export function cancelGeneration(generationId: string): boolean {
  const gen = activeGenerations.get(generationId)
  if (!gen) return false
  gen.controller.abort()
  activeGenerations.delete(generationId)
  return true
}

export function cancelConversationGenerations(conversationId: string): void {
  for (const [id, gen] of activeGenerations) {
    if (gen.conversationId === conversationId) {
      gen.controller.abort()
      activeGenerations.delete(id)
    }
  }
}

/** True when at least one chat/deep-research generation is still streaming. */
export function hasActiveGenerations(): boolean {
  return activeGenerations.size > 0
}

/** Abort every in-flight generation (used when the app is quitting). */
export function cancelAllGenerations(): void {
  for (const [id, gen] of activeGenerations) {
    gen.controller.abort()
    activeGenerations.delete(id)
  }
}

export async function startChatGeneration(
  win: BrowserWindow | null,
  payload: SendMessagePayload
): Promise<{ userMsgId?: string; assistantMsgId: string; generationId: string }> {
  const {
    conversationId,
    content,
    model,
    providerId,
    systemPrompt,
    parentId,
    regenerateFromId,
    editMessageId,
    webSearch,
    webSearchMode,
    webSearchEnabled,
    forceWebSearch,
    deepResearchEnabled,
    composerMode,
    contextItemIds,
    generationSettings,
    continueMessageId
  } = payload

  const settings = dbSettings.get()
  const conv = dbConversations.get(conversationId)
  const allMessages = dbMessages.listForConversation(conversationId)

  const continuing = continueMessageId ? dbMessages.get(continueMessageId) : undefined
  if (continueMessageId && (!continuing || continuing.role !== 'assistant')) {
    throw new Error('Cannot continue: assistant message not found')
  }

  let userMsgId: string | undefined
  let parentForAssistant: string | null = null
  let variantGroupId: string | null = null
  let variantIndex = 0

  if (continuing) {
    // Resuming in place — no new user or assistant row.
  } else if (regenerateFromId) {
    // Regenerate: create a new assistant variant under the same parent as the original assistant
    const original = dbMessages.get(regenerateFromId)
    if (!original || original.role !== 'assistant') {
      throw new Error('Cannot regenerate: assistant message not found')
    }
    parentForAssistant = original.parentId ?? null
    variantGroupId = original.variantGroupId || original.id
    const siblings = allMessages.filter(
      (m) => m.role === 'assistant' && (m.variantGroupId === variantGroupId || m.id === variantGroupId || m.parentId === parentForAssistant)
    )
    variantIndex = siblings.length
    // Ensure original has variant group
    if (!original.variantGroupId) {
      dbMessages.update(original.id, { variantGroupId, variantIndex: 0 })
    }
  } else if (editMessageId) {
    // Edit user message: version old content, update message, branch new assistant from it
    const existing = dbMessages.get(editMessageId)
    if (!existing || existing.role !== 'user') {
      throw new Error('Cannot edit: user message not found')
    }
    dbMessages.createVersion({
      id: newId('mv'),
      messageId: existing.id,
      content: existing.content,
      editedAt: Date.now(),
      editSource: 'user'
    })
    dbMessages.update(existing.id, { content })
    userMsgId = existing.id
    parentForAssistant = existing.id
  } else {
    // Normal send
    const leaf = parentId ?? conv?.activeLeafId ?? null
    userMsgId = newId('msg_u')
    const userMsg: Message = {
      id: userMsgId,
      conversationId,
      role: 'user',
      content,
      model,
      createdAt: Date.now(),
      parentId: leaf
    }
    dbMessages.create(userMsg)
    parentForAssistant = userMsgId
  }

  const generationId = newId('gen')
  const assistantMsgId = continuing ? continuing.id : newId('msg_a')

  if (continuing) {
    dbMessages.update(assistantMsgId, { generationId, finishReason: undefined, error: undefined })
  } else {
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversationId,
      role: 'assistant',
      content: '',
      model,
      createdAt: Date.now() + 1,
      parentId: parentForAssistant,
      variantGroupId,
      variantIndex,
      generationId,
      isStreaming: true
    }
    dbMessages.create(assistantMsg)
    dbConversations.update(conversationId, { activeLeafId: assistantMsgId })
  }

  // Build history along branch. When continuing, the truncated assistant turn stays
  // in the history and a synthetic user turn asks the model to pick up where it stopped.
  const refreshed = dbMessages.listForConversation(conversationId)
  const branchPath = getBranchPath(refreshed, assistantMsgId)
  const branch = continuing
    ? [
        ...branchPath,
        {
          id: 'continue_instruction',
          conversationId,
          role: 'user' as const,
          content: CONTINUE_INSTRUCTION,
          createdAt: Date.now()
        }
      ]
    : branchPath.filter((m) => m.id !== assistantMsgId)

  const contextBlock = buildContextBlock(conversationId, contextItemIds)
  const effectiveSystem = [
    systemPrompt || conv?.systemPrompt || settings.systemPrompt,
    composerMode === 'agent' ? COMPOSER_AGENT_SYSTEM_SUFFIX : '',
    contextBlock
  ]
    .filter(Boolean)
    .join('\n\n')

  // Optional web search with explicit lifecycle status (local managed runtime)
  let searchPreamble = ''
  const mode: WebSearchMode = resolveComposerSearchMode({
    webSearchEnabled,
    forceWebSearch,
    webSearchMode,
    legacyBoolean: webSearch
  })
  const searchQuery =
    content || branch.filter((m) => m.role === 'user').slice(-1)[0]?.content || ''
  const decision = decideWebSearch(mode, searchQuery)

  const emitSearchStatus = (status: WebSearchStatus) => {
    sendChunk(win, {
      conversationId,
      messageId: assistantMsgId,
      generationId,
      done: false,
      searchStatus: status,
      eventType: 'search'
    })
  }

  if (mode === 'off' || continuing) {
    // Quiet when search is off; a continuation reuses the sources already attached.
  } else if (decision.skipped) {
    emitSearchStatus({
      state: 'skipped',
      message: decision.statusMessage,
      mode,
      resultCount: 0
    })
  } else {
    const ws = {
      provider: 'local' as const,
      enabled: true,
      maxResults: settings.webSearch?.maxResults || 5,
      endpoint: settings.webSearch?.endpoint
    }

    emitSearchStatus({
      state: 'searching',
      message: 'Searching the web…',
      mode
    })

    try {
      await ensureLocalSearchReady((progress) => {
        emitSearchStatus({
          state: 'searching',
          message:
            progress.percent < 100
              ? `Setting up Web Search… ${progress.percent}%`
              : 'Searching the web…',
          mode
        })
      })

      const results = await runWebSearch(searchQuery, ws)
      if (results.length > 0) {
        searchPreamble =
          'Web search results (cite these sources):\n' +
          results
            .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
            .join('\n\n')

        results.forEach((r, i) => {
          const citation: Citation = {
            id: newId('cite'),
            messageId: assistantMsgId,
            url: r.url,
            title: r.title,
            snippet: r.snippet,
            retrievedAt: Date.now(),
            rank: i + 1
          }
          dbCitations.create(citation)
          sendChunk(win, {
            conversationId,
            messageId: assistantMsgId,
            generationId,
            done: false,
            citation,
            eventType: 'citation'
          })
        })

        emitSearchStatus({
          state: 'success',
          message: `${results.length} source${results.length === 1 ? '' : 's'} found`,
          mode,
          resultCount: results.length
        })
      } else {
        emitSearchStatus({
          state: 'no-results',
          message: 'No sources found',
          mode,
          resultCount: 0
        })
      }
    } catch (err: any) {
      console.warn('[web-search]', err.message || err)
      emitSearchStatus({
        state: 'error',
        message: err?.message || 'Search is temporarily unavailable',
        mode,
        resultCount: 0
      })
    }
  }

  const historyForModel: Message[] = searchPreamble
    ? [
        ...branch,
        {
          id: 'search_ctx',
          conversationId,
          role: 'system',
          content: searchPreamble,
          createdAt: Date.now()
        }
      ]
    : branch

  const controller = new AbortController()
  const activeGen: ActiveGeneration = {
    generationId,
    conversationId,
    messageId: assistantMsgId,
    controller,
    content: '',
    reasoningContent: ''
  }
  activeGenerations.set(generationId, activeGen)

  const mergedSettings = {
    ...settings.defaultGenerationSettings,
    ...conv?.generationSettings,
    ...generationSettings
  }

  if (deepResearchEnabled) {
    startDeepResearch(win, payload, assistantMsgId, generationId, branch, effectiveSystem, mergedSettings, controller, {
      onBuffer: (content) => {
        activeGen.content = content
      }
    })
    return { userMsgId, assistantMsgId, generationId }
  }

  ;(async () => {
    const priorContent = continuing?.content ?? ''
    let generated = ''
    let reasoningAccumulated = ''
    let thinkingStartTime: number | null = null
    let thinkingEndTime: number | null = null
    let usage: TokenUsage | undefined
    let finishReason: string | undefined

    const streamParser = createThinkStreamParser()

    const generationStartedAt = Date.now()
    const promptTokens =
      estimateTokens(historyForModel.map((m) => m.content).join('\n')) +
      estimateTokens(effectiveSystem || '')
    let firstTokenLogged = false
    const markFirstToken = () => {
      if (firstTokenLogged) return
      firstTokenLogged = true
      const ms = Date.now() - generationStartedAt
      console.log(`[perf] ttft=${ms}ms prompt=~${promptTokens}tok model=${providerId}:${model}`)
    }

    try {
      for await (const event of streamChatResponse(providerId, model, historyForModel, effectiveSystem, {
        signal: controller.signal,
        generationSettings: mergedSettings
      })) {
        if (event.type === 'thinking' || event.type === 'text') markFirstToken()

        if (event.type === 'thinking') {
          if (!thinkingStartTime) thinkingStartTime = Date.now()
          thinkingEndTime = Date.now()
          reasoningAccumulated += event.text
          activeGen.reasoningContent = reasoningAccumulated
          const duration = thinkingEndTime - thinkingStartTime
          sendChunk(win, {
            conversationId,
            messageId: assistantMsgId,
            generationId,
            thinkingDelta: event.text,
            thinkingDurationMs: duration,
            done: false,
            eventType: 'thinking'
          })
        } else if (event.type === 'text') {
          const { thinkingDelta, contentDelta } = streamParser(event.text)

          if (thinkingDelta) {
            if (!thinkingStartTime) thinkingStartTime = Date.now()
            thinkingEndTime = Date.now()
            reasoningAccumulated += thinkingDelta
            activeGen.reasoningContent = reasoningAccumulated
            const duration = thinkingEndTime - thinkingStartTime
            sendChunk(win, {
              conversationId,
              messageId: assistantMsgId,
              generationId,
              thinkingDelta,
              thinkingDurationMs: duration,
              done: false,
              eventType: 'thinking'
            })
          }

          if (contentDelta) {
            if (thinkingStartTime && !thinkingEndTime) {
              thinkingEndTime = Date.now()
            }
            accumulated += contentDelta
            activeGen.content = accumulated
            sendChunk(win, {
              conversationId,
              messageId: assistantMsgId,
              generationId,
              contentDelta,
              done: false,
              eventType: 'text'
            })
          }
        } else if (event.type === 'usage') {
          usage = event.usage
        } else if (event.type === 'done') {
          // Providers may emit a real reason and then a generic [DONE]; keep the first.
          if (event.finishReason && !finishReason) {
            finishReason = normalizeFinishReason(event.finishReason)
          }
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      // Check if <think> tags exist in generated text (fallback parsing)
      if (generated.includes('<think>')) {
        const { reasoningText, cleanContent } = extractThinkingTags(generated)
        if (reasoningText) {
          reasoningAccumulated = reasoningAccumulated
            ? `${reasoningAccumulated}\n${reasoningText}`
            : reasoningText
          accumulated = cleanContent
          activeGen.content = accumulated
          activeGen.reasoningContent = reasoningAccumulated
          sendChunk(win, {
            conversationId,
            messageId: assistantMsgId,
            generationId,
            correctedContent: priorContent + generated,
            reasoningContent: reasoningAccumulated,
            done: false,
            eventType: 'correction'
          })
        }
      }

      const accumulated = priorContent + generated

      const totalThinkingDurationMs =
        thinkingStartTime && thinkingEndTime ? thinkingEndTime - thinkingStartTime : undefined

      if (!usage) {
        const promptText = historyForModel.map((m) => m.content).join('\n') + (effectiveSystem || '')
        usage = {
          promptTokens: estimateTokens(promptText),
          completionTokens: estimateTokens(accumulated + reasoningAccumulated),
          totalTokens: estimateTokens(promptText) + estimateTokens(accumulated + reasoningAccumulated),
          estimated: true
        }
      }

      // Extract shells from the newly generated text only, so continuing a
      // truncated message does not duplicate the shells from the first pass.
      const extracted = extractShells(generated)
      const createdShells: Shell[] = []
      for (const [idx, ex] of extracted.entries()) {
        const shell: Shell = {
          id: newId('art'),
          conversationId,
          messageId: assistantMsgId,
          type: ex.type,
          title: ex.title,
          language: ex.language,
          content: ex.content,
          version: 1,
          createdAt: Date.now() + idx,
          updatedAt: Date.now() + idx
        }
        dbArtifacts.create(shell)
        createdShells.push(shell)
        sendChunk(win, {
          conversationId,
          messageId: assistantMsgId,
          generationId,
          done: false,
          shell,
          artifact: shell,
          eventType: 'shell'
        })
      }

      const shellIds = [...(continuing?.shellIds ?? []), ...createdShells.map((s) => s.id)]

      dbMessages.update(assistantMsgId, {
        content: accumulated,
        reasoningContent: reasoningAccumulated || undefined,
        thinkingDurationMs: totalThinkingDurationMs,
        shellIds,
        artifactIds: shellIds,
        tokensIn: usage.promptTokens,
        tokensOut: usage.completionTokens,
        finishReason,
        error: undefined
      })

      sendChunk(win, {
        conversationId,
        messageId: assistantMsgId,
        generationId,
        contentDelta: '',
        thinkingDurationMs: totalThinkingDurationMs,
        done: true,
        usage,
        finishReason,
        eventType: 'done'
      })
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        const totalThinkingDurationMs =
          thinkingStartTime ? (thinkingEndTime || Date.now()) - thinkingStartTime : undefined
        const stoppedContent = priorContent + generated
        dbMessages.update(assistantMsgId, {
          content: stoppedContent || '(generation stopped)',
          reasoningContent: reasoningAccumulated || undefined,
          thinkingDurationMs: totalThinkingDurationMs,
          tokensOut: estimateTokens(generated + reasoningAccumulated)
        })
        sendChunk(win, {
          conversationId,
          messageId: assistantMsgId,
          generationId,
          contentDelta: '',
          thinkingDurationMs: totalThinkingDurationMs,
          done: true,
          eventType: 'done'
        })
      } else {
        console.error('[AI Chat Error]', err)
        const errorText =
          priorContent + generated + `\n\n*[Error: ${err.message || 'Streaming failed'}]*`
        dbMessages.update(assistantMsgId, { content: errorText, error: err.message })
        sendChunk(win, {
          conversationId,
          messageId: assistantMsgId,
          generationId,
          contentDelta: '',
          done: true,
          error: err.message,
          eventType: 'error'
        })
      }
    } finally {
      activeGenerations.delete(generationId)
    }
  })()

  return { userMsgId, assistantMsgId, generationId }
}

export async function getTokenBudgetForConversation(conversationId: string, draft = '') {
  const settings = dbSettings.get()
  const conv = dbConversations.get(conversationId)
  const messages = dbMessages.listForConversation(conversationId)
  const leaf = conv?.activeLeafId
  const history = getBranchPath(messages, leaf)
  const contextItems = dbContext.list(conversationId)

  const resolved = conv
    ? await resolveContextWindow(conv.providerId, conv.model)
    : undefined

  return computeTokenBudget({
    contextWindow: resolved ?? settings.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    reservedOutputTokens: settings.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT,
    systemPrompt: conv?.systemPrompt || settings.systemPrompt,
    contextItems,
    history,
    draft
  })
}

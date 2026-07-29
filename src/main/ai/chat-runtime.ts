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
  getBranchPath,
  trimHistoryToBudget,
  extractSkillBlocks
} from '../../shared/chat-utils'
import { normalizeSkillName, deriveSkillName } from '../../shared/types'
import { decideWebSearch, resolveComposerSearchMode } from '../../shared/web-search-intent'
import {
  buildContextBlock,
  buildSystemPrompt,
  orderPromptMessages,
  selectContextItems
} from '../../shared/prompt-assembly'
import { CONTINUE_INSTRUCTION, normalizeFinishReason } from '../../shared/finish-reason'
import { resolveContextWindow } from './context-window'
import {
  dbArtifacts,
  dbCitations,
  dbContext,
  dbConversations,
  dbMessages,
  dbSettings,
  dbSkills
} from '../db/database'
import { streamChatResponse } from './provider-manager'
import { ensureLocalSearchReady, runWebSearch } from '../services/web-search'
import { startDeepResearch } from './deep-research'
import { presentableErrorMessage } from '../../shared/error-display'
import { extractAndStoreMemories } from './memory-extractor'
import { buildMemoryRecallBlock } from './memory-recall'

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
const ASK_USER_SYSTEM_SUFFIX = [
  'Clarifying questions: when the user request is ambiguous or missing a detail you need to give a good answer, ask the user instead of guessing.',
  'To ask, emit a fenced block exactly like this (JSON body, nothing else inside):',
  '```ask-user',
  '{ "question": "Short, specific question?", "options": [{ "label": "Option A", "description": "What picking this means" }, { "label": "Option B", "description": "What picking this means" }], "allowFreeText": true }',
  '```',
  'Rules: use it only when it genuinely changes your answer; ask one question at a time; emit exactly one block per message, at the very end, and write nothing after it, since you will pause for the user to answer.',
  'Always include "options": 2-5 concrete, mutually-exclusive answers the user can click, each with a short "label" and a one-line "description" of what choosing it means. Guess plausible answers from context rather than leaving the list empty — only omit "options" when the answer is genuinely free-form (a name, a number, a file path). Keep "allowFreeText": true so the user can still type something else.'
].join('\n')

/** Lets the model define a reusable /slash-command when the user asks for one. */
const SKILL_AUTHOR_SYSTEM_SUFFIX = [
  'Creating skills: when the user asks you to make, create, or save a "skill" (a reusable /command), define it by emitting a fenced block exactly like this at the end of your reply:',
  '```skill',
  '{ "name": "short-name", "description": "one line shown in the / menu", "instructions": "What to do when this skill runs. Use {{input}} where the rest of the user\'s message should be inserted." }',
  '```',
  'Rules: "name" becomes /name (lowercase, hyphens only). Only emit this block when the user actually asks to create a skill. After the block, briefly tell the user the skill is saved and how to run it. The block is captured automatically and hidden from the final message.'
].join('\n')

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

function buildConversationContextBlock(conversationId: string, contextItemIds?: string[]): string {
  return buildContextBlock(selectContextItems(dbContext.list(conversationId), contextItemIds))
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
    displayContent,
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
    continueMessageId,
    skillRequest
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
      displayContent: displayContent && displayContent !== content ? displayContent : undefined,
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

  const recallQuery =
    content || branch.filter((m) => m.role === 'user').slice(-1)[0]?.content || ''
  const memoryBlock = continuing ? '' : await buildMemoryRecallBlock(recallQuery)

  const effectiveSystem = buildSystemPrompt({
    basePrompt: systemPrompt || conv?.systemPrompt || settings.systemPrompt,
    modeSuffix: [
      composerMode === 'agent' ? COMPOSER_AGENT_SYSTEM_SUFFIX : '',
      ASK_USER_SYSTEM_SUFFIX,
      SKILL_AUTHOR_SYSTEM_SUFFIX
    ]
      .filter(Boolean)
      .join('\n\n'),
    memoryBlock,
    contextBlock: buildConversationContextBlock(conversationId, contextItemIds)
  })

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

  const contextWindow =
    (await resolveContextWindow(providerId, model)) ??
    settings.defaultContextWindow ??
    DEFAULT_CONTEXT_WINDOW
  const reservedOutput = settings.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT
  const trimmedHistory = trimHistoryToBudget(
    branch,
    contextWindow -
      reservedOutput -
      estimateTokens(effectiveSystem || '') -
      estimateTokens(searchPreamble)
  )
  if (trimmedHistory.droppedCount > 0) {
    console.log(
      `[context] trimmed ${trimmedHistory.droppedCount} older message(s) (~${trimmedHistory.droppedTokens}tok) to fit ${contextWindow}tok window`
    )
  }

  const historyForModel: Message[] = orderPromptMessages<Message>({
    history: trimmedHistory.kept,
    volatile: searchPreamble
      ? [
          {
            id: 'search_ctx',
            conversationId,
            role: 'system',
            content: searchPreamble,
            createdAt: Date.now()
          }
        ]
      : []
  })

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
            generated += contentDelta
            activeGen.content = priorContent + generated
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
          generated = cleanContent
          activeGen.content = priorContent + generated
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

      const emitSkillSaved = (saved: ReturnType<typeof dbSkills.upsert>) => {
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('skill:saved', saved)
        }
      }

      const { skills: authoredSkills, cleanContent: contentWithoutSkills } =
        extractSkillBlocks(accumulated)
      let storedContent = authoredSkills.length ? contentWithoutSkills : accumulated
      let skillWasSaved = false

      for (const authored of authoredSkills) {
        const name = normalizeSkillName(authored.name)
        if (!name) continue
        try {
          emitSkillSaved(
            dbSkills.upsert({
              id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name,
              description: authored.description,
              instructions: authored.instructions,
              createdBy: 'model'
            })
          )
          skillWasSaved = true
        } catch {
          // best-effort: a bad skill definition shouldn't fail the message
        }
      }

      // Deterministic fallback for /skill: small models can't reliably emit the
      // block, so when the user explicitly asked to create a skill and none was
      // parsed, capture the model's prose reply as the skill's instructions.
      if (skillRequest && !skillWasSaved) {
        const instructions = contentWithoutSkills.trim()
        if (instructions) {
          const name = deriveSkillName(skillRequest.description)
          try {
            const saved = dbSkills.upsert({
              id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name,
              description: skillRequest.description.slice(0, 120),
              instructions,
              createdBy: 'model'
            })
            emitSkillSaved(saved)
            storedContent = `✅ Saved skill **/${saved.name}** — run it any time by typing \`/${saved.name}\`.\n\nIt will follow these instructions:\n\n> ${instructions.replace(/\n/g, '\n> ')}`
          } catch {
            // ignore — keep the original reply if saving fails
          }
        }
      }


      dbMessages.update(assistantMsgId, {
        content: storedContent,
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
        correctedContent: storedContent !== accumulated ? storedContent : undefined,
        thinkingDurationMs: totalThinkingDurationMs,
        done: true,
        usage,
        finishReason,
        eventType: 'done'
      })

      try {
        const path = getBranchPath(dbMessages.listForConversation(conversationId), assistantMsgId)
        const lastUser = [...path].reverse().find((m) => m.role === 'user')
        void extractAndStoreMemories({
          conversationId,
          messageId: assistantMsgId,
          userText: content?.trim() || lastUser?.content || '',
          assistantText: accumulated
        }).then((saved) => {
          if (saved.length && win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('memory:saved', saved)
          }
        })
      } catch {
        // memory extraction is best-effort
      }
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
        const message = presentableErrorMessage(err)
        const errorText = priorContent + generated + `\n\n*[${message}]*`
        dbMessages.update(assistantMsgId, { content: errorText, error: message })
        sendChunk(win, {
          conversationId,
          messageId: assistantMsgId,
          generationId,
          contentDelta: '',
          done: true,
          error: message,
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

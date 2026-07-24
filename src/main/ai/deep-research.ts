import type { BrowserWindow } from 'electron'
import type {
  Artifact,
  Citation,
  Message,
  ResearchPlan,
  ResearchStep,
  SendMessagePayload,
  StreamChunkPayload,
  TokenUsage,
  WebSearchResult,
  WebSearchSettings
} from '../../shared/types'
import {
  estimateTokens,
  extractArtifacts
} from '../../shared/chat-utils'
import {
  dbArtifacts,
  dbCitations,
  dbMessages,
  dbSettings
} from '../db/database'
import { streamChatResponse } from './provider-manager'
import { ensureLocalSearchReady, runWebSearch } from '../services/web-search'

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sendChunk(win: BrowserWindow | null, chunk: StreamChunkPayload): void {
  win?.webContents.send('ai:stream-chunk', chunk)
}

const PLANNER_SYSTEM_PROMPT = `You are a research planning AI. Your job is to decompose the user's research topic or question into 3 to 5 distinct, highly targeted web search queries.
Return strictly valid JSON only with no markdown formatting or extra text.
Format:
{
  "queries": ["query 1", "query 2", "query 3"],
  "reasoning": "A short 1-2 sentence explanation of your research strategy."
}`

export async function startDeepResearch(
  win: BrowserWindow | null,
  payload: SendMessagePayload,
  assistantMsgId: string,
  generationId: string,
  branch: Message[],
  effectiveSystem: string,
  mergedSettings: any,
  controller: AbortController
): Promise<void> {
  const { conversationId, content, model, providerId } = payload
  const settings = dbSettings.get()

  dbMessages.update(assistantMsgId, { isDeepResearch: true })

  const userQuery = content || branch.filter((m) => m.role === 'user').slice(-1)[0]?.content || ''

  // 1. Planning phase
  let plan: ResearchPlan = {
    originalQuery: userQuery,
    subQueries: [userQuery],
    reasoning: 'Searching for relevant information across key aspects.'
  }

  try {
    const plannerHistory: Message[] = [
      ...branch,
      {
        id: newId('plan_prompt'),
        conversationId,
        role: 'user',
        content: `Create a research plan for: "${userQuery}"`,
        createdAt: Date.now()
      }
    ]

    let plannerText = ''
    for await (const event of streamChatResponse(providerId, model, plannerHistory, PLANNER_SYSTEM_PROMPT, {
      signal: controller.signal,
      generationSettings: { ...mergedSettings, temperature: 0.2 }
    })) {
      if (event.type === 'text') {
        plannerText += event.text
      } else if (event.type === 'error') {
        throw new Error(event.error)
      }
    }

    const cleanJson = plannerText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleanJson)
    if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      plan = {
        originalQuery: userQuery,
        subQueries: parsed.queries.slice(0, 5),
        reasoning: parsed.reasoning || 'Multi-step research plan generated.'
      }
    }
  } catch (err: any) {
    console.warn('[deep-research] Planning fallback used:', err.message || err)
    // Fallback heuristic planning if LLM JSON parse fails
    plan = {
      originalQuery: userQuery,
      subQueries: [
        userQuery,
        `${userQuery} overview and key details`,
        `${userQuery} recent updates and developments`
      ],
      reasoning: 'Synthesizing key topics and recent developments.'
    }
  }

  sendChunk(win, {
    conversationId,
    messageId: assistantMsgId,
    generationId,
    done: false,
    researchPlan: plan,
    eventType: 'research-plan'
  })

  // 2. Search phase for each sub-query
  const ws: WebSearchSettings = {
    provider: 'local',
    enabled: true,
    maxResults: Math.min(settings.webSearch?.maxResults || 5, 4),
    endpoint: settings.webSearch?.endpoint
  }

  try {
    await ensureLocalSearchReady()
  } catch (err: any) {
    console.warn('[deep-research] Search runtime setup error:', err)
  }

  const allCitations: Citation[] = []
  const allResults: WebSearchResult[] = []

  for (let i = 0; i < plan.subQueries.length; i++) {
    if (controller.signal.aborted) break

    const query = plan.subQueries[i]
    const stepIndex = i + 1
    const totalSteps = plan.subQueries.length

    const currentStep: ResearchStep = {
      stepIndex,
      totalSteps,
      query,
      status: 'searching',
      sourcesFound: 0
    }

    sendChunk(win, {
      conversationId,
      messageId: assistantMsgId,
      generationId,
      done: false,
      researchStep: currentStep,
      eventType: 'research-step'
    })

    try {
      const results = await runWebSearch(query, ws)
      currentStep.status = 'reading'
      currentStep.sourcesFound = results.length

      sendChunk(win, {
        conversationId,
        messageId: assistantMsgId,
        generationId,
        done: false,
        researchStep: currentStep,
        eventType: 'research-step'
      })

      for (const r of results) {
        if (!allResults.some((existing) => existing.url === r.url)) {
          allResults.push(r)
          const citation: Citation = {
            id: newId('cite'),
            messageId: assistantMsgId,
            url: r.url,
            title: r.title,
            snippet: r.snippet,
            retrievedAt: Date.now(),
            rank: allCitations.length + 1
          }
          allCitations.push(citation)
          dbCitations.create(citation)
          sendChunk(win, {
            conversationId,
            messageId: assistantMsgId,
            generationId,
            done: false,
            citation,
            eventType: 'citation'
          })
        }
      }

      currentStep.status = 'done'
      sendChunk(win, {
        conversationId,
        messageId: assistantMsgId,
        generationId,
        done: false,
        researchStep: currentStep,
        eventType: 'research-step'
      })
    } catch (err: any) {
      currentStep.status = 'error'
      currentStep.error = err?.message || 'Search failed'
      sendChunk(win, {
        conversationId,
        messageId: assistantMsgId,
        generationId,
        done: false,
        researchStep: currentStep,
        eventType: 'research-step'
      })
    }
  }

  // 3. Synthesis Phase
  if (controller.signal.aborted) {
    const stoppedText =
      allResults.length > 0
        ? `(deep research stopped after gathering ${allResults.length} sources)`
        : '(deep research stopped)'
    dbMessages.update(assistantMsgId, {
      content: stoppedText,
      isDeepResearch: true
    })
    sendChunk(win, {
      conversationId,
      messageId: assistantMsgId,
      generationId,
      contentDelta: '',
      correctedContent: stoppedText,
      done: true,
      eventType: 'done'
    })
    return
  }

  const searchPreamble = allResults.length > 0
    ? 'Deep Research gathered sources (Cite these sources in your answer using inline bracketed numbers like [1], [2]):\n\n' +
      allResults.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nSummary: ${r.snippet}`).join('\n\n')
    : 'No external web sources were found. Provide the best possible comprehensive analysis based on existing knowledge.'

  const synthesisSystemPrompt = [
    effectiveSystem,
    'You are a Deep Research Specialist. Write a thorough, well-structured, multi-section synthesis of the findings. Use Markdown headers, bullet points, and inline citations [1], [2] referencing the provided sources where applicable.'
  ].filter(Boolean).join('\n\n')

  const historyForModel: Message[] = [
    ...branch,
    {
      id: 'deep_research_ctx',
      conversationId,
      role: 'system',
      content: searchPreamble,
      createdAt: Date.now()
    }
  ]

  let accumulated = ''
  let usage: TokenUsage | undefined

  try {
    for await (const event of streamChatResponse(providerId, model, historyForModel, synthesisSystemPrompt, {
      signal: controller.signal,
      generationSettings: mergedSettings
    })) {
      if (event.type === 'text') {
        accumulated += event.text
        sendChunk(win, {
          conversationId,
          messageId: assistantMsgId,
          generationId,
          contentDelta: event.text,
          done: false,
          eventType: 'text'
        })
      } else if (event.type === 'usage') {
        usage = event.usage
      } else if (event.type === 'error') {
        throw new Error(event.error)
      }
    }

    if (!usage) {
      const promptText = historyForModel.map((m) => m.content).join('\n') + synthesisSystemPrompt
      usage = {
        promptTokens: estimateTokens(promptText),
        completionTokens: estimateTokens(accumulated),
        totalTokens: estimateTokens(promptText) + estimateTokens(accumulated),
        estimated: true
      }
    }

    dbMessages.update(assistantMsgId, {
      content: accumulated,
      tokensIn: usage.promptTokens,
      tokensOut: usage.completionTokens,
      isDeepResearch: true,
      error: undefined
    })

    // Extract artifacts
    const extracted = extractArtifacts(accumulated)
    for (const [idx, ex] of extracted.entries()) {
      const artifact: Artifact = {
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
      dbArtifacts.create(artifact)
      sendChunk(win, {
        conversationId,
        messageId: assistantMsgId,
        generationId,
        done: false,
        artifact,
        eventType: 'artifact'
      })
    }

    sendChunk(win, {
      conversationId,
      messageId: assistantMsgId,
      generationId,
      contentDelta: '',
      done: true,
      usage,
      eventType: 'done'
    })
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      dbMessages.update(assistantMsgId, {
        content: accumulated || '(deep research stopped)',
        tokensOut: estimateTokens(accumulated),
        isDeepResearch: true
      })
      sendChunk(win, {
        conversationId,
        messageId: assistantMsgId,
        generationId,
        contentDelta: '',
        done: true,
        eventType: 'done'
      })
    } else {
      console.error('[Deep Research Error]', err)
      const errorText = accumulated + `\n\n*[Error in Deep Research: ${err.message || 'Streaming failed'}]*`
      dbMessages.update(assistantMsgId, { content: errorText, error: err.message, isDeepResearch: true })
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
  }
}

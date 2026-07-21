import type { WebSearchMode } from './types'

/**
 * Local intent rules for Auto web search.
 * Detects explicit lookups and time-sensitive topics without calling a model.
 */
const EXPLICIT_LOOKUP =
  /\b(search\s+for|look\s+up|google|find\s+(out\s+|me\s+)?(about|info|information)|what('?s|\s+is)\s+the\s+(latest|current)|who\s+(won|is\s+the\s+current)|check\s+online|browse\s+(for|about))\b/i

const TIME_SENSITIVE =
  /\b(today|tonight|yesterday|this (week|month|year)|latest|breaking|current|recent(ly)?|right now|as of|live|trending|upcoming|release date|released|price of|stock(s)?|weather|forecast|news|headline|election|score|standings|version \d)\b/i

const DATE_OR_YEAR =
  /\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i

const URL_OR_DOMAIN = /\b(https?:\/\/|www\.|\.com|\.org|\.io|\.ai)\b/i

export interface SearchIntentDecision {
  shouldSearch: boolean
  reason: string
}

export function shouldAutoSearch(query: string): SearchIntentDecision {
  const text = query.trim()
  if (!text) {
    return { shouldSearch: false, reason: 'Empty query' }
  }

  if (EXPLICIT_LOOKUP.test(text)) {
    return { shouldSearch: true, reason: 'Explicit lookup request' }
  }

  if (TIME_SENSITIVE.test(text)) {
    return { shouldSearch: true, reason: 'Time-sensitive or current-events topic' }
  }

  // Year/month mentions alone are weak; require a question-like shape
  if (DATE_OR_YEAR.test(text) && /\?|\b(what|when|who|where|how|which)\b/i.test(text)) {
    return { shouldSearch: true, reason: 'Dated factual question' }
  }

  if (URL_OR_DOMAIN.test(text) && /\b(about|summary|summarize|who|what)\b/i.test(text)) {
    return { shouldSearch: true, reason: 'Lookup about an online source' }
  }

  return { shouldSearch: false, reason: 'Prompt does not appear to need live web data' }
}

export function resolveWebSearchMode(
  mode: WebSearchMode | undefined,
  legacyBoolean?: boolean
): WebSearchMode {
  if (mode === 'off' || mode === 'auto' || mode === 'on') return mode
  if (legacyBoolean === true) return 'on'
  if (legacyBoolean === false) return 'off'
  return 'off'
}

/**
 * Resolve effective mode from the friendly composer toggle.
 * - toggle off → off
 * - toggle on → auto (intent decides)
 * - forceWebSearch → on for this message
 */
export function resolveComposerSearchMode(opts: {
  webSearchEnabled?: boolean
  forceWebSearch?: boolean
  webSearchMode?: WebSearchMode
  legacyBoolean?: boolean
}): WebSearchMode {
  if (opts.forceWebSearch) return 'on'
  if (typeof opts.webSearchEnabled === 'boolean') {
    return opts.webSearchEnabled ? 'auto' : 'off'
  }
  return resolveWebSearchMode(opts.webSearchMode, opts.legacyBoolean)
}

export function decideWebSearch(
  mode: WebSearchMode,
  query: string
): { run: boolean; statusMessage: string; skipped: boolean } {
  if (mode === 'off') {
    return { run: false, statusMessage: 'Web search off', skipped: true }
  }
  if (mode === 'on') {
    return { run: true, statusMessage: 'Searching this message', skipped: false }
  }
  const decision = shouldAutoSearch(query)
  return {
    run: decision.shouldSearch,
    statusMessage: decision.shouldSearch
      ? 'Looking up current information'
      : 'No live lookup needed for this message',
    skipped: !decision.shouldSearch
  }
}

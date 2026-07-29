import { describe, it, expect } from 'vitest'
import {
  extractSearchRequest,
  extractAllSearchRequests,
  stripSearchRequests,
  splitStreamingAskUser,
  extractShells
} from './chat-utils'

describe('extractSearchRequest', () => {
  it('parses the canonical JSON body', () => {
    const t = 'Let me check.\n\n```search\n{ "query": "electron 43 release date" }\n```'
    expect(extractSearchRequest(t)!.query).toBe('electron 43 release date')
    expect(stripSearchRequests(t)).toBe('Let me check.')
  })

  it('accepts a bare query body, which small models emit instead of JSON', () => {
    const t = '```search\nlatest llama.cpp server flags\n```'
    expect(extractSearchRequest(t)!.query).toBe('latest llama.cpp server flags')
  })

  it('strips surrounding quotes from a bare body', () => {
    const t = '```search\n"vitest 3 breaking changes"\n```'
    expect(extractSearchRequest(t)!.query).toBe('vitest 3 breaking changes')
  })

  it('tolerates smart quotes and a trailing comma in the JSON body', () => {
    const t = '```search\n{ “query”: “zustand v5 migration”, }\n```'
    expect(extractSearchRequest(t)!.query).toBe('zustand v5 migration')
  })

  it('returns the last request, since only the trailing one is unanswered', () => {
    const t = '```search\n{ "query": "first" }\n```\ntext\n```search\n{ "query": "second" }\n```'
    expect(extractAllSearchRequests(t)).toHaveLength(2)
    expect(extractSearchRequest(t)!.query).toBe('second')
    expect(stripSearchRequests(t)).toBe('text')
  })

  it('ignores an empty or unparseable body', () => {
    expect(extractSearchRequest('```search\n\n```')).toBeNull()
    expect(extractSearchRequest('```search\n{ "notquery": 1 }\n```')).toBeNull()
    expect(extractSearchRequest('no blocks here')).toBeNull()
  })

  it('leaves ordinary text and other fences alone', () => {
    const t = 'Use ripgrep.\n\n```bash\nrg --search foo\n```'
    expect(stripSearchRequests(t)).toBe(t)
  })

  it('does not turn a search block into a shell', () => {
    const t = '```search\n{ "query": "anything" }\n```'
    expect(extractShells(t).some((s) => s.content.includes('query'))).toBe(false)
  })

  it('hides a half-written block while it is still streaming', () => {
    const r = splitStreamingAskUser('One moment.\n\n```search\n{ "que')
    expect(r.asking).toBe(true)
    expect(r.visible).toBe('One moment.')
  })
})

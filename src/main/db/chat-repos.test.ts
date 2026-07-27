import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate, setSqlitePath, closeSqlite, getSqlite } from './sqlite'
import {
  chatConversations,
  chatMessages,
  chatContext,
  chatArtifacts
} from './chat-repos'

describe('sqlite chat repos', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-test-'))
    setSqlitePath(path.join(dir, 'test.sqlite'))
    getSqlite()
  })

  afterEach(() => {
    closeSqlite()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates conversations and messages with branch parents', () => {
    chatConversations.create({
      id: 'c1',
      title: 'Hello world',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })

    chatMessages.create({
      id: 'u1',
      conversationId: 'c1',
      role: 'user',
      content: 'hello searchable content',
      createdAt: 1,
      parentId: null
    })
    chatMessages.create({
      id: 'a1',
      conversationId: 'c1',
      role: 'assistant',
      content: 'response',
      createdAt: 2,
      parentId: 'u1'
    })

    const msgs = chatMessages.listForConversation('c1')
    expect(msgs).toHaveLength(2)
    expect(msgs[1].parentId).toBe('u1')

    const hits = chatConversations.search('searchable')
    expect(hits.some((h) => h.conversationId === 'c1')).toBe(true)
  })

  it('versions artifacts', () => {
    chatConversations.create({
      id: 'c2',
      title: 'Arts',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })
    chatMessages.create({
      id: 'm1',
      conversationId: 'c2',
      role: 'assistant',
      content: 'code',
      createdAt: 1
    })
    chatArtifacts.create({
      id: 'art1',
      conversationId: 'c2',
      messageId: 'm1',
      type: 'code',
      title: 'Snippet',
      language: 'ts',
      content: 'const a = 1',
      version: 1,
      createdAt: 1,
      updatedAt: 1
    })

    const updated = chatArtifacts.updateContent('art1', 'const a = 2')
    expect(updated?.version).toBe(2)
    expect(chatArtifacts.listVersions('art1')).toHaveLength(2)

    const restored = chatArtifacts.restoreVersion('art1', 1)
    expect(restored?.content).toBe('const a = 1')
  })

  it('stores context items', () => {
    chatConversations.create({
      id: 'c3',
      title: 'Ctx',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })
    chatContext.create({
      id: 'ctx1',
      conversationId: 'c3',
      type: 'text',
      name: 'note',
      content: 'hello',
      tokenEstimate: 2,
      createdAt: 1,
      enabled: true
    })
    expect(chatContext.list('c3')).toHaveLength(1)
    chatContext.update('ctx1', { enabled: false })
    expect(chatContext.list('c3')[0].enabled).toBe(false)
  })

  it('keeps context and messages isolated per conversation', () => {
    chatConversations.create({
      id: 'iso-a',
      title: 'A',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })
    chatConversations.create({
      id: 'iso-b',
      title: 'B',
      model: 'm',
      providerId: 'p',
      createdAt: 2,
      updatedAt: 2,
      pinned: false,
      archived: false
    })

    chatMessages.create({
      id: 'ma1',
      conversationId: 'iso-a',
      role: 'user',
      content: 'only in A',
      createdAt: 1,
      parentId: null
    })
    chatContext.create({
      id: 'ctx-a',
      conversationId: 'iso-a',
      type: 'text',
      name: 'file-a',
      content: 'context A',
      tokenEstimate: 3,
      createdAt: 1,
      enabled: true
    })

    expect(chatMessages.listForConversation('iso-b')).toHaveLength(0)
    expect(chatContext.list('iso-b')).toHaveLength(0)
    expect(chatMessages.listForConversation('iso-a')).toHaveLength(1)
    expect(chatContext.list('iso-a')[0].name).toBe('file-a')

    const listed = chatConversations.list()
    expect(listed.map((c) => c.id).sort()).toEqual(['iso-a', 'iso-b'])
  })

  it('round-trips finishReason on create and update', () => {
    chatConversations.create({
      id: 'c9',
      title: 'Truncation',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })
    chatMessages.create({
      id: 'a9',
      conversationId: 'c9',
      role: 'assistant',
      content: 'cut off here',
      createdAt: 1,
      parentId: null,
      finishReason: 'length'
    })

    expect(chatMessages.get('a9')?.finishReason).toBe('length')

    chatMessages.update('a9', { content: 'cut off here and resumed', finishReason: 'stop' })
    expect(chatMessages.get('a9')?.finishReason).toBe('stop')

    chatMessages.update('a9', { finishReason: undefined })
    expect(chatMessages.get('a9')?.finishReason).toBeUndefined()
  })

  it('runs migrations idempotently', () => {
    const db = new Database(path.join(dir, 'mig.sqlite'))
    migrate(db)
    migrate(db)
    const row = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number }
    expect(row.v).toBe(3)
    db.close()
  })
})

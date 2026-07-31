import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MessageAttachment } from '../../shared/types'
import { MIGRATIONS, migrate, setSqlitePath, closeSqlite, getSqlite } from './sqlite'
import {
  chatConversations,
  chatMessages,
  chatContext,
  chatArtifacts,
  chatAttachments
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

  it('searches messages and returns message search hits', () => {
    chatConversations.create({
      id: 'c_search',
      title: 'Quantum Computing Overview',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })

    chatMessages.create({
      id: 'm_quantum',
      conversationId: 'c_search',
      role: 'assistant',
      content: 'Superposition and entanglement are key principles of quantum computing.',
      createdAt: 100
    })

    const hits = chatMessages.searchMessages('superposition')
    expect(hits).toHaveLength(1)
    expect(hits[0].messageId).toBe('m_quantum')
    expect(hits[0].conversationTitle).toBe('Quantum Computing Overview')
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

    chatMessages.update('a9', { content: 'cut off here and resumed', finishReason: 'stop', ttftMs: 320, tokensPerSec: 28.5 })
    expect(chatMessages.get('a9')?.finishReason).toBe('stop')
    expect(chatMessages.get('a9')?.ttftMs).toBe(320)
    expect(chatMessages.get('a9')?.tokensPerSec).toBe(28.5)

    chatMessages.update('a9', { finishReason: undefined })
    expect(chatMessages.get('a9')?.finishReason).toBeUndefined()
  })

  it('runs migrations idempotently', () => {
    const db = new Database(path.join(dir, 'mig.sqlite'))
    migrate(db)
    const first = db
      .prepare('SELECT MAX(version) as v, COUNT(*) as n FROM schema_migrations')
      .get() as { v: number; n: number }
    migrate(db)
    const second = db
      .prepare('SELECT MAX(version) as v, COUNT(*) as n FROM schema_migrations')
      .get() as { v: number; n: number }

    expect(second).toEqual(first)
    expect(first.v).toBe(MIGRATIONS[MIGRATIONS.length - 1].version)
    expect(first.n).toBe(MIGRATIONS.length)
    db.close()
  })

  describe('attachments', () => {
    beforeEach(() => {
      chatConversations.create({
        id: 'ca',
        title: 'attachments',
        model: 'm',
        providerId: 'p',
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
        archived: false
      })
      chatMessages.create({
        id: 'um1',
        conversationId: 'ca',
        role: 'user',
        content: 'look at this',
        createdAt: 1,
        parentId: null
      })
    })

    const stage = (id: string, overrides: Partial<MessageAttachment> = {}): MessageAttachment => {
      const att: MessageAttachment = {
        id,
        conversationId: 'ca',
        messageId: null,
        kind: 'image',
        mimeType: 'image/png',
        name: 'image.png',
        storagePath: `/tmp/attachments/${id}.png`,
        thumbPath: `/tmp/attachments/${id}.thumb.jpg`,
        byteSize: 1234,
        width: 800,
        height: 600,
        tokenEstimate: 1024,
        createdAt: 10,
        ...overrides
      }
      chatAttachments.stage(att)
      return att
    }

    it('stages unbound rows and binds them to a message', () => {
      stage('at1')
      expect(chatAttachments.listStaged('ca').map((a) => a.id)).toEqual(['at1'])

      chatAttachments.bindToMessage(['at1'], 'um1')

      expect(chatAttachments.listStaged('ca')).toEqual([])
      expect(chatAttachments.get('at1')?.messageId).toBe('um1')
    })

    it('never rebinds an attachment that already belongs to a message', () => {
      stage('at1')
      chatAttachments.bindToMessage(['at1'], 'um1')
      chatAttachments.bindToMessage(['at1'], 'other')
      expect(chatAttachments.get('at1')?.messageId).toBe('um1')
    })

    it('hydrates bound attachments onto messages, excluding staged ones', () => {
      stage('bound')
      stage('staged')
      chatAttachments.bindToMessage(['bound'], 'um1')

      const messages = chatMessages.listForConversation('ca')
      const user = messages.find((m) => m.id === 'um1')
      expect(user?.attachments?.map((a) => a.id)).toEqual(['bound'])
    })

    it('leaves attachments undefined on messages that have none', () => {
      const messages = chatMessages.listForConversation('ca')
      expect(messages.find((m) => m.id === 'um1')?.attachments).toBeUndefined()
    })

    it('groups listForMessages by message id', () => {
      stage('a1', { createdAt: 10 })
      stage('a2', { createdAt: 20 })
      chatAttachments.bindToMessage(['a1', 'a2'], 'um1')

      const map = chatAttachments.listForMessages(['um1', 'missing'])
      expect(map.get('um1')?.map((a) => a.id)).toEqual(['a1', 'a2'])
      expect(map.get('missing')).toBeUndefined()
    })

    it('returns an empty map for no message ids', () => {
      expect(chatAttachments.listForMessages([])).toEqual(new Map())
    })

    it('refcounts shared storage paths', () => {
      const shared = '/tmp/attachments/shared.png'
      stage('a1', { storagePath: shared })
      stage('a2', { storagePath: shared })

      expect(chatAttachments.countByStoragePath(shared)).toBe(2)
      chatAttachments.delete('a1')
      expect(chatAttachments.countByStoragePath(shared)).toBe(1)
      chatAttachments.delete('a2')
      expect(chatAttachments.countByStoragePath(shared)).toBe(0)
    })

    it('cascades when the owning message is deleted', () => {
      stage('at1')
      chatAttachments.bindToMessage(['at1'], 'um1')

      getSqlite().prepare('DELETE FROM messages WHERE id = ?').run('um1')

      expect(chatAttachments.get('at1')).toBeUndefined()
    })

    it('lists storage and thumb paths for the orphan sweep', () => {
      stage('at1', { storagePath: '/s/a.png', thumbPath: '/s/a.thumb.jpg' })
      stage('at2', { storagePath: '/s/b.png', thumbPath: undefined })

      expect(chatAttachments.listAllStoragePaths().sort()).toEqual([
        '/s/a.png',
        '/s/a.thumb.jpg',
        '/s/b.png'
      ])
    })

    it('finds stale staged rows by age', () => {
      stage('old', { createdAt: 100 })
      stage('fresh', { createdAt: 5000 })
      stage('bound', { createdAt: 100 })
      chatAttachments.bindToMessage(['bound'], 'um1')

      expect(chatAttachments.listStaleStaged(1000).map((a) => a.id)).toEqual(['old'])
    })
  })
})

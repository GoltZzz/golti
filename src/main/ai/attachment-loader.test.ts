import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, MessageAttachment } from '../../shared/types'
import { _setAttachmentDirForTests, getAttachmentDir } from '../services/attachment-store'
import { collectFor, loadAttachments } from './attachment-loader'

describe('loadAttachments', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-loader-'))
    _setAttachmentDirForTests(path.join(root, 'attachments'))
    getAttachmentDir()
  })

  afterEach(() => {
    _setAttachmentDirForTests(null)
    fs.rmSync(root, { recursive: true, force: true })
  })

  const writeStored = (name: string, body: string): string => {
    const p = path.join(getAttachmentDir(), 'ab', name)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
    return p
  }

  const att = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
    id: 'a1',
    conversationId: 'c1',
    messageId: 'm1',
    kind: 'image',
    mimeType: 'image/png',
    name: 'shot.png',
    storagePath: writeStored('one.png', 'IMG'),
    byteSize: 3,
    tokenEstimate: 100,
    createdAt: 1,
    ...over
  })

  const msg = (id: string, attachments?: MessageAttachment[]): Message => ({
    id,
    conversationId: 'c1',
    role: 'user',
    content: 'hi',
    createdAt: 1,
    attachments
  })

  it('returns an empty map when nothing is attached', () => {
    const result = loadAttachments([msg('m1'), msg('m2')])
    expect(result.byMessage.size).toBe(0)
    expect(result.skipped).toEqual([])
  })

  it('loads bytes as base64 keyed by message id', () => {
    const result = loadAttachments([msg('m1', [att()])])
    expect(result.byMessage.get('m1')).toEqual([
      {
        id: 'a1',
        kind: 'image',
        mimeType: 'image/png',
        name: 'shot.png',
        base64: Buffer.from('IMG').toString('base64')
      }
    ])
  })

  it('reads a shared storage path only once', () => {
    const shared = writeStored('shared.png', 'SAME')
    const result = loadAttachments([
      msg('m1', [att({ id: 'a1', storagePath: shared })]),
      msg('m2', [att({ id: 'a2', messageId: 'm2', storagePath: shared })])
    ])

    const first = result.byMessage.get('m1')![0].base64
    const second = result.byMessage.get('m2')![0].base64
    expect(first).toBe(second)
    expect(result.skipped).toEqual([])
  })

  it('skips an attachment whose file is gone', () => {
    const result = loadAttachments([
      msg('m1', [att({ storagePath: path.join(getAttachmentDir(), 'ab', 'missing.png') })])
    ])
    expect(result.byMessage.size).toBe(0)
    expect(result.skipped).toEqual([{ id: 'a1', name: 'shot.png', reason: 'file missing' }])
  })

  it('skips an attachment already flagged with an error', () => {
    const result = loadAttachments([msg('m1', [att({ error: 'unsupported' })])])
    expect(result.byMessage.size).toBe(0)
    expect(result.skipped[0].reason).toBe('unsupported')
  })

  it('rejects a storage path outside the attachment store', () => {
    const outside = path.join(root, 'escape.png')
    fs.writeFileSync(outside, 'NOPE')
    const result = loadAttachments([msg('m1', [att({ storagePath: outside })])])

    expect(result.byMessage.size).toBe(0)
    expect(result.skipped[0].reason).toBe('file missing')
  })

  it('drops the oldest attachments first when over the byte cap', () => {
    const huge = 17 * 1024 * 1024
    const result = loadAttachments([
      msg('old', [att({ id: 'old', messageId: 'old', byteSize: huge, storagePath: writeStored('o.png', 'O') })]),
      msg('new', [att({ id: 'new', messageId: 'new', byteSize: huge, storagePath: writeStored('n.png', 'N') })])
    ])

    // Newest turn wins: its images must never be the ones dropped.
    expect(result.byMessage.has('new')).toBe(true)
    expect(result.byMessage.has('old')).toBe(false)
    expect(result.skipped[0].reason).toBe('request attachment size limit')
  })
})

describe('collectFor', () => {
  const loaded = (id: string) => ({
    id,
    kind: 'image' as const,
    mimeType: 'image/png',
    name: `${id}.png`,
    base64: 'AAAA'
  })

  it('flattens attachments across the given message ids in order', () => {
    const map = new Map([
      ['m1', [loaded('a')]],
      ['m2', [loaded('b'), loaded('c')]]
    ])
    expect(collectFor(map, ['m1', 'm2']).map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('ignores ids with nothing attached', () => {
    expect(collectFor(new Map(), ['m1'])).toEqual([])
  })
})

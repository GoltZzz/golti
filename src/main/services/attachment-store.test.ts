import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeSqlite, getSqlite, setSqlitePath } from '../db/sqlite'
import { chatAttachments, chatConversations, chatMessages } from '../db/chat-repos'
import {
  MAX_ATTACHMENT_BYTES,
  _setAttachmentDirForTests,
  assertContained,
  assertInsideStore,
  deleteAttachment,
  getAttachmentDir,
  imageMimeForExtension,
  isSupportedImage,
  readAttachmentBytes,
  readAttachmentDataUrl,
  resolveStoragePath,
  stageImage,
  stageImageFromPath,
  sweepAttachments
} from './attachment-store'

const HASH = 'a'.repeat(64)

describe('attachment-store', () => {
  let root: string
  let attachDir: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-att-'))
    attachDir = path.join(root, 'attachments')
    _setAttachmentDirForTests(attachDir)
    setSqlitePath(path.join(root, 'test.sqlite'))
    getSqlite()
    chatConversations.create({
      id: 'c1',
      title: 't',
      model: 'm',
      providerId: 'p',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      archived: false
    })
  })

  afterEach(() => {
    closeSqlite()
    _setAttachmentDirForTests(null)
    fs.rmSync(root, { recursive: true, force: true })
  })

  const png = (body: string): Buffer => Buffer.from(`\x89PNG\r\n\x1a\n${body}`, 'binary')

  describe('mime detection', () => {
    it('maps known image extensions', () => {
      expect(imageMimeForExtension('shot.PNG')).toBe('image/png')
      expect(imageMimeForExtension('photo.jpeg')).toBe('image/jpeg')
      expect(imageMimeForExtension('anim.gif')).toBe('image/gif')
      expect(imageMimeForExtension('notes.txt')).toBeUndefined()
    })

    it('accepts supported mimes and paths, rejects others', () => {
      expect(isSupportedImage('image/png')).toBe(true)
      expect(isSupportedImage('image/avif')).toBe(false)
      expect(isSupportedImage('diagram.webp')).toBe(true)
      expect(isSupportedImage('report.pdf')).toBe(false)
    })
  })

  describe('path safety', () => {
    it('rejects traversal and absolute escapes', () => {
      expect(() => assertContained(path.join(attachDir, '..', 'evil.png'), attachDir)).toThrow(
        'Invalid attachment path'
      )
      expect(() => assertContained('/etc/passwd', attachDir)).toThrow('Invalid attachment path')
    })

    it('rejects the store directory itself', () => {
      expect(() => assertContained(attachDir, attachDir)).toThrow('Invalid attachment path')
    })

    it('accepts a sharded path inside the store', () => {
      expect(assertInsideStore(path.join(attachDir, 'ab', 'x.png'))).toBe(
        path.resolve(attachDir, 'ab', 'x.png')
      )
    })

    it('rejects a malformed hash', () => {
      expect(() => resolveStoragePath('nope', 'image/png')).toThrow('Invalid attachment hash')
      expect(() => resolveStoragePath('A'.repeat(64), 'image/png')).toThrow(
        'Invalid attachment hash'
      )
    })

    it('rejects an unsupported mime', () => {
      expect(() => resolveStoragePath(HASH, 'application/zip')).toThrow(
        'Unsupported attachment type'
      )
    })

    it('shards two levels deep by hash prefix', () => {
      expect(resolveStoragePath(HASH, 'image/png')).toBe(
        path.join(getAttachmentDir(), 'aa', `${HASH}.png`)
      )
    })
  })

  describe('stageImage', () => {
    it('writes bytes and records a staged row', () => {
      const att = stageImage({ conversationId: 'c1', name: 'shot.png', bytes: png('one') })

      expect(att.messageId).toBeNull()
      expect(att.kind).toBe('image')
      expect(att.mimeType).toBe('image/png')
      expect(fs.existsSync(att.storagePath)).toBe(true)
      expect(chatAttachments.listStaged('c1').map((a) => a.id)).toEqual([att.id])
    })

    it('carries a non-zero token estimate even without a decoder', () => {
      const att = stageImage({ conversationId: 'c1', name: 'shot.png', bytes: png('one') })
      expect(att.tokenEstimate).toBeGreaterThan(0)
    })

    it('content-addresses identical bytes to one file but distinct rows', () => {
      const a = stageImage({ conversationId: 'c1', name: 'image.png', bytes: png('same') })
      const b = stageImage({ conversationId: 'c1', name: 'image.png', bytes: png('same') })

      expect(a.id).not.toBe(b.id)
      expect(a.storagePath).toBe(b.storagePath)
      expect(chatAttachments.countByStoragePath(a.storagePath)).toBe(2)
    })

    it('separates different bytes into different files', () => {
      const a = stageImage({ conversationId: 'c1', name: 'a.png', bytes: png('one') })
      const b = stageImage({ conversationId: 'c1', name: 'b.png', bytes: png('two') })
      expect(a.storagePath).not.toBe(b.storagePath)
    })

    it('infers the mime from the filename when none is supplied', () => {
      expect(
        stageImage({ conversationId: 'c1', name: 'photo.jpg', bytes: png('j') }).mimeType
      ).toBe('image/jpeg')
    })

    it('rejects unsupported types, empty bytes, and oversized images', () => {
      expect(() =>
        stageImage({ conversationId: 'c1', name: 'notes.txt', bytes: Buffer.from('hi') })
      ).toThrow('Unsupported image type')

      expect(() =>
        stageImage({ conversationId: 'c1', name: 'e.png', bytes: Buffer.alloc(0) })
      ).toThrow('Empty image')

      expect(() =>
        stageImage({
          conversationId: 'c1',
          name: 'big.png',
          bytes: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
        })
      ).toThrow(/exceeds .*MB limit/)
    })

    it('reads bytes back and as a data URL', () => {
      const att = stageImage({ conversationId: 'c1', name: 'shot.png', bytes: png('round') })

      expect(readAttachmentBytes(att.id)?.bytes.equals(png('round'))).toBe(true)
      expect(readAttachmentDataUrl(att.id)).toMatch(/^data:image\/png;base64,/)
      expect(readAttachmentDataUrl('nope')).toBeNull()
    })

    it('reads from disk via stageImageFromPath', () => {
      const src = path.join(root, 'from-disk.png')
      fs.writeFileSync(src, png('disk'))

      const att = stageImageFromPath('c1', src)
      expect(att.name).toBe('from-disk.png')
      expect(readAttachmentBytes(att.id)?.bytes.equals(png('disk'))).toBe(true)
    })
  })

  describe('deleteAttachment', () => {
    it('keeps the file while another row references it', () => {
      const a = stageImage({ conversationId: 'c1', name: 'image.png', bytes: png('shared') })
      const b = stageImage({ conversationId: 'c1', name: 'image.png', bytes: png('shared') })

      expect(deleteAttachment(a.id)).toBe(true)
      expect(fs.existsSync(b.storagePath)).toBe(true)

      expect(deleteAttachment(b.id)).toBe(true)
      expect(fs.existsSync(b.storagePath)).toBe(false)
    })

    it('reports false for an unknown id', () => {
      expect(deleteAttachment('nope')).toBe(false)
    })
  })

  describe('sweepAttachments', () => {
    it('drops stale staged rows but keeps fresh and bound ones', () => {
      chatMessages.create({
        id: 'm1',
        conversationId: 'c1',
        role: 'user',
        content: 'hi',
        createdAt: 1,
        parentId: null
      })

      const stale = stageImage({ conversationId: 'c1', name: 'stale.png', bytes: png('stale') })
      const fresh = stageImage({ conversationId: 'c1', name: 'fresh.png', bytes: png('fresh') })
      const bound = stageImage({ conversationId: 'c1', name: 'bound.png', bytes: png('bound') })
      chatAttachments.bindToMessage([bound.id], 'm1')

      const dayLater = stale.createdAt + 25 * 60 * 60 * 1000
      const result = sweepAttachments(dayLater)

      expect(result.rows).toBe(2)
      expect(chatAttachments.get(stale.id)).toBeUndefined()
      expect(chatAttachments.get(fresh.id)).toBeUndefined()
      expect(chatAttachments.get(bound.id)).toBeDefined()
      expect(fs.existsSync(bound.storagePath)).toBe(true)
    })

    it('reclaims files no row references', () => {
      const orphan = path.join(attachDir, 'zz', 'orphan.png')
      fs.mkdirSync(path.dirname(orphan), { recursive: true })
      fs.writeFileSync(orphan, png('orphan'))

      const kept = stageImage({ conversationId: 'c1', name: 'kept.png', bytes: png('kept') })
      chatMessages.create({
        id: 'm2',
        conversationId: 'c1',
        role: 'user',
        content: 'hi',
        createdAt: 1,
        parentId: null
      })
      chatAttachments.bindToMessage([kept.id], 'm2')

      const result = sweepAttachments(kept.createdAt)

      expect(result.files).toBe(1)
      expect(fs.existsSync(orphan)).toBe(false)
      expect(fs.existsSync(kept.storagePath)).toBe(true)
    })
  })
})

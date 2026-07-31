import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AttachmentKind, MessageAttachment } from '../../shared/types'
import {
  MAX_IMAGE_EDGE,
  fitWithin,
  pessimisticImageTokens,
  type ImageDimensions
} from '../../shared/image-tokens'
import { chatAttachments } from '../db/chat-repos'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_REQUEST_ATTACHMENT_BYTES = 18 * 1024 * 1024
const THUMB_EDGE = 256
const STAGED_TTL_MS = 24 * 60 * 60 * 1000

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

const EXT_BY_IMAGE_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}

export const SUPPORTED_IMAGE_EXTENSIONS = Object.keys(IMAGE_MIME_BY_EXT)
export const SUPPORTED_IMAGE_MIMES = Object.keys(EXT_BY_IMAGE_MIME)

let attachmentDirOverride: string | null = null

/** Test-only: force the attachment directory instead of relying on Electron. */
export function _setAttachmentDirForTests(dir: string | null): void {
  attachmentDirOverride = dir
}

function baseDir(): string {
  if (attachmentDirOverride) return attachmentDirOverride
  try {
    // Lazy require so vitest can import this module without an Electron bootstrap.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron')
    if (app?.getPath) return path.join(app.getPath('userData'), 'attachments')
  } catch {
    // not in electron
  }
  return path.join(os.tmpdir(), 'golti-attachments')
}

export function getAttachmentDir(): string {
  const dir = baseDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function imageMimeForExtension(filePath: string): string | undefined {
  return IMAGE_MIME_BY_EXT[path.extname(filePath).toLowerCase()]
}

export function isSupportedImage(mimeOrPath: string): boolean {
  if (mimeOrPath.startsWith('image/')) return mimeOrPath in EXT_BY_IMAGE_MIME
  return imageMimeForExtension(mimeOrPath) !== undefined
}

/**
 * Resolve the on-disk location for a content hash. Sharded two levels deep so a
 * heavy user does not end up with one enormous directory.
 */
export function resolveStoragePath(hash: string, mimeType: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid attachment hash')
  const ext = EXT_BY_IMAGE_MIME[mimeType]
  if (!ext) throw new Error(`Unsupported attachment type: ${mimeType}`)
  const dir = getAttachmentDir()
  const filepath = path.join(dir, hash.slice(0, 2), `${hash}${ext}`)
  assertContained(filepath, dir)
  return filepath
}

export function assertContained(candidate: string, dir: string): string {
  const resolved = path.resolve(candidate)
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error('Invalid attachment path')
  }
  return resolved
}

/** Guards reads driven by a DB row against a path that escaped the store. */
export function assertInsideStore(candidate: string): string {
  return assertContained(candidate, getAttachmentDir())
}

function hashBytes(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function newId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

interface DecodedImage {
  bytes: Buffer
  mimeType: string
  dimensions?: ImageDimensions
  thumbnail?: Buffer
}

/**
 * Downscale and derive a thumbnail via Electron's bundled image decoder. Formats
 * `nativeImage` cannot decode (some webp/gif) fall through unmodified rather
 * than failing the attachment.
 */
function decodeImage(raw: Buffer, mimeType: string): DecodedImage {
  let nativeImage: typeof import('electron').nativeImage | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nativeImage = (require('electron') as typeof import('electron')).nativeImage
  } catch {
    return { bytes: raw, mimeType }
  }
  if (!nativeImage) return { bytes: raw, mimeType }

  try {
    const img = nativeImage.createFromBuffer(raw)
    if (img.isEmpty()) return { bytes: raw, mimeType }

    const size = img.getSize()
    const original = { width: size.width, height: size.height }
    const target = fitWithin(original, MAX_IMAGE_EDGE)

    let bytes = raw
    let outMime = mimeType
    let dimensions = original

    if (target.width !== original.width || target.height !== original.height) {
      const resized = img.resize({ width: target.width, height: target.height, quality: 'good' })
      bytes = mimeType === 'image/png' ? resized.toPNG() : resized.toJPEG(88)
      outMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      dimensions = target
    }

    const thumbTarget = fitWithin(dimensions, THUMB_EDGE)
    const thumbnail = img
      .resize({ width: thumbTarget.width, height: thumbTarget.height, quality: 'good' })
      .toJPEG(75)

    return { bytes, mimeType: outMime, dimensions, thumbnail }
  } catch {
    return { bytes: raw, mimeType }
  }
}

function writeIfMissing(filepath: string, bytes: Buffer): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, bytes)
}

export interface StageImageInput {
  conversationId: string
  name: string
  bytes: Buffer
  mimeType?: string
}

export function stageImage(input: StageImageInput): MessageAttachment {
  const mimeType =
    input.mimeType && input.mimeType in EXT_BY_IMAGE_MIME
      ? input.mimeType
      : imageMimeForExtension(input.name)

  if (!mimeType) {
    throw new Error(`Unsupported image type: ${input.mimeType || path.extname(input.name) || '?'}`)
  }
  if (input.bytes.length === 0) throw new Error('Empty image')
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))
    throw new Error(`Image exceeds ${mb}MB limit`)
  }

  const decoded = decodeImage(input.bytes, mimeType)
  const hash = hashBytes(decoded.bytes)
  const storagePath = resolveStoragePath(hash, decoded.mimeType)
  writeIfMissing(storagePath, decoded.bytes)

  let thumbPath: string | undefined
  if (decoded.thumbnail) {
    thumbPath = `${storagePath.slice(0, storagePath.lastIndexOf('.'))}.thumb.jpg`
    assertInsideStore(thumbPath)
    writeIfMissing(thumbPath, decoded.thumbnail)
  }

  const attachment: MessageAttachment = {
    id: newId(),
    conversationId: input.conversationId,
    messageId: null,
    kind: 'image' satisfies AttachmentKind,
    mimeType: decoded.mimeType,
    name: input.name || `image${EXT_BY_IMAGE_MIME[decoded.mimeType]}`,
    storagePath,
    thumbPath,
    byteSize: decoded.bytes.length,
    width: decoded.dimensions?.width,
    height: decoded.dimensions?.height,
    tokenEstimate: decoded.dimensions
      ? pessimisticImageTokens(decoded.dimensions)
      : pessimisticImageTokens({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE }),
    createdAt: Date.now()
  }

  chatAttachments.stage(attachment)
  return attachment
}

export function stageImageFromPath(conversationId: string, filePath: string): MessageAttachment {
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error('Not a file')
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))
    throw new Error(`Image exceeds ${mb}MB limit`)
  }
  return stageImage({
    conversationId,
    name: path.basename(filePath),
    bytes: fs.readFileSync(filePath),
    mimeType: imageMimeForExtension(filePath)
  })
}

export function readAttachmentBytes(id: string): { bytes: Buffer; mimeType: string } | null {
  const att = chatAttachments.get(id)
  if (!att) return null
  try {
    const resolved = assertInsideStore(att.storagePath)
    return { bytes: fs.readFileSync(resolved), mimeType: att.mimeType }
  } catch {
    return null
  }
}

function toDataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

export function readAttachmentDataUrl(id: string): string | null {
  const read = readAttachmentBytes(id)
  return read ? toDataUrl(read.bytes, read.mimeType) : null
}

export function readAttachmentThumbUrl(id: string): string | null {
  const att = chatAttachments.get(id)
  if (!att) return null
  const target = att.thumbPath || att.storagePath
  const mimeType = att.thumbPath ? 'image/jpeg' : att.mimeType
  try {
    return toDataUrl(fs.readFileSync(assertInsideStore(target)), mimeType)
  } catch {
    return null
  }
}

function unlinkQuiet(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

/** Delete a row, removing its files only when no other row still points at them. */
export function deleteAttachment(id: string): boolean {
  const att = chatAttachments.get(id)
  if (!att) return false
  chatAttachments.delete(id)

  if (chatAttachments.countByStoragePath(att.storagePath) === 0) {
    unlinkQuiet(att.storagePath)
    if (att.thumbPath) unlinkQuiet(att.thumbPath)
  }
  return true
}

function walkFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/**
 * Drop composer attachments the user never sent, then any file no row references.
 * Cascade deletes remove rows but not bytes, so this is the only thing reclaiming disk.
 */
export function sweepAttachments(now = Date.now()): { rows: number; files: number } {
  let rows = 0
  for (const stale of chatAttachments.listStaleStaged(now - STAGED_TTL_MS)) {
    if (deleteAttachment(stale.id)) rows++
  }

  const referenced = new Set(chatAttachments.listAllStoragePaths().map((p) => path.resolve(p)))
  let files = 0
  for (const file of walkFiles(getAttachmentDir())) {
    if (!referenced.has(path.resolve(file))) {
      unlinkQuiet(file)
      files++
    }
  }
  return { rows, files }
}

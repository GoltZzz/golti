import fs from 'fs'

export interface GgufModelInfo {
  architecture: string
  contextLength?: number
  blockCount?: number
  embeddingLength?: number
  headCount?: number
  headCountKv?: number
}

const GGUF_MAGIC = 0x46554747

const enum GgufType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12
}

const SCALAR_SIZES: Record<number, number> = {
  [GgufType.UINT8]: 1,
  [GgufType.INT8]: 1,
  [GgufType.UINT16]: 2,
  [GgufType.INT16]: 2,
  [GgufType.UINT32]: 4,
  [GgufType.INT32]: 4,
  [GgufType.FLOAT32]: 4,
  [GgufType.BOOL]: 1,
  [GgufType.UINT64]: 8,
  [GgufType.INT64]: 8,
  [GgufType.FLOAT64]: 8
}

const CHUNK_BYTES = 1024 * 1024
const MAX_READ_BYTES = 32 * 1024 * 1024

const SIZING_KEYS = [
  'context_length',
  'block_count',
  'embedding_length',
  'attention.head_count',
  'attention.head_count_kv'
]

class TruncatedError extends Error {}

class GgufReader {
  private buf: Buffer = Buffer.alloc(0)
  private filled = 0
  private pos = 0

  constructor(private fd: number) {}

  private ensure(bytes: number): void {
    const needed = this.pos + bytes
    if (needed <= this.filled) return
    if (needed > MAX_READ_BYTES) throw new TruncatedError('GGUF metadata exceeds read cap')

    const target = Math.min(MAX_READ_BYTES, Math.max(needed, this.filled + CHUNK_BYTES))
    if (target > this.buf.length) {
      const grown = Buffer.alloc(target)
      this.buf.copy(grown, 0, 0, this.filled)
      this.buf = grown
    }
    const read = fs.readSync(this.fd, this.buf, this.filled, target - this.filled, this.filled)
    this.filled += read
    if (needed > this.filled) throw new TruncatedError('Unexpected end of GGUF file')
  }

  skip(bytes: number): void {
    this.ensure(bytes)
    this.pos += bytes
  }

  u32(): number {
    this.ensure(4)
    const v = this.buf.readUInt32LE(this.pos)
    this.pos += 4
    return v
  }

  u64(): number {
    this.ensure(8)
    const v = this.buf.readBigUInt64LE(this.pos)
    this.pos += 8
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new TruncatedError('Implausible GGUF length')
    return Number(v)
  }

  string(): string {
    const len = this.u64()
    this.ensure(len)
    const s = this.buf.toString('utf8', this.pos, this.pos + len)
    this.pos += len
    return s
  }

  value(type: number): number | undefined {
    switch (type) {
      case GgufType.UINT8:
      case GgufType.INT8:
      case GgufType.UINT16:
      case GgufType.INT16:
      case GgufType.UINT32:
      case GgufType.INT32:
      case GgufType.UINT64:
      case GgufType.INT64: {
        const size = SCALAR_SIZES[type]
        this.ensure(size)
        const at = this.pos
        this.pos += size
        switch (type) {
          case GgufType.UINT8: return this.buf.readUInt8(at)
          case GgufType.INT8: return this.buf.readInt8(at)
          case GgufType.UINT16: return this.buf.readUInt16LE(at)
          case GgufType.INT16: return this.buf.readInt16LE(at)
          case GgufType.UINT32: return this.buf.readUInt32LE(at)
          case GgufType.INT32: return this.buf.readInt32LE(at)
          case GgufType.UINT64: return Number(this.buf.readBigUInt64LE(at))
          default: return Number(this.buf.readBigInt64LE(at))
        }
      }
      case GgufType.BOOL:
      case GgufType.FLOAT32:
      case GgufType.FLOAT64:
        this.skip(SCALAR_SIZES[type])
        return undefined
      case GgufType.STRING:
        this.string()
        return undefined
      case GgufType.ARRAY: {
        const itemType = this.u32()
        const count = this.u64()
        if (itemType === GgufType.STRING) {
          for (let i = 0; i < count; i++) this.string()
        } else if (itemType === GgufType.ARRAY) {
          for (let i = 0; i < count; i++) this.value(itemType)
        } else {
          const size = SCALAR_SIZES[itemType]
          if (size === undefined) throw new TruncatedError(`Unknown GGUF array type ${itemType}`)
          this.skip(size * count)
        }
        return undefined
      }
      default:
        throw new TruncatedError(`Unknown GGUF value type ${type}`)
    }
  }

  /** Like `value`, but also yields BOOL and STRING, which `value` deliberately skips. */
  anyValue(type: number): number | string | boolean | undefined {
    if (type === GgufType.BOOL) {
      this.ensure(1)
      const v = this.buf.readUInt8(this.pos) !== 0
      this.pos += 1
      return v
    }
    if (type === GgufType.STRING) return this.string()
    if (type === GgufType.FLOAT32) {
      this.ensure(4)
      const v = this.buf.readFloatLE(this.pos)
      this.pos += 4
      return v
    }
    if (type === GgufType.FLOAT64) {
      this.ensure(8)
      const v = this.buf.readDoubleLE(this.pos)
      this.pos += 8
      return v
    }
    return this.value(type)
  }
}

export interface GgufVisionInfo {
  architecture: string
  isProjector: boolean
  hasVisionEncoder: boolean
  hasAudioEncoder: boolean
  projectorType?: string
  imageSize?: number
  patchSize?: number
}

const VISION_KEYS = new Set([
  'clip.has_vision_encoder',
  'clip.has_audio_encoder',
  'clip.projector_type',
  'clip.vision.image_size',
  'clip.vision.patch_size'
])

/**
 * Identify a multimodal projector ("mmproj") file. Kept separate from
 * `readGgufModelInfo` because it must read BOOL/STRING values and scan past
 * `tokenizer.*` keys, both of which that reader intentionally skips.
 */
export function readGgufVisionInfo(modelPath: string): GgufVisionInfo | null {
  let fd: number
  try {
    fd = fs.openSync(modelPath, 'r')
  } catch {
    return null
  }

  try {
    const reader = new GgufReader(fd)
    if (reader.u32() !== GGUF_MAGIC) return null
    const version = reader.u32()
    if (version < 2) return null

    reader.u64()
    const kvCount = reader.u64()

    let architecture: string | undefined
    const found = new Map<string, number | string | boolean>()

    try {
      for (let i = 0; i < kvCount; i++) {
        const key = reader.string()
        const type = reader.u32()

        if (key === 'general.architecture' && type === GgufType.STRING) {
          architecture = reader.string()
          continue
        }

        if (VISION_KEYS.has(key)) {
          const value = reader.anyValue(type)
          if (value !== undefined) found.set(key, value)
        } else {
          reader.value(type)
        }

        if (architecture && found.size === VISION_KEYS.size) break
      }
    } catch {
      if (!architecture) return null
    }

    if (!architecture) return null

    const num = (key: string): number | undefined => {
      const v = found.get(key)
      return typeof v === 'number' && v > 0 ? v : undefined
    }
    const str = (key: string): string | undefined => {
      const v = found.get(key)
      return typeof v === 'string' && v ? v : undefined
    }

    const hasVisionEncoder = found.get('clip.has_vision_encoder') === true
    const hasAudioEncoder = found.get('clip.has_audio_encoder') === true

    return {
      architecture,
      isProjector: architecture === 'clip',
      hasVisionEncoder,
      hasAudioEncoder,
      projectorType: str('clip.projector_type'),
      imageSize: num('clip.vision.image_size'),
      patchSize: num('clip.vision.patch_size')
    }
  } catch {
    return null
  } finally {
    try { fs.closeSync(fd) } catch {}
  }
}

interface VisionCacheEntry {
  mtimeMs: number
  info: GgufVisionInfo | null
}

const visionCache = new Map<string, VisionCacheEntry>()

export function clearGgufVisionCache(): void {
  visionCache.clear()
}

/** mtime-keyed cache so repeated capability checks do not re-read GGUF headers. */
export function visionInfoFor(filepath: string): GgufVisionInfo | null {
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(filepath).mtimeMs
  } catch {
    return null
  }

  const hit = visionCache.get(filepath)
  if (hit && hit.mtimeMs === mtimeMs) return hit.info

  const info = readGgufVisionInfo(filepath)
  visionCache.set(filepath, { mtimeMs, info })
  return info
}

export function isProjectorFile(filepath: string): boolean {
  return visionInfoFor(filepath)?.isProjector === true
}

export function readGgufModelInfo(modelPath: string): GgufModelInfo | null {
  let fd: number
  try {
    fd = fs.openSync(modelPath, 'r')
  } catch {
    return null
  }

  try {
    const reader = new GgufReader(fd)
    if (reader.u32() !== GGUF_MAGIC) return null
    const version = reader.u32()
    if (version < 2) return null

    reader.u64()
    const kvCount = reader.u64()

    let architecture: string | undefined
    const wanted = new Map<string, number>()

    const complete = (): boolean =>
      !!architecture &&
      SIZING_KEYS.every((suffix) => wanted.has(`${architecture}.${suffix}`))

    try {
      for (let i = 0; i < kvCount; i++) {
        const key = reader.string()
        if (architecture && key.startsWith('tokenizer.')) break
        const type = reader.u32()

        if (key === 'general.architecture' && type === GgufType.STRING) {
          architecture = reader.string()
        } else {
          const value = reader.value(type)
          if (value !== undefined) wanted.set(key, value)
        }

        if (complete()) break
      }
    } catch {
      if (!architecture) return null
    }

    if (!architecture) return null
    const get = (suffix: string): number | undefined => {
      const v = wanted.get(`${architecture}.${suffix}`)
      return typeof v === 'number' && v > 0 ? v : undefined
    }

    return {
      architecture,
      contextLength: get('context_length'),
      blockCount: get('block_count'),
      embeddingLength: get('embedding_length'),
      headCount: get('attention.head_count'),
      headCountKv: get('attention.head_count_kv')
    }
  } catch {
    return null
  } finally {
    try { fs.closeSync(fd) } catch {}
  }
}

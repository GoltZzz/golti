import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readGgufModelInfo, readGgufVisionInfo } from './gguf'

const GGUF_MAGIC = 0x46554747

const T = {
  UINT32: 4,
  FLOAT32: 6,
  BOOL: 7,
  STRING: 8,
  ARRAY: 9
} as const

type Kv = [key: string, type: number, value: unknown]

function gstring(s: string): Buffer {
  const body = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(8)
  len.writeBigUInt64LE(BigInt(body.length))
  return Buffer.concat([len, body])
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}

function u64(n: number): Buffer {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt(n))
  return b
}

function encodeValue(type: number, value: unknown): Buffer {
  switch (type) {
    case T.UINT32:
      return u32(value as number)
    case T.BOOL:
      return Buffer.from([value ? 1 : 0])
    case T.STRING:
      return gstring(value as string)
    case T.FLOAT32: {
      const b = Buffer.alloc(4)
      b.writeFloatLE(value as number)
      return b
    }
    case T.ARRAY: {
      const items = value as string[]
      return Buffer.concat([u32(T.STRING), u64(items.length), ...items.map(gstring)])
    }
    default:
      throw new Error(`unsupported test type ${type}`)
  }
}

function buildGguf(kvs: Kv[], version = 3): Buffer {
  const header = Buffer.concat([u32(GGUF_MAGIC), u32(version), u64(0), u64(kvs.length)])
  const body = kvs.map(([key, type, value]) =>
    Buffer.concat([gstring(key), u32(type), encodeValue(type, value)])
  )
  return Buffer.concat([header, ...body])
}

describe('readGgufVisionInfo', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-gguf-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, buf: Buffer): string => {
    const p = path.join(dir, name)
    fs.writeFileSync(p, buf)
    return p
  }

  it('identifies a vision projector and reads its BOOL and STRING metadata', () => {
    const file = write(
      'mmproj.gguf',
      buildGguf([
        ['general.architecture', T.STRING, 'clip'],
        ['clip.has_vision_encoder', T.BOOL, true],
        ['clip.has_audio_encoder', T.BOOL, false],
        ['clip.projector_type', T.STRING, 'gemma3'],
        ['clip.vision.image_size', T.UINT32, 896],
        ['clip.vision.patch_size', T.UINT32, 14]
      ])
    )

    expect(readGgufVisionInfo(file)).toEqual({
      architecture: 'clip',
      isProjector: true,
      hasVisionEncoder: true,
      hasAudioEncoder: false,
      projectorType: 'gemma3',
      imageSize: 896,
      patchSize: 14
    })
  })

  it('reads clip keys that appear after tokenizer keys', () => {
    const file = write(
      'late-clip.gguf',
      buildGguf([
        ['general.architecture', T.STRING, 'clip'],
        ['tokenizer.ggml.model', T.STRING, 'llama'],
        ['tokenizer.ggml.tokens', T.ARRAY, ['a', 'b', 'c']],
        ['clip.has_vision_encoder', T.BOOL, true],
        ['clip.projector_type', T.STRING, 'qwen2vl_merger']
      ])
    )

    const info = readGgufVisionInfo(file)
    expect(info?.hasVisionEncoder).toBe(true)
    expect(info?.projectorType).toBe('qwen2vl_merger')
  })

  it('reads clip keys that appear before the architecture key', () => {
    const file = write(
      'reordered.gguf',
      buildGguf([
        ['clip.has_vision_encoder', T.BOOL, true],
        ['clip.vision.patch_size', T.UINT32, 14],
        ['general.architecture', T.STRING, 'clip']
      ])
    )

    const info = readGgufVisionInfo(file)
    expect(info?.isProjector).toBe(true)
    expect(info?.hasVisionEncoder).toBe(true)
    expect(info?.patchSize).toBe(14)
  })

  it('reports a plain language model as not a projector', () => {
    const file = write(
      'model.gguf',
      buildGguf([
        ['general.architecture', T.STRING, 'llama'],
        ['llama.block_count', T.UINT32, 32],
        ['llama.context_length', T.UINT32, 8192]
      ])
    )

    const info = readGgufVisionInfo(file)
    expect(info?.architecture).toBe('llama')
    expect(info?.isProjector).toBe(false)
    expect(info?.hasVisionEncoder).toBe(false)
    expect(info?.projectorType).toBeUndefined()
  })

  it('treats a false vision encoder flag as false, not missing', () => {
    const file = write(
      'audio-only.gguf',
      buildGguf([
        ['general.architecture', T.STRING, 'clip'],
        ['clip.has_vision_encoder', T.BOOL, false],
        ['clip.has_audio_encoder', T.BOOL, true]
      ])
    )

    const info = readGgufVisionInfo(file)
    expect(info?.isProjector).toBe(true)
    expect(info?.hasVisionEncoder).toBe(false)
    expect(info?.hasAudioEncoder).toBe(true)
  })

  it('ignores zero-valued dimensions', () => {
    const file = write(
      'zero.gguf',
      buildGguf([
        ['general.architecture', T.STRING, 'clip'],
        ['clip.vision.image_size', T.UINT32, 0]
      ])
    )
    expect(readGgufVisionInfo(file)?.imageSize).toBeUndefined()
  })

  it('returns null for a missing file, a non-GGUF file, and an old version', () => {
    expect(readGgufVisionInfo(path.join(dir, 'nope.gguf'))).toBeNull()
    expect(readGgufVisionInfo(write('junk.gguf', Buffer.from('not a gguf file at all')))).toBeNull()
    expect(
      readGgufVisionInfo(
        write('v1.gguf', buildGguf([['general.architecture', T.STRING, 'clip']], 1))
      )
    ).toBeNull()
  })

  it('survives a file truncated mid-metadata', () => {
    const full = buildGguf([
      ['general.architecture', T.STRING, 'clip'],
      ['clip.has_vision_encoder', T.BOOL, true],
      ['clip.projector_type', T.STRING, 'gemma3']
    ])
    const info = readGgufVisionInfo(write('cut.gguf', full.subarray(0, full.length - 6)))
    expect(info?.architecture).toBe('clip')
  })
})

describe('readGgufModelInfo is unaffected', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-gguf2-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('still reads sizing keys from a language model', () => {
    const p = path.join(dir, 'model.gguf')
    fs.writeFileSync(
      p,
      buildGguf([
        ['general.architecture', T.STRING, 'llama'],
        ['llama.context_length', T.UINT32, 8192],
        ['llama.block_count', T.UINT32, 32],
        ['llama.embedding_length', T.UINT32, 4096],
        ['llama.attention.head_count', T.UINT32, 32],
        ['llama.attention.head_count_kv', T.UINT32, 8]
      ])
    )

    expect(readGgufModelInfo(p)).toEqual({
      architecture: 'llama',
      contextLength: 8192,
      blockCount: 32,
      embeddingLength: 4096,
      headCount: 32,
      headCountKv: 8
    })
  })
})

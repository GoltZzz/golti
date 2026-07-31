import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _setModelDirForTests, listLocalModels } from './model-downloader'
import { clearGgufVisionCache } from './gguf'
import {
  clearProjectorCache,
  forgetProjector,
  projectorMetadataFor,
  recordProjector,
  resolveProjectorFor,
  supportsVision
} from './projector'

const GGUF_MAGIC = 0x46554747
const T = { UINT32: 4, BOOL: 7, STRING: 8 } as const

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

function buildGguf(kvs: Array<[string, number, unknown]>): Buffer {
  const header = Buffer.concat([u32(GGUF_MAGIC), u32(3), u64(0), u64(kvs.length)])
  const body = kvs.map(([key, type, value]) => {
    const encoded =
      type === T.STRING
        ? gstring(value as string)
        : type === T.BOOL
          ? Buffer.from([value ? 1 : 0])
          : u32(value as number)
    return Buffer.concat([gstring(key), u32(type), encoded])
  })
  return Buffer.concat([header, ...body])
}

const VISION_PROJECTOR = buildGguf([
  ['general.architecture', T.STRING, 'clip'],
  ['clip.has_vision_encoder', T.BOOL, true],
  ['clip.projector_type', T.STRING, 'gemma3'],
  ['clip.vision.image_size', T.UINT32, 896],
  ['clip.vision.patch_size', T.UINT32, 14]
])

const AUDIO_PROJECTOR = buildGguf([
  ['general.architecture', T.STRING, 'clip'],
  ['clip.has_vision_encoder', T.BOOL, false],
  ['clip.has_audio_encoder', T.BOOL, true]
])

const LANGUAGE_MODEL = buildGguf([
  ['general.architecture', T.STRING, 'llama'],
  ['llama.block_count', T.UINT32, 32]
])

describe('projector pairing', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-proj-'))
    _setModelDirForTests(dir)
    clearGgufVisionCache()
    clearProjectorCache()
  })

  afterEach(() => {
    _setModelDirForTests(null)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, buf: Buffer): string => {
    const p = path.join(dir, name)
    fs.writeFileSync(p, buf)
    return p
  }

  it('resolves a recorded projector', () => {
    const model = write('gemma-3-4b.gguf', LANGUAGE_MODEL)
    write('mmproj-gemma3.gguf', VISION_PROJECTOR)
    recordProjector('gemma-3-4b.gguf', 'mmproj-gemma3.gguf')

    expect(resolveProjectorFor(model)).toBe(path.join(dir, 'mmproj-gemma3.gguf'))
    expect(supportsVision(model)).toBe(true)
  })

  it('exposes projector metadata for token sizing', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    write('mmproj.gguf', VISION_PROJECTOR)
    recordProjector('m.gguf', 'mmproj.gguf')

    const info = projectorMetadataFor(model)
    expect(info?.imageSize).toBe(896)
    expect(info?.patchSize).toBe(14)
    expect(info?.projectorType).toBe('gemma3')
  })

  it('returns undefined when nothing is recorded', () => {
    const model = write('plain.gguf', LANGUAGE_MODEL)
    expect(resolveProjectorFor(model)).toBeUndefined()
    expect(supportsVision(model)).toBe(false)
  })

  it('returns undefined when the recorded file is gone', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    recordProjector('m.gguf', 'missing-mmproj.gguf')
    expect(resolveProjectorFor(model)).toBeUndefined()
  })

  it('rejects a recorded file that is not actually a projector', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    write('not-a-projector.gguf', LANGUAGE_MODEL)
    recordProjector('m.gguf', 'not-a-projector.gguf')

    expect(resolveProjectorFor(model)).toBeUndefined()
  })

  it('rejects a mapping that tries to escape the models directory', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    const outside = path.join(dir, '..', 'evil.gguf')
    fs.writeFileSync(outside, VISION_PROJECTOR)
    try {
      fs.writeFileSync(
        path.join(dir, '.projectors.json'),
        JSON.stringify({ 'm.gguf': '../evil.gguf' })
      )
      expect(resolveProjectorFor(model)).toBeUndefined()
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })

  it('reports an audio-only projector as not vision capable', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    write('mmproj-audio.gguf', AUDIO_PROJECTOR)
    recordProjector('m.gguf', 'mmproj-audio.gguf')

    expect(resolveProjectorFor(model)).toBe(path.join(dir, 'mmproj-audio.gguf'))
    expect(supportsVision(model)).toBe(false)
  })

  it('forgets a mapping', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    write('mmproj.gguf', VISION_PROJECTOR)
    recordProjector('m.gguf', 'mmproj.gguf')
    forgetProjector('m.gguf')

    expect(resolveProjectorFor(model)).toBeUndefined()
  })

  it('survives a corrupt sidecar file', () => {
    const model = write('m.gguf', LANGUAGE_MODEL)
    fs.writeFileSync(path.join(dir, '.projectors.json'), '{not json')
    expect(resolveProjectorFor(model)).toBeUndefined()
  })
})

describe('listLocalModels', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golti-list-'))
    _setModelDirForTests(dir)
    clearGgufVisionCache()
  })

  afterEach(() => {
    _setModelDirForTests(null)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('hides projectors so they cannot be selected as chat models', () => {
    fs.writeFileSync(path.join(dir, 'gemma-3-4b.gguf'), LANGUAGE_MODEL)
    fs.writeFileSync(path.join(dir, 'mmproj-gemma3.gguf'), VISION_PROJECTOR)

    expect(listLocalModels().map((m) => m.filename)).toEqual(['gemma-3-4b.gguf'])
  })

  it('can include projectors when explicitly asked', () => {
    fs.writeFileSync(path.join(dir, 'gemma-3-4b.gguf'), LANGUAGE_MODEL)
    fs.writeFileSync(path.join(dir, 'mmproj-gemma3.gguf'), VISION_PROJECTOR)

    expect(listLocalModels(true).map((m) => m.filename).sort()).toEqual([
      'gemma-3-4b.gguf',
      'mmproj-gemma3.gguf'
    ])
  })
})

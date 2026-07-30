import fs from 'fs'
import path from 'path'
import { getModelDir } from './model-downloader'
import {
  clearGgufVisionCache,
  isProjectorFile,
  visionInfoFor,
  type GgufVisionInfo
} from './gguf'

const SIDECAR = '.projectors.json'

type ProjectorMap = Record<string, string>

export function clearProjectorCache(): void {
  clearGgufVisionCache()
}

function sidecarPath(): string {
  return path.join(getModelDir(), SIDECAR)
}

function readMap(): ProjectorMap {
  try {
    const raw = fs.readFileSync(sidecarPath(), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as ProjectorMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: ProjectorMap): void {
  const p = sidecarPath()
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf8')
  fs.renameSync(tmp, p)
}

/**
 * Pairing is an explicit sidecar map rather than filename matching, so renaming
 * a model in the models folder does not silently disable its vision tower.
 */
export function recordProjector(modelFilename: string, mmprojFilename: string): void {
  const map = readMap()
  map[path.basename(modelFilename)] = path.basename(mmprojFilename)
  writeMap(map)
}

export function forgetProjector(modelFilename: string): void {
  const map = readMap()
  if (delete map[path.basename(modelFilename)]) writeMap(map)
}

export function resolveProjectorFor(modelPath: string): string | undefined {
  const mapped = readMap()[path.basename(modelPath)]
  if (!mapped) return undefined

  const base = path.basename(mapped)
  if (base !== mapped) return undefined

  const dir = getModelDir()
  const candidate = path.join(dir, base)
  if (!path.resolve(candidate).startsWith(path.resolve(dir) + path.sep)) return undefined
  if (!fs.existsSync(candidate)) return undefined
  if (!isProjectorFile(candidate)) return undefined

  return candidate
}

export function projectorMetadataFor(modelPath: string): GgufVisionInfo | null {
  const projector = resolveProjectorFor(modelPath)
  return projector ? visionInfoFor(projector) : null
}

export function supportsVision(modelPath: string): boolean {
  const info = projectorMetadataFor(modelPath)
  return info !== null && info.hasVisionEncoder
}

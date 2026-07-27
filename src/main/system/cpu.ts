import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { CpuCounts } from '../../shared/engine-tuning'

const execFileAsync = promisify(execFile)

let cached: CpuCounts | null = null

async function sysctl(key: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync('sysctl', ['-n', key], { timeout: 2000 })
    const value = parseInt(stdout.trim(), 10)
    return Number.isFinite(value) && value > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function readLinuxPhysicalCores(): number | undefined {
  try {
    const text = fs.readFileSync('/proc/cpuinfo', 'utf8')
    const cores = new Set<string>()
    let packageId = '0'
    for (const line of text.split('\n')) {
      const [rawKey, rawValue] = line.split(':')
      if (!rawValue) continue
      const key = rawKey.trim()
      const value = rawValue.trim()
      if (key === 'physical id') packageId = value
      else if (key === 'core id') cores.add(`${packageId}:${value}`)
    }
    return cores.size > 0 ? cores.size : undefined
  } catch {
    return undefined
  }
}

export async function detectCpuCounts(force = false): Promise<CpuCounts> {
  if (cached && !force) return cached

  const logicalCores = os.availableParallelism?.() ?? os.cpus().length ?? 1
  let physicalCores: number | undefined
  let performanceCores: number | undefined

  if (process.platform === 'darwin') {
    performanceCores = await sysctl('hw.perflevel0.physicalcpu')
    physicalCores = await sysctl('hw.physicalcpu')
  } else if (process.platform === 'linux') {
    physicalCores = readLinuxPhysicalCores()
  }

  cached = { logicalCores, physicalCores, performanceCores }
  return cached
}

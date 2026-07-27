import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Calculates true available physical memory (in bytes).
 * On macOS and Linux, standard os.freemem() only accounts for strictly unallocated pages,
 * ignoring reclaimable inactive/speculative/purgeable cache pages. This function reads OS memory
 * statistics to include reclaimable cache in available RAM.
 */
export async function getAvailableMemoryBytes(): Promise<number> {
  const platform = os.platform()
  const fallback = os.freemem()

  if (platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('vm_stat')
      let pageSize = 4096
      const pageSizeMatch = stdout.match(/page size of (\d+) bytes/)
      if (pageSizeMatch) {
        pageSize = parseInt(pageSizeMatch[1], 10)
      }

      const getValue = (key: string): number => {
        const match = stdout.match(new RegExp(`${key}:\\s*(\\d+)`))
        return match ? parseInt(match[1], 10) : 0
      }

      const freePages = getValue('Pages free')
      const inactivePages = getValue('Pages inactive')
      const speculativePages = getValue('Pages speculative')
      const purgeablePages = getValue('Pages purgeable')

      const availablePages = freePages + inactivePages + speculativePages + purgeablePages
      const availableBytes = availablePages * pageSize

      if (availableBytes > 0 && availableBytes <= os.totalmem()) {
        return availableBytes
      }
    } catch {
      // Ignore error and fall back
    }
  } else if (platform === 'linux') {
    try {
      const meminfo = await fs.promises.readFile('/proc/meminfo', 'utf8')
      const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)
      if (match) {
        const availableBytes = parseInt(match[1], 10) * 1024
        if (availableBytes > 0 && availableBytes <= os.totalmem()) {
          return availableBytes
        }
      }
    } catch {
      // Ignore error and fall back
    }
  }

  return fallback
}

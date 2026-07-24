import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'none'

export interface GpuInfo {
  vendor: GpuVendor
  /** Total dedicated VRAM in GB, or null when unknown (e.g. Apple unified memory, CPU-only). */
  vramGB: number | null
  name: string
}

let cached: GpuInfo | null = null

/**
 * Lightweight GPU probe used to pick an engine backend and size GPU offload.
 *
 * Deliberately separate from the heavier `getFullSystemInfo()` in the main
 * process: that one also runs disk benchmarks and is UI-facing, whereas this
 * one is called on the hot path of starting the engine and is cached.
 */
export async function detectGpu(force = false): Promise<GpuInfo> {
  if (cached && !force) return cached

  const platform = process.platform
  let info: GpuInfo = { vendor: 'none', vramGB: null, name: 'Unknown GPU' }

  if (platform === 'darwin') {
    // Apple Silicon uses unified memory; Metal is baked into the standard build.
    info = { vendor: 'apple', vramGB: null, name: 'Apple GPU' }
    cached = info
    return info
  }

  // NVIDIA — the most common discrete GPU on Windows/Linux.
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits'
    )
    // Hybrid laptops list several GPUs; the first is the discrete one.
    const [name, memStr] = stdout.trim().split('\n')[0].split(',')
    return (cached = {
      vendor: 'nvidia',
      name: name.trim(),
      vramGB: Math.round((parseInt(memStr.trim(), 10) / 1024) * 10) / 10
    })
  } catch {}

  // AMD via ROCm (Linux mostly).
  try {
    const { stdout } = await execAsync('rocm-smi --showproductname --showmeminfo vram --csv')
    const vramBytes = stdout.match(/(\d{7,})/)?.[1]
    const cardName = stdout.match(/Card series[^,]*,\s*([^\n,]+)/i)?.[1]
    if (vramBytes) {
      return (cached = {
        vendor: 'amd',
        name: cardName?.trim() || 'AMD GPU',
        vramGB: Math.round((parseInt(vramBytes, 10) / (1024 * 1024 * 1024)) * 10) / 10
      })
    }
  } catch {}

  // Last resort on Linux: read the PCI list so we at least know a vendor and can
  // still choose the Vulkan backend even without a vendor-specific CLI installed.
  if (platform === 'linux') {
    try {
      const { stdout } = await execAsync('lspci -mm')
      const line = stdout
        .split('\n')
        .find((l) => /"(VGA compatible controller|3D controller|Display controller)"/.test(l))
      if (line) {
        const fields = line.match(/"([^"]*)"/g)?.map((f) => f.slice(1, -1)) || []
        const vendorStr = (fields[1] || '').toLowerCase()
        const name = fields.length >= 4 ? `${fields[2]} ${fields[3]}`.trim() : 'Generic GPU'
        let vendor: GpuVendor = 'none'
        if (/nvidia/.test(vendorStr)) vendor = 'nvidia'
        else if (/amd|advanced micro|ati/.test(vendorStr)) vendor = 'amd'
        else if (/intel/.test(vendorStr)) vendor = 'intel'
        if (vendor !== 'none') info = { vendor, vramGB: null, name }
      }
    } catch {}
  }

  cached = info
  return info
}

/** Testing/backend-switch hook: clears the cached probe result. */
export function resetGpuCache(): void {
  cached = null
}

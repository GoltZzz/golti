import { exec } from 'child_process'
import { promisify } from 'util'
import { detectGpu, type GpuInfo } from '../engine/gpu-detect'

const execAsync = promisify(exec)

/**
 * Ollama is a daemon with its own scheduler, so unlike the Golti engine it takes
 * no `--device` / `--n-gpu-layers` flags. The only way to steer it at startup is
 * the vendor visibility environment variables it inherits from `ollama serve`.
 */
export interface OllamaGpuDevice {
  /** Vendor device index, as accepted by CUDA_VISIBLE_DEVICES / HIP_VISIBLE_DEVICES. */
  id: string
  name: string
  /** Total VRAM in MiB, or null when the vendor tool did not report it. */
  totalMiB: number | null
}

/**
 * Environment for `ollama serve` implementing an `ollamaDevice` choice:
 *   'auto'  → nothing set; Ollama's own scheduler picks
 *   'cpu'   → every vendor's device list emptied, forcing CPU inference
 *   '<idx>' → that index made the only visible device for the detected vendor
 */
export function buildOllamaGpuEnv(
  choice: string | undefined,
  gpu: Pick<GpuInfo, 'vendor'>
): Record<string, string> {
  const selection = choice || 'auto'

  if (selection === 'cpu') {
    // Set all three: we cannot be sure which runtime the installed build uses,
    // and an empty list is the documented "no devices" value for each.
    return {
      CUDA_VISIBLE_DEVICES: '',
      HIP_VISIBLE_DEVICES: '',
      ROCR_VISIBLE_DEVICES: ''
    }
  }

  if (selection === 'auto') return {}

  switch (gpu.vendor) {
    case 'nvidia':
      return { CUDA_VISIBLE_DEVICES: selection }
    case 'amd':
      // ROCR_VISIBLE_DEVICES filters at the runtime level and HIP_VISIBLE_DEVICES
      // at the HIP level; ROCm applies them in that order, so set both to agree.
      return { HIP_VISIBLE_DEVICES: selection, ROCR_VISIBLE_DEVICES: selection }
    default:
      // Apple unified memory and Intel have no per-device selector worth setting.
      return {}
  }
}

/** Parses `nvidia-smi --query-gpu=index,name,memory.total` CSV rows. */
function parseNvidiaDevices(stdout: string): OllamaGpuDevice[] {
  const devices: OllamaGpuDevice[] = []
  for (const line of stdout.trim().split('\n')) {
    const [index, name, mem] = line.split(',').map((f) => f.trim())
    if (!index || !name) continue
    const totalMiB = Number.parseInt(mem, 10)
    devices.push({ id: index, name, totalMiB: Number.isFinite(totalMiB) ? totalMiB : null })
  }
  return devices
}

/** Parses `rocm-smi --showproductname --csv`, whose rows are keyed `card0`, `card1`, … */
function parseRocmDevices(stdout: string): OllamaGpuDevice[] {
  const devices: OllamaGpuDevice[] = []
  for (const line of stdout.trim().split('\n')) {
    const match = line.match(/^card(\d+)\s*,\s*(.+)$/)
    if (!match) continue
    const name = match[2].split(',')[0].trim()
    if (!name) continue
    devices.push({ id: match[1], name, totalMiB: null })
  }
  return devices
}

/**
 * Lists selectable GPUs for the settings dropdown. Indices here are vendor
 * indices, which is exactly what the visibility variables above expect.
 */
export async function listOllamaGpuDevices(): Promise<OllamaGpuDevice[]> {
  const gpu = await detectGpu()

  if (gpu.vendor === 'nvidia') {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits'
      )
      const devices = parseNvidiaDevices(stdout)
      if (devices.length > 0) return devices
    } catch {}
  }

  if (gpu.vendor === 'amd') {
    try {
      const { stdout } = await execAsync('rocm-smi --showproductname --csv')
      const devices = parseRocmDevices(stdout)
      if (devices.length > 0) return devices
    } catch {}
  }

  // The vendor CLI is missing or this is Apple/Intel/CPU-only: offer the single
  // probed GPU at index 0 rather than an empty list, so the choice still exists.
  if (gpu.vendor !== 'none') {
    return [{ id: '0', name: gpu.name, totalMiB: gpu.vramGB ? Math.round(gpu.vramGB * 1024) : null }]
  }
  return []
}

export { parseNvidiaDevices, parseRocmDevices }

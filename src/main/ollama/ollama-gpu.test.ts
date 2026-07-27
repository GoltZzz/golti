import { describe, expect, it } from 'vitest'
import { buildOllamaGpuEnv, parseNvidiaDevices, parseRocmDevices } from './ollama-gpu'

describe('buildOllamaGpuEnv', () => {
  it('leaves the environment alone on auto, so Ollama schedules for itself', () => {
    expect(buildOllamaGpuEnv('auto', { vendor: 'nvidia' })).toEqual({})
    expect(buildOllamaGpuEnv(undefined, { vendor: 'amd' })).toEqual({})
  })

  it('empties every vendor device list for a CPU-only run', () => {
    const env = buildOllamaGpuEnv('cpu', { vendor: 'nvidia' })
    expect(env).toEqual({
      CUDA_VISIBLE_DEVICES: '',
      HIP_VISIBLE_DEVICES: '',
      ROCR_VISIBLE_DEVICES: ''
    })
  })

  it('forces CPU regardless of the detected vendor', () => {
    for (const vendor of ['nvidia', 'amd', 'intel', 'apple', 'none'] as const) {
      expect(buildOllamaGpuEnv('cpu', { vendor }).CUDA_VISIBLE_DEVICES).toBe('')
    }
  })

  it('pins an NVIDIA device by CUDA index', () => {
    expect(buildOllamaGpuEnv('1', { vendor: 'nvidia' })).toEqual({ CUDA_VISIBLE_DEVICES: '1' })
  })

  it('pins an AMD device at both the HIP and ROCr layers', () => {
    expect(buildOllamaGpuEnv('0', { vendor: 'amd' })).toEqual({
      HIP_VISIBLE_DEVICES: '0',
      ROCR_VISIBLE_DEVICES: '0'
    })
  })

  it('sets nothing for vendors without a device selector', () => {
    expect(buildOllamaGpuEnv('0', { vendor: 'apple' })).toEqual({})
    expect(buildOllamaGpuEnv('0', { vendor: 'intel' })).toEqual({})
    expect(buildOllamaGpuEnv('0', { vendor: 'none' })).toEqual({})
  })
})

describe('device listing parsers', () => {
  it('reads every GPU out of nvidia-smi CSV output', () => {
    const devices = parseNvidiaDevices(
      '0, NVIDIA GeForce RTX 4070, 12282\n1, NVIDIA GeForce GTX 1060, 6144\n'
    )
    expect(devices).toEqual([
      { id: '0', name: 'NVIDIA GeForce RTX 4070', totalMiB: 12282 },
      { id: '1', name: 'NVIDIA GeForce GTX 1060', totalMiB: 6144 }
    ])
  })

  it('tolerates a missing memory column', () => {
    expect(parseNvidiaDevices('0, NVIDIA T400, [N/A]')).toEqual([
      { id: '0', name: 'NVIDIA T400', totalMiB: null }
    ])
  })

  it('reads card rows out of rocm-smi CSV output', () => {
    const devices = parseRocmDevices('device,Card series\ncard0,Radeon RX 7900 XTX\ncard1,Radeon RX 6800')
    expect(devices).toEqual([
      { id: '0', name: 'Radeon RX 7900 XTX', totalMiB: null },
      { id: '1', name: 'Radeon RX 6800', totalMiB: null }
    ])
  })

  it('returns nothing when the vendor tool printed no devices', () => {
    expect(parseNvidiaDevices('')).toEqual([])
    expect(parseRocmDevices('device,Card series')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { parseNvidiaSmiVram, parseRocmSmiVram, pickPrimaryVram } from './vram'

describe('parseNvidiaSmiVram', () => {
  it('reads total, used and free for each GPU', () => {
    const readings = parseNvidiaSmiVram(
      '0, NVIDIA GeForce GTX 1650, 4096, 403, 3693\n1, NVIDIA RTX 4090, 24564, 1024, 23540\n'
    )
    expect(readings).toEqual([
      { index: '0', name: 'NVIDIA GeForce GTX 1650', totalMiB: 4096, usedMiB: 403, freeMiB: 3693 },
      { index: '1', name: 'NVIDIA RTX 4090', totalMiB: 24564, usedMiB: 1024, freeMiB: 23540 }
    ])
  })

  it('derives free from total minus used when the driver omits it', () => {
    const [reading] = parseNvidiaSmiVram('0, Test GPU, 8192, 2048, [N/A]')
    expect(reading.freeMiB).toBe(6144)
  })

  it('skips rows with no usable total', () => {
    expect(parseNvidiaSmiVram('0, Broken GPU, [N/A], 0, 0')).toEqual([])
    expect(parseNvidiaSmiVram('')).toEqual([])
    expect(parseNvidiaSmiVram('garbage line')).toEqual([])
  })
})

describe('parseRocmSmiVram', () => {
  it('converts byte columns to MiB', () => {
    const readings = parseRocmSmiVram(
      'device,VRAM Total Memory (B),VRAM Total Used Memory (B)\ncard0,17163091968,1073741824'
    )
    expect(readings).toEqual([
      { index: '0', name: 'AMD GPU', totalMiB: 16368, usedMiB: 1024, freeMiB: 15344 }
    ])
  })

  it('ignores the header and any non-card rows', () => {
    expect(parseRocmSmiVram('device,VRAM Total Memory (B)')).toEqual([])
  })
})

describe('pickPrimaryVram', () => {
  it('picks the largest card, not index 0, on a hybrid machine', () => {
    const integrated = { index: '0', name: 'Vega', totalMiB: 512, usedMiB: 100, freeMiB: 412 }
    const discrete = { index: '1', name: 'GTX 1650', totalMiB: 4096, usedMiB: 403, freeMiB: 3693 }
    expect(pickPrimaryVram([integrated, discrete])).toBe(discrete)
  })

  it('returns null when nothing was reported', () => {
    expect(pickPrimaryVram([])).toBeNull()
  })
})

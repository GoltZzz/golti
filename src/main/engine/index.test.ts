import { describe, expect, it } from 'vitest'
import { pickStartupModel } from './index'

describe('pickStartupModel', () => {
  const models = [{ filepath: '/m/a.gguf' }, { filepath: '/m/b.gguf' }]

  it('prefers the last-used model when it still exists', () => {
    expect(pickStartupModel(models, '/m/b.gguf')).toBe('/m/b.gguf')
  })

  it('falls back to the first model when the last-used one is gone', () => {
    expect(pickStartupModel(models, '/m/deleted.gguf')).toBe('/m/a.gguf')
    expect(pickStartupModel(models)).toBe('/m/a.gguf')
  })

  it('returns undefined when no models are installed', () => {
    expect(pickStartupModel([], '/m/a.gguf')).toBeUndefined()
  })
})

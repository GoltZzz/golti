import { describe, expect, it } from 'vitest'
import { useCookbookStore } from './cookbookStore'
import { EMPTY_MODEL_FILTERS } from '../../shared/model-filter'

describe('cookbookStore', () => {
  it('resets all filters and searchQuery with resetFilters', () => {
    const store = useCookbookStore.getState()
    store.setSearch('llama')
    store.setFilter('compatibleOnly', true)
    store.toggleFilterValue('useCases', 'chat')
    store.toggleFilterValue('families', 'llama')

    expect(useCookbookStore.getState().searchQuery).toBe('llama')
    expect(useCookbookStore.getState().filters.compatibleOnly).toBe(true)

    useCookbookStore.getState().resetFilters()

    const state = useCookbookStore.getState()
    expect(state.searchQuery).toBe('')
    expect(state.filters).toEqual(EMPTY_MODEL_FILTERS)
  })

  it('accumulates two successive toggleFilterValue calls correctly', () => {
    useCookbookStore.getState().resetFilters()

    const { toggleFilterValue } = useCookbookStore.getState()
    toggleFilterValue('families', 'llama')
    toggleFilterValue('families', 'qwen')

    const state = useCookbookStore.getState()
    expect(state.filters.families).toEqual(['llama', 'qwen'])

    // Toggling llama again removes it
    toggleFilterValue('families', 'llama')
    expect(useCookbookStore.getState().filters.families).toEqual(['qwen'])
  })
})

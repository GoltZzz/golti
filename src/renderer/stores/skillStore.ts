import { create } from 'zustand'
import { Skill } from '../../shared/types'

interface SkillState {
  skills: Skill[]
  loading: boolean
  error: string | null

  fetchSkills: () => Promise<void>
  createSkill: (input: { name: string; description?: string; instructions: string }) => Promise<Skill | null>
  updateSkill: (
    id: string,
    input: { name?: string; description?: string; instructions?: string }
  ) => Promise<void>
  deleteSkill: (id: string) => Promise<void>
  upsertSkill: (skill: Skill) => void
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  loading: false,
  error: null,

  fetchSkills: async () => {
    set({ loading: true, error: null })
    try {
      const skills = await window.goltiAPI.listSkills()
      set({ skills, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load skills'
      set({ loading: false, error: message })
    }
  },

  createSkill: async (input) => {
    try {
      const skill = await window.goltiAPI.createSkill(input)
      set((state) => ({ skills: mergeSkill(state.skills, skill) }))
      return skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create skill'
      set({ error: message })
      return null
    }
  },

  updateSkill: async (id, input) => {
    const skill = await window.goltiAPI.updateSkill(id, input)
    if (skill) set((state) => ({ skills: mergeSkill(state.skills, skill) }))
  },

  deleteSkill: async (id) => {
    await window.goltiAPI.deleteSkill(id)
    set((state) => ({ skills: state.skills.filter((s) => s.id !== id) }))
  },

  upsertSkill: (skill) => set((state) => ({ skills: mergeSkill(state.skills, skill) }))
}))

function mergeSkill(skills: Skill[], skill: Skill): Skill[] {
  const next = skills.filter((s) => s.id !== skill.id)
  next.push(skill)
  return next.sort((a, b) => a.name.localeCompare(b.name))
}

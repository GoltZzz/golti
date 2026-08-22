// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PixelCharacterSprite } from './PixelCharacterSprite'
import { OfficeAgent } from '../../../../shared/types'

const mockAgent: OfficeAgent = {
  id: 'agent-1',
  name: 'Ada Lovelace',
  role: 'coder',
  roleTitle: 'Algorithm Architect',
  avatar: {
    skinColor: '#f8c09a',
    hairColor: '#382a21',
    outfitColor: '#2c3e50',
    accentColor: '#61afef',
    hairstyle: 'short',
    outfitStyle: 'tech_tee',
    accessory: 'glasses'
  },
  status: 'idle',
  deskId: 'desk-1',
  position: { x: 2, y: 2 },
  model: 'llama3:8b',
  providerId: 'ollama',
  systemPrompt: 'You are an expert coder.',
  assignedSkillIds: [],
  level: 3,
  xp: 450,
  xpToNextLevel: 1000,
  stats: {
    tasksCompleted: 12,
    messagesSent: 45,
    toolCallsCount: 18,
    coffeeBreaksCount: 3
  },
  logs: [],
  memories: [],
  tokenBudget: 50000,
  tokensUsed: 12000,
  unlockedAchievements: []
}

describe('PixelCharacterSprite', () => {
  it('renders standard idle pixel sprite with crisp edges', () => {
    const { container } = render(<PixelCharacterSprite agent={mockAgent} />)
    const svg = container.querySelector('svg.pixel-sprite')
    expect(svg).toBeTruthy()
    expect(svg?.classList.contains('anim-idle')).toBe(true)
    expect(container.querySelector('.pixel-legs-standing')).toBeTruthy()
  })

  it('renders working state with seated pose and typing arms', () => {
    const workingAgent = { ...mockAgent, status: 'working' as const }
    const { container } = render(<PixelCharacterSprite agent={workingAgent} />)
    const svg = container.querySelector('svg.pixel-sprite')
    expect(svg?.classList.contains('anim-working')).toBe(true)
    expect(container.querySelector('.pixel-legs-seated')).toBeTruthy()
    expect(container.querySelector('.pixel-arms-working')).toBeTruthy()
  })

  it('renders break state with coffee mug and steam', () => {
    const breakAgent = { ...mockAgent, status: 'break' as const }
    const { container } = render(<PixelCharacterSprite agent={breakAgent} />)
    expect(container.querySelector('.pixel-arms-break')).toBeTruthy()
    expect(container.querySelector('.pixel-coffee-steam-1')).toBeTruthy()
  })

  it('renders thinking state with thought spark', () => {
    const thinkingAgent = { ...mockAgent, status: 'thinking' as const }
    const { container } = render(<PixelCharacterSprite agent={thinkingAgent} />)
    expect(container.querySelector('.pixel-thought-spark')).toBeTruthy()
  })

  it('renders error state with glitch sweat drop', () => {
    const errorAgent = { ...mockAgent, status: 'error' as const }
    const { container } = render(<PixelCharacterSprite agent={errorAgent} />)
    expect(container.querySelector('.pixel-sweat-drop')).toBeTruthy()
    expect(container.querySelector('.pixel-arms-error')).toBeTruthy()
  })

  it('renders various hairstyles and outfit styles properly', () => {
    const customAgent: OfficeAgent = {
      ...mockAgent,
      avatar: {
        ...mockAgent.avatar,
        hairstyle: 'afro',
        outfitStyle: 'blazer',
        accessory: 'headphones'
      }
    }
    const { container } = render(<PixelCharacterSprite agent={customAgent} />)
    expect(container.querySelector('.hair-afro')).toBeTruthy()
    expect(container.querySelector('.outfit-blazer')).toBeTruthy()
    expect(container.querySelector('.acc-headphones')).toBeTruthy()
  })

  it('applies is-reduced-motion when reducedMotion is true', () => {
    const { container } = render(
      <PixelCharacterSprite agent={mockAgent} reducedMotion={true} />
    )
    const svg = container.querySelector('svg.pixel-sprite')
    expect(svg?.classList.contains('is-reduced-motion')).toBe(true)
  })
})

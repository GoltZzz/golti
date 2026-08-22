import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawPixelCharacterSpriteCanvas } from './PixelCharacterCanvasRenderer'
import { OfficeAgent } from '../../../../shared/types'

describe('PixelCharacterCanvasRenderer', () => {
  const mockAgent: OfficeAgent = {
    id: 'agent-1',
    name: 'Ada Lovelace',
    role: 'coder',
    roleTitle: 'Senior Dev',
    avatar: {
      skinColor: '#f8c09a',
      hairColor: '#382a21',
      outfitColor: '#2c3e50',
      accentColor: '#61afef',
      hairstyle: 'bob',
      outfitStyle: 'hoodie',
      accessory: 'glasses'
    },
    status: 'working',
    statusMessage: 'Refactoring engine',
    deskId: 'desk-coder',
    position: { x: 11, y: 3 },
    model: 'qwen2.5-coder:7b',
    providerId: 'ollama',
    systemPrompt: 'System',
    assignedSkillIds: [],
    level: 2,
    xp: 150,
    xpToNextLevel: 200,
    stats: {
      tasksCompleted: 4,
      messagesSent: 10,
      toolCallsCount: 12,
      coffeeBreaksCount: 2
    },
    logs: [],
    memories: [],
    tokenBudget: 100000,
    tokensUsed: 20000,
    unlockedAchievements: []
  }

  const createMockCtx = () => {
    const fillRectCalls: Array<{ x: number; y: number; w: number; h: number; fill: string }> = []
    return {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      fillRect: vi.fn((x, y, w, h) => {
        fillRectCalls.push({ x, y, w, h, fill: ctx.fillStyle as string })
      }),
      beginPath: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      fillStyle: '#000000',
      fillRectCalls
    } as unknown as CanvasRenderingContext2D & { fillRectCalls: typeof fillRectCalls }
  }

  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    ctx = createMockCtx()
  })

  it('draws character sprite on canvas without errors', () => {
    drawPixelCharacterSpriteCanvas(ctx, 100, 100, mockAgent, {
      direction: 'south',
      isSeated: true,
      animFrame: 1
    })

    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
  })

  it('handles 4 directional facings (south, north, east, west)', () => {
    // North (back)
    drawPixelCharacterSpriteCanvas(ctx, 100, 100, mockAgent, {
      direction: 'north',
      isSeated: false
    })
    expect(ctx.fillRect).toHaveBeenCalled()

    // West (flipped)
    drawPixelCharacterSpriteCanvas(ctx, 100, 100, mockAgent, {
      direction: 'west',
      isWalking: true,
      walkFrame: 1
    })
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1)

    // East (normal profile)
    drawPixelCharacterSpriteCanvas(ctx, 100, 100, mockAgent, {
      direction: 'east',
      isWalking: true,
      walkFrame: 2
    })
    expect(ctx.fillRect).toHaveBeenCalled()
  })

  it('renders walking cycle offsets', () => {
    drawPixelCharacterSpriteCanvas(ctx, 100, 100, mockAgent, {
      direction: 'south',
      isWalking: true,
      walkFrame: 0
    })
    expect(ctx.fillRect).toHaveBeenCalled()
  })
})

/**
 * High-Performance 16/32-Bit Isometric Pixel Character Canvas Renderer
 *
 * Renders crisp integer-aligned pixel art sprites directly to Canvas 2D context.
 * Supports:
 * - 4-way directional facing ('south', 'north', 'east', 'west')
 * - 4-step leg & arm walk cycles
 * - Seated desk occlusion poses & typing gestures
 * - Ambient landmark activities (coffee sipping, whiteboard sketching, server diagnostics)
 * - Hue-shifted 3-tone color ramps matching agent customization
 */

import { OfficeAgent, AgentHairstyle, AgentOutfitStyle, AgentAvatarConfig } from '../../../../shared/types'
import { getAgentPixelPalette, AgentPixelPalette } from './PixelPalette'
import { FacingDirection } from '../isometric/OfficePathfinding'
import { drawContactShadow } from '../isometric/IsometricAssets'

export interface DrawCharacterOptions {
  direction?: FacingDirection
  isSeated?: boolean
  isWalking?: boolean
  walkFrame?: number
  animFrame?: number
  isNight?: boolean
  scale?: number
}

/**
 * Draws a fully animated pixel character on canvas at (screenX, screenY).
 * (screenX, screenY) represents the ground contact position (bottom-center of feet).
 */
export function drawPixelCharacterSpriteCanvas(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  agent: OfficeAgent,
  options: DrawCharacterOptions = {}
): void {
  const {
    direction = agent.facingDirection || 'south',
    isSeated = false,
    isWalking = false,
    walkFrame = agent.walkFrame || 0,
    animFrame = 0,
    isNight = false
  } = options

  const palette = getAgentPixelPalette(agent.avatar)
  const status = agent.status
  const hairstyle: AgentHairstyle = agent.avatar.hairstyle || 'short'
  const outfitStyle: AgentOutfitStyle = agent.avatar.outfitStyle || 'tech_tee'
  const accessory = agent.avatar.accessory

  // 1. Contact Ground Shadow (only if standing/walking)
  if (!isSeated) {
    const shadowWidth = isWalking ? 14 : 12
    drawContactShadow(ctx, screenX, screenY + 2, shadowWidth, 5, isNight)
  }

  ctx.save()

  // Base Sprite Top-Left in Canvas space (Sprite grid is 32 wide x 48 high)
  const ox = Math.round(screenX - 16)
  const oy = Math.round(screenY - 44)

  // Walking body bounce (1px integer dip on passing frames)
  const stepFrame = walkFrame % 4
  const walkDip = isWalking && (stepFrame === 1 || stepFrame === 3) ? 1 : 0

  // Pixel drawing helper
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(ox + x, oy + y + walkDip, w, h)
  }

  // Horizontal flip for West direction
  const isFlipped = direction === 'west'
  if (isFlipped) {
    ctx.translate(Math.round(screenX * 2), 0)
    ctx.scale(-1, 1)
  }

  const isBack = direction === 'north'
  const isProfile = direction === 'east' || direction === 'west'

  // --------------------------------------------------------------------------
  // 2. Legs & Shoes Layer
  // --------------------------------------------------------------------------
  if (isSeated) {
    // Seated Thighs & Knees
    px(10, 32, 12, 5, palette.outfit.base)
    px(10, 32, 12, 2, palette.outfit.highlight)
    px(10, 35, 12, 2, palette.outfit.shadow)
    // Calves & Shoes Under Desk
    px(11, 37, 4, 4, palette.outfit.shadow)
    px(17, 37, 4, 4, palette.outfit.shadow)
    px(10, 41, 5, 2, palette.ink)
    px(17, 41, 5, 2, palette.ink)
  } else if (isWalking) {
    // 4-step walk cycle
    let leftLegOffset = 0
    let rightLegOffset = 0

    if (stepFrame === 0) {
      leftLegOffset = 2
      rightLegOffset = -2
    } else if (stepFrame === 2) {
      leftLegOffset = -2
      rightLegOffset = 2
    }

    if (isProfile) {
      // Profile Walk Stride
      px(13 + leftLegOffset, 32, 5, 9, palette.outfit.base)
      px(14 + leftLegOffset, 32, 3, 8, palette.outfit.highlight)
      px(12 + leftLegOffset, 41, 6, 3, palette.ink)

      px(14 + rightLegOffset, 32, 4, 9, palette.outfit.shadow)
      px(13 + rightLegOffset, 41, 5, 3, palette.outfit.deepShadow)
    } else {
      // Front / Back Stride
      // Left Leg
      px(10, 32, 5, 9, palette.outfit.base)
      px(11, 32, 2, 8, palette.outfit.highlight)
      px(9, 41 + leftLegOffset, 6, 3, palette.ink)
      // Right Leg
      px(17, 32, 5, 9, palette.outfit.base)
      px(18, 32, 2, 8, palette.outfit.highlight)
      px(17, 41 + rightLegOffset, 6, 3, palette.ink)
      // Crotch Crease
      px(15, 32, 2, 5, palette.outfit.deepShadow)
    }
  } else {
    // Standing Idle
    if (isProfile) {
      px(13, 32, 6, 9, palette.outfit.base)
      px(14, 32, 4, 8, palette.outfit.highlight)
      px(12, 41, 7, 3, palette.ink)
    } else {
      px(10, 32, 5, 9, palette.outfit.base)
      px(11, 32, 2, 8, palette.outfit.highlight)
      px(10, 32, 1, 9, palette.outfit.shadow)
      px(17, 32, 5, 9, palette.outfit.base)
      px(18, 32, 2, 8, palette.outfit.highlight)
      px(21, 32, 1, 9, palette.outfit.shadow)
      px(15, 32, 2, 5, palette.outfit.deepShadow)
      px(9, 41, 6, 3, palette.ink)
      px(10, 41, 3, 1, '#3a3e4d')
      px(17, 41, 6, 3, palette.ink)
      px(18, 41, 3, 1, '#3a3e4d')
    }
  }

  // --------------------------------------------------------------------------
  // 3. Torso & Outfits
  // --------------------------------------------------------------------------
  const yOff = isSeated ? 1 : 0

  if (isBack) {
    // Back Torso View
    px(9, 21 + yOff, 14, 11, palette.outfit.base)
    px(10, 21 + yOff, 4, 10, palette.outfit.highlight)
    px(19, 22 + yOff, 4, 10, palette.outfit.shadow)
    // Spine Seam / Collar
    px(15, 20 + yOff, 2, 11, palette.outfit.deepShadow)
    px(11, 19 + yOff, 10, 2, palette.outfit.shadow)
  } else if (isProfile) {
    // Profile Torso View
    px(11, 21 + yOff, 10, 11, palette.outfit.base)
    px(13, 21 + yOff, 4, 10, palette.outfit.highlight)
    px(11, 22 + yOff, 2, 10, palette.outfit.shadow)
  } else {
    // Front 3/4 Torso View
    switch (outfitStyle) {
      case 'hoodie':
        px(9, 21 + yOff, 14, 11, palette.outfit.base)
        px(10, 21 + yOff, 4, 9, palette.outfit.highlight)
        px(20, 22 + yOff, 3, 10, palette.outfit.shadow)
        px(11, 19 + yOff, 10, 3, palette.outfit.shadow)
        px(13, 20 + yOff, 6, 2, palette.outfit.deepShadow)
        px(13, 22 + yOff, 1, 4, palette.accent.highlight)
        px(18, 22 + yOff, 1, 4, palette.accent.highlight)
        px(11, 27 + yOff, 10, 4, palette.outfit.shadow)
        px(12, 27 + yOff, 8, 3, palette.outfit.base)
        px(9, 31 + yOff, 14, 2, palette.outfit.deepShadow)
        break

      case 'blazer':
        px(13, 21 + yOff, 6, 10, '#f0f3f8')
        px(15, 22 + yOff, 2, 7, palette.accent.base)
        px(15, 22 + yOff, 2, 2, palette.accent.highlight)
        px(9, 21 + yOff, 4, 11, palette.outfit.highlight)
        px(19, 21 + yOff, 4, 11, palette.outfit.shadow)
        px(10, 22 + yOff, 4, 10, palette.outfit.base)
        px(18, 22 + yOff, 4, 10, palette.outfit.base)
        px(15, 29 + yOff, 2, 1, palette.accent.highlight)
        px(9, 31 + yOff, 14, 1, palette.outfit.deepShadow)
        break

      case 'turtleneck':
        px(12, 19 + yOff, 8, 4, palette.outfit.base)
        px(13, 19 + yOff, 6, 1, palette.outfit.highlight)
        px(12, 21 + yOff, 8, 1, palette.outfit.shadow)
        px(9, 22 + yOff, 14, 10, palette.outfit.base)
        px(10, 22 + yOff, 4, 9, palette.outfit.highlight)
        px(19, 23 + yOff, 4, 9, palette.outfit.shadow)
        px(15, 24 + yOff, 2, 2, palette.accent.base)
        break

      case 'jacket':
        px(13, 21 + yOff, 6, 10, palette.accent.base)
        px(14, 22 + yOff, 4, 4, palette.accent.highlight)
        px(9, 21 + yOff, 4, 11, palette.outfit.highlight)
        px(19, 21 + yOff, 4, 11, palette.outfit.shadow)
        px(13, 21 + yOff, 1, 11, '#abb2bf')
        px(18, 21 + yOff, 1, 11, '#abb2bf')
        break

      case 'tech_tee':
      default:
        px(9, 21 + yOff, 14, 11, palette.outfit.base)
        px(10, 21 + yOff, 5, 9, palette.outfit.highlight)
        px(19, 22 + yOff, 4, 10, palette.outfit.shadow)
        px(13, 21 + yOff, 6, 2, palette.skin.base)
        px(13, 22 + yOff, 6, 1, palette.skin.shadow)
        px(15, 22 + yOff, 1, 7, palette.accent.base)
        px(14, 27 + yOff, 3, 3, '#f0f3f8')
        px(15, 28 + yOff, 1, 1, palette.accent.base)
        break
    }
  }

  // --------------------------------------------------------------------------
  // 4. Arms, Hands & Interactive Props
  // --------------------------------------------------------------------------
  const ambient = agent.ambientActivity
  const typingJitter = animFrame % 2 === 0 ? 0 : 1

  if (status === 'working') {
    // Rapid Typing Pose with Mini Keyboard
    px(7, 23 + yOff, 4, 6, palette.outfit.highlight)
    px(21, 23 + yOff, 4, 6, palette.outfit.shadow)
    // Left & Right typing hands
    px(10, 28 + yOff + typingJitter, 4, 3, palette.skin.base)
    px(18, 28 + yOff + (1 - typingJitter), 4, 3, palette.skin.base)
    // Mini glowing keyboard
    px(9, 31 + yOff, 14, 3, palette.ink)
    px(10, 32 + yOff, 3, 1, palette.accent.highlight)
    px(14, 32 + yOff, 4, 1, palette.accent.highlight)
    px(19, 32 + yOff, 3, 1, palette.accent.highlight)
  } else if (status === 'thinking' || ambient === 'whiteboard_brainstorm') {
    // Contemplative / Whiteboard Marker Pose
    px(7, 23 + yOff, 3, 7, palette.outfit.highlight)
    px(10, 28 + yOff, 7, 3, palette.outfit.base)
    px(16, 28 + yOff, 2, 2, palette.skin.base)
    px(21, 23 + yOff, 4, 5, palette.outfit.shadow)
    px(19, 19 + yOff, 4, 5, palette.skin.base)
    // Whiteboard Marker in hand if at board
    if (ambient === 'whiteboard_brainstorm') {
      px(23, 16 + yOff, 2, 6, palette.accent.base)
      px(23, 14 + yOff, 2, 2, '#ffffff')
    }
  } else if (status === 'break' || ambient === 'coffee_break') {
    // Coffee Mug & Rising Steam
    px(6, 22 + yOff, 3, 9, palette.outfit.highlight)
    px(6, 30 + yOff, 3, 3, palette.skin.base)
    px(21, 22 + yOff, 4, 6, palette.outfit.shadow)
    px(23, 27 + yOff, 3, 3, palette.skin.base)
    // Ceramic Mug
    px(24, 25 + yOff, 6, 6, '#f0f3f8')
    px(25, 26 + yOff, 4, 2, '#5c3a21')
    px(29, 27 + yOff, 2, 3, '#f0f3f8')
    // Animated Steam Particles
    const steamY = (animFrame % 6) * 1
    px(25, 23 + yOff - steamY, 1, 2, 'rgba(255, 255, 255, 0.8)')
    px(27, 22 + yOff - ((steamY + 2) % 6), 1, 2, 'rgba(255, 255, 255, 0.8)')
  } else if (ambient === 'server_diagnostics') {
    // Diagnostic Cyber Tablet
    px(7, 23 + yOff, 4, 6, palette.outfit.highlight)
    px(21, 23 + yOff, 4, 6, palette.outfit.shadow)
    px(10, 27 + yOff, 12, 7, '#1e222d')
    px(11, 28 + yOff, 10, 5, '#61afef')
    px(12, 29 + yOff, 4, 1, '#ffffff')
  } else if (status === 'error') {
    // Frustrated Hands on Head
    px(6, 16 + yOff, 4, 6, palette.outfit.highlight)
    px(8, 12 + yOff, 3, 4, palette.skin.base)
    px(22, 16 + yOff, 4, 6, palette.outfit.shadow)
    px(21, 12 + yOff, 3, 4, palette.skin.base)
  } else if (isWalking) {
    // Walking Arm Swing
    const armSwing = stepFrame === 0 ? 2 : stepFrame === 2 ? -2 : 0
    px(6, 22 + yOff + armSwing, 3, 8, palette.outfit.highlight)
    px(6, 29 + yOff + armSwing, 3, 3, palette.skin.base)
    px(23, 22 + yOff - armSwing, 3, 8, palette.outfit.shadow)
    px(23, 29 + yOff - armSwing, 3, 3, palette.skin.base)
  } else {
    // Default Idle Arms
    px(6, 22 + yOff, 3, 9, palette.outfit.highlight)
    px(6, 30 + yOff, 3, 3, palette.skin.base)
    px(23, 22 + yOff, 3, 9, palette.outfit.shadow)
    px(23, 30 + yOff, 3, 3, palette.skin.base)
  }

  // --------------------------------------------------------------------------
  // 5. Head, Face & Expressions
  // --------------------------------------------------------------------------
  if (isBack) {
    // Neck & Head Back
    px(14, 19, 4, 3, palette.skin.shadow)
    px(10, 10, 12, 10, palette.skin.deepShadow)
  } else if (isProfile) {
    // Neck & Profile Face
    px(14, 19, 4, 3, palette.skin.shadow)
    px(11, 10, 11, 10, palette.skin.base)
    px(14, 10, 6, 8, palette.skin.highlight)
    px(11, 12, 2, 8, palette.skin.shadow)
    // Profile Eye
    px(18, 13, 3, 3, palette.ink)
    px(19, 13, 2, 3, palette.eyeColor)
    px(19, 13, 1, 1, palette.eyeShine)
    px(18, 11, 3, 1, palette.hair.shadow)
  } else {
    // 3/4 Front Face
    px(14, 19, 4, 3, palette.skin.shadow)
    px(15, 19, 2, 2, palette.skin.base)
    px(10, 10, 12, 10, palette.skin.base)
    px(10, 10, 4, 8, palette.skin.highlight)
    px(14, 10, 4, 2, palette.skin.highlight)
    px(20, 12, 2, 8, palette.skin.shadow)
    px(18, 18, 4, 2, palette.skin.shadow)
    px(12, 19, 8, 1, palette.skin.deepShadow)

    // Blush
    px(11, 16, 2, 1, palette.blush)
    px(19, 16, 2, 1, palette.blush)

    // Eyes
    if (status === 'error') {
      px(12, 13, 3, 2, palette.ink)
      px(18, 13, 3, 2, palette.ink)
      px(13, 14, 1, 1, '#ff4d4f')
      px(19, 14, 1, 1, '#ff4d4f')
      // Sweat drop
      px(23, 11, 2, 3, '#61afef')
      px(24, 11, 1, 1, '#ffffff')
    } else {
      // Left Eye
      px(12, 13, 3, 3, palette.ink)
      px(13, 13, 2, 3, palette.eyeColor)
      px(13, 13, 1, 1, palette.eyeShine)
      // Right Eye
      px(18, 13, 3, 3, palette.ink)
      px(18, 13, 2, 3, palette.eyeColor)
      px(18, 13, 1, 1, palette.eyeShine)
      // Eyebrows, Nose & Mouth
      px(12, 11, 3, 1, palette.hair.shadow)
      px(18, 11, 3, 1, palette.hair.shadow)
      px(16, 15, 1, 1, palette.skin.shadow)
      px(15, 17, 2, 1, palette.skin.deepShadow)
    }

    // Thinking Thought Spark
    if (status === 'thinking' || ambient === 'whiteboard_brainstorm') {
      px(22, 6, 3, 3, '#e5c07b')
      px(23, 5, 1, 5, '#ffd580')
      px(21, 7, 5, 1, '#ffd580')
      px(23, 7, 1, 1, '#ffffff')
    }
  }

  // --------------------------------------------------------------------------
  // 6. Hair Layer
  // --------------------------------------------------------------------------
  drawCanvasHair(px, hairstyle, palette, isBack, isProfile)

  // --------------------------------------------------------------------------
  // 7. Accessories Layer
  // --------------------------------------------------------------------------
  if (accessory) {
    drawCanvasAccessory(px, accessory, palette, isBack, isProfile)
  }

  ctx.restore()
}

/**
 * Draws modular pixel hairstyles on canvas.
 */
function drawCanvasHair(
  px: (x: number, y: number, w: number, h: number, c: string) => void,
  hairstyle: AgentHairstyle,
  palette: AgentPixelPalette,
  isBack: boolean,
  _isProfile: boolean
): void {
  if (isBack) {
    // Full back of head hair volume
    px(8, 6, 16, 11, palette.hair.base)
    px(9, 5, 14, 3, palette.hair.highlight)
    px(8, 12, 16, 5, palette.hair.shadow)
    px(10, 16, 12, 2, palette.hair.deepShadow)
    return
  }

  switch (hairstyle) {
    case 'tousled':
      px(8, 7, 16, 6, palette.hair.base)
      px(10, 5, 4, 3, palette.hair.highlight)
      px(15, 4, 4, 4, palette.hair.highlight)
      px(20, 6, 3, 3, palette.hair.base)
      px(9, 10, 4, 4, palette.hair.highlight)
      px(14, 10, 3, 3, palette.hair.highlight)
      px(19, 10, 4, 4, palette.hair.shadow)
      px(8, 11, 2, 5, palette.hair.shadow)
      px(22, 11, 2, 5, palette.hair.shadow)
      break

    case 'slick':
      px(9, 7, 14, 6, palette.hair.base)
      px(11, 7, 8, 2, palette.hair.highlight)
      px(12, 9, 6, 1, palette.hair.highlight)
      px(8, 10, 3, 6, palette.hair.shadow)
      px(21, 10, 3, 6, palette.hair.deepShadow)
      px(10, 10, 12, 2, palette.hair.base)
      break

    case 'afro':
      px(6, 5, 20, 9, palette.hair.base)
      px(8, 4, 16, 3, palette.hair.highlight)
      px(9, 4, 6, 2, palette.hair.highlight)
      px(5, 8, 3, 7, palette.hair.base)
      px(24, 8, 3, 7, palette.hair.deepShadow)
      px(7, 13, 3, 4, palette.hair.shadow)
      px(22, 13, 3, 4, palette.hair.deepShadow)
      break

    case 'ponytail':
      px(9, 7, 14, 6, palette.hair.base)
      px(11, 7, 6, 2, palette.hair.highlight)
      px(8, 10, 3, 5, palette.hair.shadow)
      px(21, 10, 3, 5, palette.hair.shadow)
      px(11, 10, 10, 2, palette.hair.base)
      px(22, 7, 3, 3, palette.accent.base)
      px(24, 9, 4, 10, palette.hair.base)
      px(25, 10, 2, 8, palette.hair.highlight)
      px(26, 17, 2, 4, palette.hair.shadow)
      break

    case 'bob':
      px(8, 7, 16, 6, palette.hair.base)
      px(11, 7, 7, 2, palette.hair.highlight)
      px(10, 10, 12, 3, palette.hair.base)
      px(11, 10, 5, 1, palette.hair.highlight)
      px(7, 11, 4, 8, palette.hair.highlight)
      px(8, 12, 3, 7, palette.hair.base)
      px(21, 11, 4, 8, palette.hair.deepShadow)
      px(21, 12, 3, 7, palette.hair.shadow)
      break

    case 'pixie':
      px(9, 7, 14, 5, palette.hair.base)
      px(11, 6, 6, 3, palette.hair.highlight)
      px(11, 9, 11, 4, palette.hair.highlight)
      px(15, 11, 6, 3, palette.hair.base)
      px(8, 10, 2, 4, palette.hair.shadow)
      px(21, 10, 3, 6, palette.hair.deepShadow)
      break

    case 'short':
    default:
      px(9, 7, 14, 6, palette.hair.base)
      px(11, 7, 8, 2, palette.hair.highlight)
      px(8, 11, 3, 4, palette.hair.shadow)
      px(21, 11, 3, 4, palette.hair.shadow)
      px(11, 10, 8, 2, palette.hair.base)
      px(11, 10, 4, 1, palette.hair.highlight)
      break
  }
}

/**
 * Draws modular pixel accessories on canvas.
 */
function drawCanvasAccessory(
  px: (x: number, y: number, w: number, h: number, c: string) => void,
  accessory: NonNullable<AgentAvatarConfig['accessory']>,
  palette: AgentPixelPalette,
  isBack: boolean,
  _isProfile: boolean
): void {
  if (isBack) {
    if (accessory === 'headphones') {
      px(9, 5, 14, 3, palette.accessory.shadow)
      px(11, 5, 10, 1, palette.accessory.highlight)
      px(6, 11, 4, 7, palette.accessory.shadow)
      px(22, 11, 4, 7, palette.accessory.shadow)
    } else if (accessory === 'hat') {
      px(6, 8, 20, 3, palette.accessory.base)
      px(9, 3, 14, 6, palette.accessory.base)
    }
    return
  }

  switch (accessory) {
    case 'glasses':
      px(11, 12, 5, 1, palette.accessory.base)
      px(11, 15, 5, 1, palette.accessory.base)
      px(11, 12, 1, 4, palette.accessory.base)
      px(15, 12, 1, 4, palette.accessory.base)
      px(17, 12, 5, 1, palette.accessory.base)
      px(17, 15, 5, 1, palette.accessory.base)
      px(17, 12, 1, 4, palette.accessory.base)
      px(21, 12, 1, 4, palette.accessory.base)
      px(15, 13, 3, 1, palette.accessory.base)
      px(12, 13, 1, 1, 'rgba(255, 255, 255, 0.75)')
      px(18, 13, 1, 1, 'rgba(255, 255, 255, 0.75)')
      break

    case 'headphones':
      px(9, 5, 14, 3, palette.accessory.shadow)
      px(11, 5, 10, 1, palette.accessory.highlight)
      px(6, 11, 4, 7, palette.accessory.base)
      px(7, 12, 2, 5, palette.accessory.highlight)
      px(22, 11, 4, 7, palette.accessory.shadow)
      px(23, 12, 2, 5, palette.accessory.base)
      break

    case 'hat':
      px(6, 8, 20, 3, palette.accessory.base)
      px(7, 8, 18, 1, palette.accessory.highlight)
      px(9, 3, 14, 6, palette.accessory.base)
      px(10, 3, 8, 2, palette.accessory.highlight)
      px(9, 7, 14, 2, palette.accent.base)
      break

    case 'laptop':
      px(10, 27, 12, 7, '#1e222d')
      px(11, 28, 10, 5, palette.accent.base)
      px(12, 29, 4, 1, '#ffffff')
      px(9, 34, 14, 2, '#2d3343')
      break

    default:
      break
  }
}

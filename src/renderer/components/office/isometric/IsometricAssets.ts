/**
 * High-Fidelity Isometric 2.5D Graphics & Asset Library
 *
 * Implements 3-face fixed lighting model:
 * - Top Face: 100% brightness
 * - Left Face: 82% brightness
 * - Right Face: 66% brightness
 *
 * Supports tactile zone materials:
 * - Director: Parquet Wood with satin sheen
 * - Bullpen: Modern Acoustic Weave Carpet
 * - Research: Lab Composite Resin with Cyan Inlay Tracks
 * - Breakroom/Lounge: Polished Slate Ceramic Check
 * - Server: Industrial Steel Grating with Blue Subfloor Vent Glow
 */

import { TILE_WIDTH, TILE_HEIGHT } from './IsometricProjection'

export type FloorTileType =
  | 'wood'
  | 'carpet'
  | 'concrete'
  | 'tile'
  | 'grating'
  | 'slate'
  | 'corridor'
  // Backward-compatible aliases
  | 'carpet_gold'
  | 'carpet_blue'
  | 'dark_wood'
  | 'metal_grate'
  | 'tile_slate'

export type DeskType = 'executive' | 'dev' | 'research' | 'server_console'

/**
 * Adjusts color brightness for fixed-angle lighting.
 */
export function adjustBrightness(hex: string, factor: number): string {
  if (hex.startsWith('#') && hex.length === 7) {
    const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * factor)))
    const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * factor)))
    const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * factor)))
    return `rgb(${r}, ${g}, ${b})`
  }
  return hex
}

/**
 * Draws a contact shadow ellipse on the ground.
 */
export function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  radiusX: number,
  radiusY: number,
  isNight: boolean = false
): void {
  ctx.save()
  const opacity = isNight ? 0.5 : 0.32
  const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radiusX)
  grad.addColorStop(0, `rgba(0, 0, 0, ${opacity})`)
  grad.addColorStop(0.7, `rgba(0, 0, 0, ${opacity * 0.45})`)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(screenX, screenY, radiusX, radiusY, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Draws an isometric box/prism with 3-face fixed lighting (top: 100%, left: 82%, right: 66%).
 */
export function drawIsometricPrism(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  width: number,
  length: number,
  height: number,
  baseColor: string,
  strokeColor?: string
): void {
  const hw = width / 2
  const hl = length / 2

  const topColor = baseColor
  const leftColor = adjustBrightness(baseColor, 0.82)
  const rightColor = adjustBrightness(baseColor, 0.66)

  // 1. Left Face
  ctx.fillStyle = leftColor
  ctx.beginPath()
  ctx.moveTo(screenX - hw, screenY - height)
  ctx.lineTo(screenX, screenY + hl - height)
  ctx.lineTo(screenX, screenY + hl)
  ctx.lineTo(screenX - hw, screenY)
  ctx.closePath()
  ctx.fill()
  if (strokeColor) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 2. Right Face
  ctx.fillStyle = rightColor
  ctx.beginPath()
  ctx.moveTo(screenX, screenY + hl - height)
  ctx.lineTo(screenX + hw, screenY - height)
  ctx.lineTo(screenX + hw, screenY)
  ctx.lineTo(screenX, screenY + hl)
  ctx.closePath()
  ctx.fill()
  if (strokeColor) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 3. Top Face
  ctx.fillStyle = topColor
  ctx.beginPath()
  ctx.moveTo(screenX, screenY - hl - height)
  ctx.lineTo(screenX + hw, screenY - height)
  ctx.lineTo(screenX, screenY + hl - height)
  ctx.lineTo(screenX - hw, screenY - height)
  ctx.closePath()
  ctx.fill()
  if (strokeColor) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

/**
 * Draws a rich tactile 3D isometric floor tile.
 */
export function drawIsometricTile(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  type: FloorTileType,
  isNight: boolean,
  isChecker: boolean = false
): void {
  const hw = TILE_WIDTH / 2
  const hh = TILE_HEIGHT / 2
  const depth = 6

  // 1. Draw 3D Side Thickness Faces
  ctx.fillStyle = isNight ? '#0a0c14' : '#141724'
  ctx.beginPath()
  ctx.moveTo(screenX, screenY + hh)
  ctx.lineTo(screenX + hw, screenY)
  ctx.lineTo(screenX + hw, screenY + depth)
  ctx.lineTo(screenX, screenY + hh + depth)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = isNight ? '#06080e' : '#0d0f18'
  ctx.beginPath()
  ctx.moveTo(screenX, screenY + hh)
  ctx.lineTo(screenX - hw, screenY)
  ctx.lineTo(screenX - hw, screenY + depth)
  ctx.lineTo(screenX, screenY + hh + depth)
  ctx.closePath()
  ctx.fill()

  // 2. Material Palettes (top color + border)
  let topColor = '#181a24'
  let borderColor = 'rgba(255, 255, 255, 0.05)'

  const normType =
    type === 'carpet_gold'
      ? 'wood'
      : type === 'carpet_blue'
      ? 'carpet'
      : type === 'dark_wood'
      ? 'tile'
      : type === 'metal_grate'
      ? 'grating'
      : type === 'tile_slate'
      ? 'slate'
      : type

  switch (normType) {
    case 'wood': // Executive Suite: Rich polished mahogany parquet
      topColor = isNight ? '#261b17' : '#3d2b24'
      borderColor = isNight ? '#3a2923' : '#543b32'
      break
    case 'carpet': // Dev Bullpen: Modern acoustic woven carpet
      topColor = isNight ? '#161b26' : '#202738'
      borderColor = isNight ? '#202838' : '#2e384f'
      break
    case 'concrete': // Research Lab: Smooth composite lab resin
      topColor = isNight ? '#181d28' : '#242b3d'
      borderColor = isNight ? '#252d3f' : '#38435e'
      break
    case 'tile': // Lounge: Slate ceramic check
      topColor = isNight ? '#1c1824' : '#2b2538'
      borderColor = isNight ? '#2b2438' : '#413854'
      break
    case 'grating': // Server Room: Perforated steel grating
      topColor = isNight ? '#13151f' : '#1e2130'
      borderColor = isNight ? '#1f2233' : '#2d3247'
      break
    case 'slate': // War Room: Dark polished obsidian slate
      topColor = isNight ? '#151824' : '#202538'
      borderColor = isNight ? '#22273b' : '#333b59'
      break
    case 'corridor':
    default:
      topColor = isNight ? '#0f111a' : '#171926'
      borderColor = isNight ? '#191c2b' : '#25283d'
      break
  }

  // 3. Apply subtle checker contrast
  if (isChecker) {
    topColor = adjustBrightness(topColor, isNight ? 1.06 : 1.05)
  }

  // 4. Draw Top Diamond Face
  ctx.fillStyle = topColor
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1

  ctx.beginPath()
  ctx.moveTo(screenX, screenY - hh)
  ctx.lineTo(screenX + hw, screenY)
  ctx.lineTo(screenX, screenY + hh)
  ctx.lineTo(screenX - hw, screenY)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // 5. Material Textures
  if (normType === 'wood') {
    // Parquet herringbone grain lines
    ctx.strokeStyle = isNight ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.04)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(screenX - hw * 0.45, screenY - hh * 0.45)
    ctx.lineTo(screenX + hw * 0.45, screenY + hh * 0.45)
    ctx.moveTo(screenX - hw * 0.15, screenY - hh * 0.75)
    ctx.lineTo(screenX + hw * 0.75, screenY + hh * 0.15)
    ctx.stroke()
  } else if (normType === 'grating') {
    // Perforated sub-floor glowing vents
    ctx.fillStyle = isNight ? 'rgba(86, 182, 194, 0.35)' : 'rgba(86, 182, 194, 0.25)'
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        ctx.fillRect(screenX + gx * 8 - 1.5, screenY + gy * 4 - 1.5, 3, 3)
      }
    }
  } else if (normType === 'concrete') {
    // Subtle cyber lab accent border line
    ctx.strokeStyle = isNight ? 'rgba(97, 175, 239, 0.18)' : 'rgba(97, 175, 239, 0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(screenX - hw * 0.7, screenY)
    ctx.lineTo(screenX, screenY + hh * 0.7)
    ctx.stroke()
  }
}

/**
 * Draws the 3D raised foundation slab surrounding the office floor.
 */
export function drawFoundationSlab(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  width: number,
  length: number,
  isNight: boolean
): void {
  drawIsometricPrism(
    ctx,
    screenX,
    screenY + 6,
    width,
    length,
    10,
    isNight ? '#080a10' : '#10131e',
    isNight ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.08)'
  )
}

/**
 * Draws modern low acoustic dividers with lush planter boxes on top.
 * Replaces the tall cyan glass cage walls for an open-concept studio feel.
 */
export function drawIsometricDivider(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  orientation: 'north' | 'west',
  isNight: boolean
): void {
  const hw = TILE_WIDTH / 2
  const hh = TILE_HEIGHT / 2
  const dividerHeight = 12

  ctx.save()
  if (orientation === 'north') {
    // Low Planter Divider along North edge
    drawIsometricPrism(
      ctx,
      screenX - hw * 0.5,
      screenY - hh * 0.5,
      18,
      12,
      dividerHeight,
      isNight ? '#222634' : '#32384d',
      '#404761'
    )
    // Foliage on top
    ctx.fillStyle = isNight ? '#2d5e3c' : '#3d8252'
    ctx.beginPath()
    ctx.arc(screenX - hw * 0.5, screenY - hh * 0.5 - dividerHeight - 3, 5, 0, Math.PI * 2)
    ctx.arc(screenX - hw * 0.5 + 4, screenY - hh * 0.5 - dividerHeight - 2, 4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Low Planter Divider along West edge
    drawIsometricPrism(
      ctx,
      screenX + hw * 0.5,
      screenY - hh * 0.5,
      12,
      18,
      dividerHeight,
      isNight ? '#222634' : '#32384d',
      '#404761'
    )
    // Foliage on top
    ctx.fillStyle = isNight ? '#2d5e3c' : '#3d8252'
    ctx.beginPath()
    ctx.arc(screenX + hw * 0.5, screenY - hh * 0.5 - dividerHeight - 3, 5, 0, Math.PI * 2)
    ctx.arc(screenX + hw * 0.5 - 4, screenY - hh * 0.5 - dividerHeight - 2, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Draws solid architectural exterior back walls on the outer building perimeter.
 */
export function drawIsometricBackWall(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  orientation: 'north' | 'west',
  isNight: boolean
): void {
  const hw = TILE_WIDTH / 2
  const hh = TILE_HEIGHT / 2
  const wallHeight = 46

  ctx.save()
  if (orientation === 'north') {
    // Solid North Wall Face
    ctx.fillStyle = isNight ? '#11131c' : '#1c202e'
    ctx.strokeStyle = isNight ? '#1e2233' : '#2d334a'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.moveTo(screenX - hw, screenY)
    ctx.lineTo(screenX, screenY - hh)
    ctx.lineTo(screenX, screenY - hh - wallHeight)
    ctx.lineTo(screenX - hw, screenY - wallHeight)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Baseboard trim
    ctx.fillStyle = isNight ? '#241b18' : '#3d2c25'
    ctx.beginPath()
    ctx.moveTo(screenX - hw, screenY)
    ctx.lineTo(screenX, screenY - hh)
    ctx.lineTo(screenX, screenY - hh - 4)
    ctx.lineTo(screenX - hw, screenY - 4)
    ctx.closePath()
    ctx.fill()
  } else {
    // Solid West Wall Face
    ctx.fillStyle = isNight ? '#0d0f17' : '#161924'
    ctx.strokeStyle = isNight ? '#1a1d2c' : '#25293b'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.moveTo(screenX + hw, screenY)
    ctx.lineTo(screenX, screenY - hh)
    ctx.lineTo(screenX, screenY - hh - wallHeight)
    ctx.lineTo(screenX + hw, screenY - wallHeight)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Baseboard trim
    ctx.fillStyle = isNight ? '#1d1613' : '#30231e'
    ctx.beginPath()
    ctx.moveTo(screenX + hw, screenY)
    ctx.lineTo(screenX, screenY - hh)
    ctx.lineTo(screenX, screenY - hh - 4)
    ctx.lineTo(screenX + hw, screenY - 4)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Backward-compatible wrapper for drawIsometricWall.
 */
export function drawIsometricWall(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  orientation: 'north' | 'west',
  isGlass: boolean = true,
  isNight: boolean = false
): void {
  if (isGlass) {
    drawIsometricDivider(ctx, screenX, screenY, orientation, isNight)
  } else {
    drawIsometricBackWall(ctx, screenX, screenY, orientation, isNight)
  }
}

/**
 * Draws high-fidelity, role-tailored workstation desks.
 * Features ultra-wide / dual monitors with live scanlines, mechanical keyboards,
 * PC tower chassis, desk lamps, and ergonomic mesh office chairs.
 */
export function drawIsometricDesk(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  options: {
    deskType: DeskType
    screens: number
    isActive: boolean
    isNight: boolean
    animFrame: number
    agentName?: string
    agentRole?: string
    skipChair?: boolean
  }
): void {
  const { deskType, screens, isActive, isNight, animFrame, agentName, skipChair = false } = options

  // 1. Contact Ground Shadow
  drawContactShadow(ctx, screenX, screenY + 5, 34, 16, isNight)

  // 2. High-Back Ergonomic Mesh Chair (behind desk) - only if not rendered as separate depth item
  if (!skipChair) {
    drawErgonomicMeshChair(ctx, screenX, screenY - 2, isNight)
  }

  // 3. Desk Top & Cabinet Construction
  const deskWidth = 42
  const deskLength = 22
  const deskHeight = 16

  let topColor = '#242838'
  let strokeColor = '#3b425c'

  if (deskType === 'executive') {
    topColor = isNight ? '#382720' : '#4d362c' // Polished mahogany
    strokeColor = isNight ? '#523a30' : '#6e4e40'
  } else if (deskType === 'research') {
    topColor = isNight ? '#222838' : '#30394f' // Composite lab slate
    strokeColor = isNight ? '#364059' : '#495678'
  } else if (deskType === 'server_console') {
    topColor = isNight ? '#1a1d29' : '#262a3b' // Industrial metal console
    strokeColor = isNight ? '#2c3145' : '#3e445e'
  }

  // Draw main desk prism
  drawIsometricPrism(ctx, screenX, screenY, deskWidth, deskLength, deskHeight, topColor, strokeColor)

  // Desk Legs & Cable Channel
  ctx.fillStyle = '#10121a'
  ctx.fillRect(screenX - 18, screenY, 4, 3)
  ctx.fillRect(screenX + 14, screenY, 4, 3)

  // 4. Desktop PC Tower Chassis (under/beside desk)
  const towerX = screenX + 14
  const towerY = screenY + 2
  drawIsometricPrism(ctx, towerX, towerY, 8, 14, 14, '#12141c', '#222636')
  // Glowing RGB Intake Fan
  ctx.fillStyle = isActive ? (deskType === 'executive' ? '#e5c07b' : '#61afef') : '#283042'
  ctx.beginPath()
  ctx.arc(towerX - 2, towerY - 6, 2.5, 0, Math.PI * 2)
  ctx.fill()

  // 5. Monitor Mounts & Screens
  const monitorY = screenY - deskHeight - 5
  const numScreens = Math.max(1, screens || (deskType === 'executive' ? 1 : 2))

  if (numScreens === 1) {
    // Ultra-Wide Curved Monitor
    drawUltraWideMonitor(ctx, screenX, monitorY, isActive, deskType, animFrame, isNight)
  } else if (numScreens === 2) {
    // Dual Monitor Setup (Angled left & right)
    drawDualMonitors(ctx, screenX, monitorY, isActive, deskType, animFrame, isNight)
  } else {
    // Triple Cyber Console Setup
    drawTripleMonitors(ctx, screenX, monitorY, isActive, deskType, animFrame, isNight)
  }

  // 6. Mechanical Keyboard with Spacebar & Mouse
  const kbX = screenX - 6
  const kbY = screenY - deskHeight - 1
  ctx.fillStyle = '#141722'
  ctx.fillRect(kbX - 8, kbY, 14, 4)
  // Illuminated Key Grid
  ctx.fillStyle = isActive ? 'rgba(97, 175, 239, 0.75)' : '#252b3d'
  ctx.fillRect(kbX - 7, kbY + 1, 12, 1)
  ctx.fillRect(kbX - 5, kbY + 2.5, 8, 1)

  // Mouse & Stitched Mousepad
  ctx.fillStyle = '#1e2230'
  ctx.fillRect(screenX + 8, kbY - 1, 6, 6)
  ctx.fillStyle = '#61afef'
  ctx.fillRect(screenX + 10, kbY + 1, 2.5, 3)

  // 7. Desk Lamp & Coffee Mug
  if (deskType === 'executive') {
    // Gold Banker's Lamp
    ctx.fillStyle = '#d19a66'
    ctx.fillRect(screenX - 16, screenY - deskHeight - 10, 2, 8)
    ctx.fillStyle = '#e5c07b'
    ctx.fillRect(screenX - 18, screenY - deskHeight - 12, 6, 3)
  } else {
    // Ceramic Coffee Mug
    ctx.fillStyle = '#f0f3f8'
    ctx.fillRect(screenX - 15, screenY - deskHeight - 4, 3, 4)
    ctx.fillStyle = '#5c3a21'
    ctx.fillRect(screenX - 14.5, screenY - deskHeight - 4, 2, 1)
  }

  // 8. Engraved Brass/Gold Desk Nameplate
  if (agentName) {
    ctx.save()
    const plateX = screenX - 14
    const plateY = screenY - 4
    ctx.fillStyle = '#141622'
    ctx.strokeStyle = deskType === 'executive' ? '#e5c07b' : '#61afef'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(plateX, plateY, 28, 7, 1.5)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 5.5px sans-serif'
    ctx.textAlign = 'center'
    const shortName = agentName.split(' ')[0]
    ctx.fillText(shortName, plateX + 14, plateY + 5.5)
    ctx.restore()
  }
}

/**
 * Draws an ergonomic high-back mesh office chair.
 */
export function drawErgonomicMeshChair(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  isNight: boolean
): void {
  drawContactShadow(ctx, screenX, screenY + 4, 14, 7, isNight)

  // 5-Spoke Caster Base
  ctx.fillStyle = '#12141c'
  ctx.beginPath()
  ctx.arc(screenX, screenY - 2, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4a5168'
  ctx.fillRect(screenX - 1.5, screenY - 5, 3, 4)

  // Curved Mesh Backrest & Headrest
  ctx.fillStyle = '#1d2130'
  ctx.strokeStyle = '#32384f'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(screenX - 8, screenY - 22, 16, 15, 3)
  ctx.fill()
  ctx.stroke()

  // Headrest Cushion
  ctx.fillStyle = '#282d42'
  ctx.beginPath()
  ctx.roundRect(screenX - 5, screenY - 26, 10, 4, 1.5)
  ctx.fill()
}

/**
 * Draws an ultra-wide curved monitor with glowing code scanlines.
 */
function drawUltraWideMonitor(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  isActive: boolean,
  deskType: DeskType,
  animFrame: number,
  isNight: boolean
): void {
  // Stand
  ctx.fillStyle = '#12141c'
  ctx.fillRect(screenX - 2, screenY, 4, 6)

  // Curved Bezel
  ctx.fillStyle = '#161924'
  ctx.strokeStyle = '#2b3147'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(screenX - 16, screenY - 14, 32, 14, 2)
  ctx.fill()
  ctx.stroke()

  // Screen Surface
  const screenGlow = isActive
    ? deskType === 'executive'
      ? '#e5c07b'
      : deskType === 'research'
      ? '#98c379'
      : '#61afef'
    : isNight
    ? '#090b12'
    : '#121522'

  ctx.fillStyle = isActive ? '#0e1422' : screenGlow
  ctx.fillRect(screenX - 14, screenY - 12, 28, 10)

  if (isActive) {
    // Dynamic Animated Code Lines
    const pulse = Math.sin(animFrame * 0.15) * 0.2 + 0.8
    ctx.fillStyle = screenGlow
    ctx.globalAlpha = pulse
    ctx.fillRect(screenX - 12, screenY - 10, 14, 1.5)
    ctx.fillRect(screenX - 12, screenY - 7, 20, 1.5)
    ctx.fillRect(screenX - 12, screenY - 4, 10, 1.5)
    ctx.globalAlpha = 1
  }
}

/**
 * Draws dual angled monitors with live code/data displays.
 */
function drawDualMonitors(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  isActive: boolean,
  deskType: DeskType,
  animFrame: number,
  isNight: boolean
): void {
  // Left Screen
  drawSingleMonitorBezel(ctx, screenX - 10, screenY, isActive, deskType, animFrame, isNight, 'left')
  // Right Screen
  drawSingleMonitorBezel(ctx, screenX + 8, screenY, isActive, deskType, animFrame, isNight, 'right')
}

/**
 * Draws triple monitors for DevOps/Server console.
 */
function drawTripleMonitors(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  isActive: boolean,
  deskType: DeskType,
  animFrame: number,
  isNight: boolean
): void {
  drawSingleMonitorBezel(ctx, screenX - 14, screenY + 1, isActive, deskType, animFrame, isNight, 'left')
  drawSingleMonitorBezel(ctx, screenX, screenY - 2, isActive, deskType, animFrame, isNight, 'center')
  drawSingleMonitorBezel(ctx, screenX + 14, screenY + 1, isActive, deskType, animFrame, isNight, 'right')
}

function drawSingleMonitorBezel(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  isActive: boolean,
  deskType: DeskType,
  animFrame: number,
  isNight: boolean,
  _side: 'left' | 'right' | 'center'
): void {
  ctx.fillStyle = '#12141c'
  ctx.fillRect(mx - 1.5, my, 3, 5)

  ctx.fillStyle = '#161924'
  ctx.strokeStyle = '#2b3147'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(mx - 9, my - 13, 18, 13, 1.5)
  ctx.fill()
  ctx.stroke()

  const glowColor =
    deskType === 'executive'
      ? '#e5c07b'
      : deskType === 'research'
      ? '#98c379'
      : '#61afef'

  ctx.fillStyle = isActive ? '#0e1422' : isNight ? '#090b12' : '#121522'
  ctx.fillRect(mx - 7.5, my - 11.5, 15, 10)

  if (isActive) {
    const pulse = Math.sin((animFrame + mx) * 0.15) * 0.2 + 0.8
    ctx.fillStyle = glowColor
    ctx.globalAlpha = pulse
    ctx.fillRect(mx - 6, my - 10, 8, 1.5)
    ctx.fillRect(mx - 6, my - 7.5, 12, 1.5)
    ctx.fillRect(mx - 6, my - 5, 6, 1.5)
    ctx.globalAlpha = 1
  }
}

/**
 * Draws an industrial server rack with multi-blade cascading status LEDs.
 */
export function drawIsometricServerRack(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  animFrame: number,
  isNight: boolean
): void {
  drawContactShadow(ctx, screenX, screenY + 5, 24, 13, isNight)

  // Tall Cabinet Prism
  drawIsometricPrism(ctx, screenX, screenY, 34, 20, 42, isNight ? '#131520' : '#1e2230', '#2d3347')

  // Server Blades & Animated LED Matrix
  const startY = screenY - 38
  for (let i = 0; i < 6; i++) {
    const bladeY = startY + i * 6.5
    ctx.fillStyle = '#0b0d14'
    ctx.fillRect(screenX - 12, bladeY, 24, 5)

    // Ventilation Intake Louvers
    ctx.fillStyle = '#1c202e'
    ctx.fillRect(screenX - 10, bladeY + 1, 10, 3)

    // Animated Activity LEDs
    const blink1 = Math.sin((animFrame + i * 35) * 0.2) > 0
    const blink2 = Math.cos((animFrame + i * 25) * 0.25) > 0
    const blink3 = Math.sin((animFrame + i * 15) * 0.3) > 0

    ctx.fillStyle = blink1 ? '#56b6c2' : '#143338'
    ctx.fillRect(screenX + 3, bladeY + 1.5, 2, 2)
    ctx.fillStyle = blink2 ? '#98c379' : '#182b1c'
    ctx.fillRect(screenX + 6.5, bladeY + 1.5, 2, 2)
    ctx.fillStyle = blink3 ? '#e06c75' : '#3b181b'
    ctx.fillRect(screenX + 10, bladeY + 1.5, 2, 2)
  }
}

/**
 * Draws the espresso lounge coffee bar with steaming cups and grinder.
 */
export function drawIsometricCoffeeBar(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  animFrame: number
): void {
  drawContactShadow(ctx, screenX, screenY + 5, 32, 16)

  // Wooden Counter Prism
  drawIsometricPrism(ctx, screenX, screenY, 40, 22, 18, '#332924', '#473a33')

  // Stainless Steel Espresso Machine
  const mx = screenX - 8
  const my = screenY - 18
  drawIsometricPrism(ctx, mx, my, 16, 12, 14, '#9aa2b0', '#c2c9d6')

  // Dual Bean Hoppers
  ctx.fillStyle = 'rgba(74, 52, 38, 0.9)'
  ctx.fillRect(mx - 4, my - 18, 3, 4)
  ctx.fillRect(mx + 1, my - 18, 3, 4)

  // Ceramic Cups on Counter
  ctx.fillStyle = '#f0f3fa'
  ctx.fillRect(screenX + 8, screenY - 20, 4, 5)
  ctx.fillRect(screenX + 13, screenY - 20, 4, 5)

  // Rising Steam Wisps
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.lineWidth = 1.2
  const steamY = my - 16 - (animFrame % 25) * 0.4
  ctx.beginPath()
  ctx.moveTo(mx, steamY + 6)
  ctx.quadraticCurveTo(mx + 3, steamY + 3, mx, steamY)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws the War Room holographic projector table with rotating 3D wireframe topology.
 */
export function drawIsometricHoloTable(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  animFrame: number,
  isNight: boolean
): void {
  drawContactShadow(ctx, screenX, screenY + 5, 36, 18, isNight)

  // Circular Table Base
  drawIsometricPrism(ctx, screenX, screenY, 48, 28, 14, isNight ? '#161926' : '#22273b', '#343b57')

  // Hologram Floor Projection Ring
  ctx.save()
  const holoColor = isNight ? 'rgba(97, 175, 239, 0.45)' : 'rgba(97, 175, 239, 0.3)'
  const holoGlow = ctx.createRadialGradient(screenX, screenY - 22, 2, screenX, screenY - 22, 26)
  holoGlow.addColorStop(0, holoColor)
  holoGlow.addColorStop(1, 'rgba(97, 175, 239, 0)')

  ctx.fillStyle = holoGlow
  ctx.beginPath()
  ctx.arc(screenX, screenY - 22, 24, 0, Math.PI * 2)
  ctx.fill()

  // Rotating Wireframe Core
  ctx.strokeStyle = 'rgba(97, 175, 239, 0.85)'
  ctx.lineWidth = 1.2
  const rot = animFrame * 0.03
  const rx = Math.cos(rot) * 11
  const ry = Math.sin(rot) * 7

  ctx.beginPath()
  ctx.ellipse(screenX, screenY - 22, Math.abs(rx) + 3, 9, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(screenX - rx, screenY - 28)
  ctx.lineTo(screenX + rx, screenY - 16)
  ctx.stroke()

  ctx.restore()
}

/**
 * Draws an architecture whiteboard with flowcharts and sticky notes.
 */
export function drawIsometricWhiteboard(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  animFrame: number = 0,
  isBrainstorming: boolean = false
): void {
  drawContactShadow(ctx, screenX, screenY + 3, 24, 9)

  // Aluminum Stand Legs
  ctx.strokeStyle = '#4a5068'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(screenX - 16, screenY)
  ctx.lineTo(screenX - 11, screenY - 30)
  ctx.moveTo(screenX + 16, screenY)
  ctx.lineTo(screenX + 11, screenY - 30)
  ctx.stroke()

  // Whiteboard Surface
  ctx.fillStyle = '#edf1fa'
  ctx.strokeStyle = '#636b8a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(screenX - 20, screenY - 34, 40, 24, 2)
  ctx.fill()
  ctx.stroke()

  // Colorful Kanban Sticky Notes
  ctx.fillStyle = '#e06c75'
  ctx.fillRect(screenX - 16, screenY - 30, 5, 5)
  ctx.fillStyle = '#e5c07b'
  ctx.fillRect(screenX - 8, screenY - 30, 5, 5)
  ctx.fillStyle = '#61afef'
  ctx.fillRect(screenX, screenY - 30, 5, 5)
  ctx.fillStyle = '#98c379'
  ctx.fillRect(screenX + 8, screenY - 30, 5, 5)

  // System Flowchart Diagrams
  ctx.strokeStyle = '#5a627d'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(screenX - 16, screenY - 20)
  ctx.lineTo(screenX + 14, screenY - 20)
  ctx.moveTo(screenX - 16, screenY - 15)
  ctx.lineTo(screenX + 6, screenY - 15)
  ctx.stroke()

  // Dynamic Brainstorming Marker Drawings
  if (isBrainstorming) {
    const pulse = (animFrame % 20)
    ctx.fillStyle = '#61afef'
    ctx.fillRect(screenX - 4, screenY - 23, 8, 5)
    ctx.fillStyle = '#98c379'
    ctx.fillRect(screenX + 6, screenY - 17, 7, 5)

    if (pulse > 10) {
      ctx.strokeStyle = '#e06c75'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(screenX - 12, screenY - 12)
      ctx.lineTo(screenX + 10, screenY - 12)
      ctx.stroke()
    }
  }
}

/**
 * Draws a potted monstera / fiddle-leaf fig plant in ceramic planter.
 */
export function drawIsometricPlant(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  isNight: boolean
): void {
  drawContactShadow(ctx, screenX, screenY + 3, 16, 8, isNight)

  // Terracotta Planter Pot
  drawIsometricPrism(ctx, screenX, screenY, 16, 12, 12, '#9e5a47', '#b86d59')

  // Lush Foliage Leaves
  ctx.fillStyle = isNight ? '#255434' : '#388550'
  ctx.beginPath()
  ctx.arc(screenX, screenY - 18, 10, 0, Math.PI * 2)
  ctx.arc(screenX - 7, screenY - 16, 8, 0, Math.PI * 2)
  ctx.arc(screenX + 7, screenY - 16, 8, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = isNight ? '#35754a' : '#4ba869'
  ctx.beginPath()
  ctx.arc(screenX - 2, screenY - 20, 6, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draws a modern office chair (e.g. for meeting lounge).
 */
export function drawIsometricChair(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
  drawContactShadow(ctx, screenX, screenY + 2, 12, 6)

  // Base
  ctx.fillStyle = '#161822'
  ctx.beginPath()
  ctx.arc(screenX, screenY - 3, 6, 0, Math.PI * 2)
  ctx.fill()

  // Backrest
  ctx.fillStyle = '#222638'
  ctx.strokeStyle = '#383e59'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(screenX - 6, screenY - 15, 12, 10, 2)
  ctx.fill()
  ctx.stroke()
}

export function drawIsometricWaterCooler(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  _animFrame: number
): void {
  drawContactShadow(ctx, screenX, screenY + 2, 12, 6)
  drawIsometricPrism(ctx, screenX, screenY, 12, 10, 18, '#2a3040', '#3b4359')

  // Water bottle
  ctx.fillStyle = 'rgba(86, 182, 194, 0.75)'
  ctx.beginPath()
  ctx.roundRect(screenX - 4, screenY - 26, 8, 10, 2)
  ctx.fill()
}

export function drawIsometricPrinter(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number
): void {
  drawContactShadow(ctx, screenX, screenY + 2, 16, 8)
  drawIsometricPrism(ctx, screenX, screenY, 20, 14, 12, '#353a4d', '#4a516b')
}

export function drawIsometricFilingCabinet(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number
): void {
  drawContactShadow(ctx, screenX, screenY + 2, 16, 8)
  drawIsometricPrism(ctx, screenX, screenY, 18, 14, 22, '#2d3345', '#404761')
}

export function drawIsometricBookshelf(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number
): void {
  drawContactShadow(ctx, screenX, screenY + 2, 22, 10)
  drawIsometricPrism(ctx, screenX, screenY, 26, 12, 28, '#2a221f', '#3d322e')

  // Book Spines
  ctx.fillStyle = '#e06c75'
  ctx.fillRect(screenX - 9, screenY - 22, 3, 8)
  ctx.fillStyle = '#61afef'
  ctx.fillRect(screenX - 5, screenY - 22, 3, 8)
  ctx.fillStyle = '#e5c07b'
  ctx.fillRect(screenX - 1, screenY - 22, 3, 8)
  ctx.fillStyle = '#98c379'
  ctx.fillRect(screenX + 3, screenY - 22, 3, 8)
}

export function drawIsometricRoundTable(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number
): void {
  drawContactShadow(ctx, screenX, screenY + 2, 20, 10)
  drawIsometricPrism(ctx, screenX, screenY, 24, 20, 12, '#2c2e3d', '#3f4257')
}

export function drawIsometricWallClock(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number
): void {
  ctx.fillStyle = '#222533'
  ctx.strokeStyle = '#444a66'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(screenX, screenY - 20, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

export function drawIsometricNeonSign(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  animFrame: number,
  _isNight: boolean
): void {
  ctx.save()
  const glow = Math.sin(animFrame * 0.08) * 0.1 + 0.9
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = `rgba(224, 108, 117, ${glow})`
  ctx.shadowColor = '#e06c75'
  ctx.shadowBlur = 10
  ctx.fillText('GOLTI AI STUDIO', screenX, screenY - 24)
  ctx.restore()
}

export function drawIsometricRug(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  color: string
): void {
  const hw = (TILE_WIDTH * 2.2) / 2
  const hh = (TILE_HEIGHT * 2.2) / 2

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(screenX, screenY - hh)
  ctx.lineTo(screenX + hw, screenY)
  ctx.lineTo(screenX, screenY + hh)
  ctx.lineTo(screenX - hw, screenY)
  ctx.closePath()
  ctx.fill()
}

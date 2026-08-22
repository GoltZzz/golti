import React, { useMemo } from 'react'
import { OfficeAgent, AgentHairstyle, AgentOutfitStyle } from '../../../../shared/types'
import { getAgentPixelPalette, AgentPixelPalette } from './PixelPalette'

export interface PixelCharacterSpriteProps {
  agent: OfficeAgent
  reducedMotion?: boolean
  className?: string
  scale?: number
}

/**
 * High-Definition 16/32-Bit Isometric Pixel Art Sprite Engine
 *
 * Renders on a crisp 32x48 integer pixel grid with 3-tone lighting ramps,
 * modular layers (body, outfit, hair, accessories), and stepped keyframe animations.
 */
export const PixelCharacterSprite: React.FC<PixelCharacterSpriteProps> = ({
  agent,
  reducedMotion = false,
  className = '',
  scale
}) => {
  const palette = useMemo(() => getAgentPixelPalette(agent.avatar), [agent.avatar])

  const status = agent.status
  const isSeated = status === 'working' || status === 'thinking' || status === 'meeting'
  const hairstyle: AgentHairstyle = agent.avatar.hairstyle || 'short'
  const outfitStyle: AgentOutfitStyle = agent.avatar.outfitStyle || 'tech_tee'
  const accessory = agent.avatar.accessory

  const animationClass = reducedMotion
    ? 'is-reduced-motion'
    : status === 'working'
    ? 'anim-working'
    : status === 'thinking'
    ? 'anim-thinking'
    : status === 'break'
    ? 'anim-break'
    : status === 'meeting'
    ? 'anim-meeting'
    : status === 'error'
    ? 'anim-error'
    : 'anim-idle'

  return (
    <svg
      className={`pixel-sprite ${animationClass} ${className}`}
      viewBox="0 0 32 48"
      width={scale ? 32 * scale : '44'}
      height={scale ? 48 * scale : '56'}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* 1. Contact Ground Shadow */}
      <g className="pixel-shadow-layer">
        <rect x="7" y="44" width="18" height="2" rx="1" fill="rgba(0, 0, 0, 0.45)" />
        <rect x="9" y="43" width="14" height="4" rx="1" fill="rgba(0, 0, 0, 0.28)" />
        <rect x="11" y="42" width="10" height="6" rx="1" fill="rgba(0, 0, 0, 0.15)" />
      </g>

      <g className="pixel-body-group">
        {/* 2. Lower Body & Legs (Standing vs Seated) */}
        {isSeated ? (
          <g className="pixel-legs-seated">
            {/* Seated Thighs & Knees */}
            <rect x="10" y="32" width="12" height="6" fill={palette.outfit.base} />
            <rect x="10" y="32" width="12" height="2" fill={palette.outfit.highlight} />
            <rect x="10" y="36" width="12" height="2" fill={palette.outfit.shadow} />
            {/* Calves & Shoes Under Desk */}
            <rect x="11" y="38" width="4" height="4" fill={palette.outfit.shadow} />
            <rect x="17" y="38" width="4" height="4" fill={palette.outfit.shadow} />
            <rect x="10" y="42" width="5" height="2" fill={palette.ink} />
            <rect x="17" y="42" width="5" height="2" fill={palette.ink} />
          </g>
        ) : (
          <g className="pixel-legs-standing">
            {/* Left Leg */}
            <rect x="10" y="32" width="5" height="9" fill={palette.outfit.base} />
            <rect x="11" y="32" width="2" height="8" fill={palette.outfit.highlight} />
            <rect x="10" y="32" width="1" height="9" fill={palette.outfit.shadow} />
            {/* Right Leg */}
            <rect x="17" y="32" width="5" height="9" fill={palette.outfit.base} />
            <rect x="18" y="32" width="2" height="8" fill={palette.outfit.highlight} />
            <rect x="21" y="32" width="1" height="9" fill={palette.outfit.shadow} />
            {/* Crotch Crease */}
            <rect x="15" y="32" width="2" height="5" fill={palette.outfit.deepShadow} />
            {/* Shoes */}
            <rect x="9" y="41" width="6" height="3" fill={palette.ink} />
            <rect x="10" y="41" width="3" height="1" fill="#3a3e4d" />
            <rect x="17" y="41" width="6" height="3" fill={palette.ink} />
            <rect x="18" y="41" width="3" height="1" fill="#3a3e4d" />
          </g>
        )}

        {/* 3. Torso & Outfits */}
        <g className="pixel-torso">
          {renderOutfit(outfitStyle, palette, isSeated)}
        </g>

        {/* 4. Arms & Hands Layer */}
        <g className="pixel-arms">
          {renderArms(status, palette, outfitStyle, accessory, isSeated)}
        </g>

        {/* 5. Head, Neck & Face */}
        <g className="pixel-head">
          {/* Neck */}
          <rect x="14" y="19" width="4" height="3" fill={palette.skin.shadow} />
          <rect x="15" y="19" width="2" height="2" fill={palette.skin.base} />

          {/* Face Base */}
          <rect x="10" y="10" width="12" height="10" fill={palette.skin.base} />
          {/* Face Highlight (Left/Top Light) */}
          <rect x="10" y="10" width="4" height="8" fill={palette.skin.highlight} />
          <rect x="14" y="10" width="4" height="2" fill={palette.skin.highlight} />
          {/* Face Shadow (Right Jaw) */}
          <rect x="20" y="12" width="2" height="8" fill={palette.skin.shadow} />
          <rect x="18" y="18" width="4" height="2" fill={palette.skin.shadow} />
          <rect x="12" y="19" width="8" height="1" fill={palette.skin.deepShadow} />

          {/* Cheeks Blush */}
          <rect x="11" y="16" width="2" height="1" fill={palette.blush} />
          <rect x="19" y="16" width="2" height="1" fill={palette.blush} />

          {/* Eyes (3/4 Isometric Perspective) */}
          {status === 'error' ? (
            // Error Alarmed Squint
            <g className="pixel-eyes">
              <rect x="12" y="13" width="3" height="2" fill={palette.ink} />
              <rect x="18" y="13" width="3" height="2" fill={palette.ink} />
              <rect x="13" y="14" width="1" height="1" fill="#ff4d4f" />
              <rect x="19" y="14" width="1" height="1" fill="#ff4d4f" />
            </g>
          ) : (
            // Standard Expressive 3/4 Pixel Eyes
            <g className="pixel-eyes">
              {/* Left Eye */}
              <rect x="12" y="13" width="3" height="3" fill={palette.ink} />
              <rect x="13" y="13" width="2" height="3" fill={palette.eyeColor} />
              <rect x="13" y="13" width="1" height="1" fill={palette.eyeShine} />

              {/* Right Eye */}
              <rect x="18" y="13" width="3" height="3" fill={palette.ink} />
              <rect x="18" y="13" width="2" height="3" fill={palette.eyeColor} />
              <rect x="18" y="13" width="1" height="1" fill={palette.eyeShine} />

              {/* Eyebrows */}
              <rect x="12" y="11" width="3" height="1" fill={palette.hair.shadow} />
              <rect x="18" y="11" width="3" height="1" fill={palette.hair.shadow} />

              {/* Nose & Mouth */}
              <rect x="16" y="15" width="1" height="1" fill={palette.skin.shadow} />
              <rect x="15" y="17" width="2" height="1" fill={palette.skin.deepShadow} />
            </g>
          )}

          {/* Error Sweat Drop */}
          {status === 'error' && (
            <g className="pixel-sweat-drop">
              <rect x="23" y="11" width="2" height="3" rx="1" fill="#61afef" />
              <rect x="24" y="11" width="1" height="1" fill="#ffffff" />
            </g>
          )}

          {/* Thinking Thought Particle */}
          {status === 'thinking' && (
            <g className="pixel-thought-spark">
              <rect x="22" y="6" width="3" height="3" fill="#e5c07b" />
              <rect x="23" y="5" width="1" height="5" fill="#ffd580" />
              <rect x="21" y="7" width="5" height="1" fill="#ffd580" />
              <rect x="23" y="7" width="1" height="1" fill="#ffffff" />
            </g>
          )}
        </g>

        {/* 6. Hair Layer */}
        <g className="pixel-hair">
          {renderHairstyle(hairstyle, palette)}
        </g>

        {/* 7. Accessories Layer */}
        {accessory && (
          <g className="pixel-accessory">
            {renderAccessory(accessory, palette, status)}
          </g>
        )}
      </g>
    </svg>
  )
}

/**
 * Renders modular outfit styles.
 */
function renderOutfit(
  style: AgentOutfitStyle,
  palette: AgentPixelPalette,
  isSeated: boolean
): React.ReactElement {
  const yOffset = isSeated ? 1 : 0

  switch (style) {
    case 'hoodie':
      return (
        <g className="outfit-hoodie">
          {/* Main Hoodie Body */}
          <rect x="9" y={21 + yOffset} width="14" height="11" fill={palette.outfit.base} />
          <rect x="10" y={21 + yOffset} width="4" height="9" fill={palette.outfit.highlight} />
          <rect x="20" y={22 + yOffset} width="3" height="10" fill={palette.outfit.shadow} />
          {/* Hood Collar */}
          <rect x="11" y={19 + yOffset} width="10" height="3" fill={palette.outfit.shadow} />
          <rect x="13" y={20 + yOffset} width="6" height="2" fill={palette.outfit.deepShadow} />
          {/* Drawstrings */}
          <rect x="13" y={22 + yOffset} width="1" height="4" fill={palette.accent.highlight} />
          <rect x="18" y={22 + yOffset} width="1" height="4" fill={palette.accent.highlight} />
          {/* Front Kangaroo Pouch */}
          <rect x="11" y={27 + yOffset} width="10" height="4" fill={palette.outfit.shadow} />
          <rect x="12" y={27 + yOffset} width="8" height="3" fill={palette.outfit.base} />
          <rect x="9" y={31 + yOffset} width="14" height="2" fill={palette.outfit.deepShadow} />
        </g>
      )

    case 'blazer':
      return (
        <g className="outfit-blazer">
          {/* Inner Shirt & Tie */}
          <rect x="13" y={21 + yOffset} width="6" height="10" fill="#f0f3f8" />
          <rect x="15" y={22 + yOffset} width="2" height="7" fill={palette.accent.base} />
          <rect x="15" y={22 + yOffset} width="2" height="2" fill={palette.accent.highlight} />
          {/* Blazer Left & Right Lapels */}
          <rect x="9" y={21 + yOffset} width="4" height="11" fill={palette.outfit.highlight} />
          <rect x="19" y={21 + yOffset} width="4" height="11" fill={palette.outfit.shadow} />
          <rect x="10" y={22 + yOffset} width="4" height="10" fill={palette.outfit.base} />
          <rect x="18" y={22 + yOffset} width="4" height="10" fill={palette.outfit.base} />
          {/* Blazer Button & Creases */}
          <rect x="15" y={29 + yOffset} width="2" height="1" fill={palette.accent.highlight} />
          <rect x="9" y={31 + yOffset} width="14" height="1" fill={palette.outfit.deepShadow} />
        </g>
      )

    case 'turtleneck':
      return (
        <g className="outfit-turtleneck">
          {/* High Ribbed Collar */}
          <rect x="12" y={19 + yOffset} width="8" height="4" fill={palette.outfit.base} />
          <rect x="13" y={19 + yOffset} width="6" height="1" fill={palette.outfit.highlight} />
          <rect x="12" y={21 + yOffset} width="8" height="1" fill={palette.outfit.shadow} />
          {/* Knit Torso */}
          <rect x="9" y={22 + yOffset} width="14" height="10" fill={palette.outfit.base} />
          <rect x="10" y={22 + yOffset} width="4" height="9" fill={palette.outfit.highlight} />
          <rect x="19" y={23 + yOffset} width="4" height="9" fill={palette.outfit.shadow} />
          {/* Accent Brooch */}
          <rect x="15" y={24 + yOffset} width="2" height="2" fill={palette.accent.base} />
          <rect x="15" y={24 + yOffset} width="1" height="1" fill={palette.accent.highlight} />
        </g>
      )

    case 'jacket':
      return (
        <g className="outfit-jacket">
          {/* Inner Tee */}
          <rect x="13" y={21 + yOffset} width="6" height="10" fill={palette.accent.base} />
          <rect x="14" y={22 + yOffset} width="4" height="4" fill={palette.accent.highlight} />
          {/* Outer Jacket Left & Right */}
          <rect x="9" y={21 + yOffset} width="4" height="11" fill={palette.outfit.highlight} />
          <rect x="19" y={21 + yOffset} width="4" height="11" fill={palette.outfit.shadow} />
          {/* Zipper Track */}
          <rect x="13" y={21 + yOffset} width="1" height="11" fill="#abb2bf" />
          <rect x="18" y={21 + yOffset} width="1" height="11" fill="#abb2bf" />
        </g>
      )

    case 'tech_tee':
    default:
      return (
        <g className="outfit-tech-tee">
          {/* Base Tee */}
          <rect x="9" y={21 + yOffset} width="14" height="11" fill={palette.outfit.base} />
          {/* Highlight & Shadow */}
          <rect x="10" y={21 + yOffset} width="5" height="9" fill={palette.outfit.highlight} />
          <rect x="19" y={22 + yOffset} width="4" height="10" fill={palette.outfit.shadow} />
          {/* Crew Neck Opening */}
          <rect x="13" y={21 + yOffset} width="6" height="2" fill={palette.skin.base} />
          <rect x="13" y={22 + yOffset} width="6" height="1" fill={palette.skin.shadow} />
          {/* Lanyard & ID Badge */}
          <rect x="15" y={22 + yOffset} width="1" height="7" fill={palette.accent.base} />
          <rect x="14" y={27 + yOffset} width="3" height="3" fill="#f0f3f8" />
          <rect x="15" y={28 + yOffset} width="1" height="1" fill={palette.accent.base} />
        </g>
      )
  }
}

/**
 * Renders arms, hands, and state-driven animations/props.
 */
function renderArms(
  status: OfficeAgent['status'],
  palette: AgentPixelPalette,
  _outfitStyle: AgentOutfitStyle,
  _accessory?: string,
  isSeated: boolean = false
): React.ReactElement {
  const yOffset = isSeated ? 1 : 0

  if (status === 'working') {
    // Rapid Typing Pose with Mini Keyboard & Glare
    return (
      <g className="pixel-arms-working">
        {/* Sleeves */}
        <rect x="7" y={23 + yOffset} width="4" height="6" fill={palette.outfit.highlight} />
        <rect x="21" y={23 + yOffset} width="4" height="6" fill={palette.outfit.shadow} />
        {/* Left Typing Hand */}
        <g className="pixel-hand-left">
          <rect x="10" y={28 + yOffset} width="4" height="3" fill={palette.skin.base} />
          <rect x="10" y={28 + yOffset} width="2" height="2" fill={palette.skin.highlight} />
        </g>
        {/* Right Typing Hand */}
        <g className="pixel-hand-right">
          <rect x="18" y={28 + yOffset} width="4" height="3" fill={palette.skin.base} />
          <rect x="18" y={28 + yOffset} width="2" height="2" fill={palette.skin.highlight} />
        </g>
        {/* Glowing Mini Keyboard */}
        <rect x="9" y={31 + yOffset} width="14" height="3" fill={palette.ink} />
        <rect x="10" y={32 + yOffset} width="3" height="1" fill={palette.accent.highlight} />
        <rect x="14" y={32 + yOffset} width="4" height="1" fill={palette.accent.highlight} />
        <rect x="19" y={32 + yOffset} width="3" height="1" fill={palette.accent.highlight} />
        {/* Screen Glare Floating Reflection */}
        <rect
          className="pixel-screen-glare"
          x="8"
          y={34 + yOffset}
          width="16"
          height="1"
          fill={palette.accent.highlight}
          opacity="0.75"
        />
      </g>
    )
  }

  if (status === 'thinking') {
    // Contemplative Pose (Hand on chin)
    return (
      <g className="pixel-arms-thinking">
        {/* Left Arm Resting Across Torso */}
        <rect x="7" y={23 + yOffset} width="3" height="7" fill={palette.outfit.highlight} />
        <rect x="10" y={28 + yOffset} width="7" height="3" fill={palette.outfit.base} />
        <rect x="16" y={28 + yOffset} width="2" height="2" fill={palette.skin.base} />
        {/* Right Arm Raised to Chin */}
        <rect x="21" y={23 + yOffset} width="4" height="5" fill={palette.outfit.shadow} />
        <rect x="19" y={19 + yOffset} width="4" height="5" fill={palette.skin.base} />
        <rect x="19" y={18 + yOffset} width="3" height="2" fill={palette.skin.highlight} />
      </g>
    )
  }

  if (status === 'break') {
    // Break / Coffee Sipping Pose with Rising Steam
    return (
      <g className="pixel-arms-break">
        {/* Left Arm Relaxed */}
        <rect x="6" y={22 + yOffset} width="3" height="9" fill={palette.outfit.highlight} />
        <rect x="6" y={30 + yOffset} width="3" height="3" fill={palette.skin.base} />
        {/* Right Arm Holding Ceramic Mug */}
        <rect x="21" y={22 + yOffset} width="4" height="6" fill={palette.outfit.shadow} />
        <rect x="23" y={27 + yOffset} width="3" height="3" fill={palette.skin.base} />
        {/* Coffee Mug */}
        <rect x="24" y={25 + yOffset} width="6" height="6" rx="1" fill="#f0f3f8" />
        <rect x="25" y={26 + yOffset} width="4" height="2" fill="#5c3a21" />
        <rect x="29" y={27 + yOffset} width="2" height="3" fill="#f0f3f8" />
        {/* Rising Steam Particles */}
        <rect
          className="pixel-coffee-steam-1"
          x="25"
          y={22 + yOffset}
          width="1"
          height="2"
          fill="rgba(255, 255, 255, 0.85)"
        />
        <rect
          className="pixel-coffee-steam-2"
          x="27"
          y={21 + yOffset}
          width="1"
          height="2"
          fill="rgba(255, 255, 255, 0.85)"
        />
      </g>
    )
  }

  if (status === 'meeting') {
    // Active Conversational Gesture
    return (
      <g className="pixel-arms-meeting">
        {/* Left Arm Relaxed */}
        <rect x="6" y={22 + yOffset} width="3" height="9" fill={palette.outfit.highlight} />
        <rect x="6" y={30 + yOffset} width="3" height="3" fill={palette.skin.base} />
        {/* Right Gesturing Arm */}
        <g className="pixel-gesture-arm">
          <rect x="21" y={21 + yOffset} width="5" height="4" fill={palette.outfit.shadow} />
          <rect x="24" y={18 + yOffset} width="4" height="4" fill={palette.skin.base} />
          <rect x="25" y={17 + yOffset} width="3" height="2" fill={palette.skin.highlight} />
        </g>
      </g>
    )
  }

  if (status === 'error') {
    // Frustrated / Alarmed Pose (Hands clutching head)
    return (
      <g className="pixel-arms-error">
        {/* Left Hand to Head */}
        <rect x="6" y={16 + yOffset} width="4" height="6" fill={palette.outfit.highlight} />
        <rect x="8" y={12 + yOffset} width="3" height="4" fill={palette.skin.base} />
        {/* Right Hand to Head */}
        <rect x="22" y={16 + yOffset} width="4" height="6" fill={palette.outfit.shadow} />
        <rect x="21" y={12 + yOffset} width="3" height="4" fill={palette.skin.base} />
      </g>
    )
  }

  // Default Idle Stance
  return (
    <g className="pixel-arms-idle">
      {/* Left Arm */}
      <rect x="6" y={22 + yOffset} width="3" height="9" fill={palette.outfit.highlight} />
      <rect x="6" y={30 + yOffset} width="3" height="3" fill={palette.skin.base} />
      {/* Right Arm */}
      <rect x="23" y={22 + yOffset} width="3" height="9" fill={palette.outfit.shadow} />
      <rect x="23" y={30 + yOffset} width="3" height="3" fill={palette.skin.base} />
    </g>
  )
}

/**
 * Renders distinct modular pixel hairstyles.
 */
function renderHairstyle(
  style: AgentHairstyle,
  palette: AgentPixelPalette
): React.ReactElement {
  switch (style) {
    case 'tousled':
      return (
        <g className="hair-tousled">
          {/* Spiky Volume Crown */}
          <rect x="8" y="7" width="16" height="6" fill={palette.hair.base} />
          <rect x="10" y="5" width="4" height="3" fill={palette.hair.highlight} />
          <rect x="15" y="4" width="4" height="4" fill={palette.hair.highlight} />
          <rect x="20" y="6" width="3" height="3" fill={palette.hair.base} />
          {/* Tousled Bangs */}
          <rect x="9" y="10" width="4" height="4" fill={palette.hair.highlight} />
          <rect x="14" y="10" width="3" height="3" fill={palette.hair.highlight} />
          <rect x="19" y="10" width="4" height="4" fill={palette.hair.shadow} />
          {/* Sideburns */}
          <rect x="8" y="11" width="2" height="5" fill={palette.hair.shadow} />
          <rect x="22" y="11" width="2" height="5" fill={palette.hair.shadow} />
        </g>
      )

    case 'slick':
      return (
        <g className="hair-slick">
          {/* Clean Combed Crown */}
          <rect x="9" y="7" width="14" height="6" fill={palette.hair.base} />
          <rect x="11" y="7" width="8" height="2" fill={palette.hair.highlight} />
          <rect x="12" y="9" width="6" height="1" fill={palette.hair.highlight} />
          {/* Side & Back Taper */}
          <rect x="8" y="10" width="3" height="6" fill={palette.hair.shadow} />
          <rect x="21" y="10" width="3" height="6" fill={palette.hair.deepShadow} />
          <rect x="10" y="10" width="12" height="2" fill={palette.hair.base} />
        </g>
      )

    case 'afro':
      return (
        <g className="hair-afro">
          {/* Big Rounded Volume */}
          <rect x="6" y="5" width="20" height="9" rx="2" fill={palette.hair.base} />
          <rect x="8" y="4" width="16" height="3" rx="1" fill={palette.hair.highlight} />
          <rect x="9" y="4" width="6" height="2" fill={palette.hair.highlight} />
          <rect x="5" y="8" width="3" height="7" rx="1" fill={palette.hair.base} />
          <rect x="24" y="8" width="3" height="7" rx="1" fill={palette.hair.deepShadow} />
          <rect x="7" y="13" width="3" height="4" fill={palette.hair.shadow} />
          <rect x="22" y="13" width="3" height="4" fill={palette.hair.deepShadow} />
        </g>
      )

    case 'ponytail':
      return (
        <g className="hair-ponytail">
          {/* Sleek Crown */}
          <rect x="9" y="7" width="14" height="6" fill={palette.hair.base} />
          <rect x="11" y="7" width="6" height="2" fill={palette.hair.highlight} />
          {/* Sideburns & Bangs */}
          <rect x="8" y="10" width="3" height="5" fill={palette.hair.shadow} />
          <rect x="21" y="10" width="3" height="5" fill={palette.hair.shadow} />
          <rect x="11" y="10" width="10" height="2" fill={palette.hair.base} />
          {/* Ponytail Scrunchie */}
          <rect x="22" y="7" width="3" height="3" fill={palette.accent.base} />
          <rect x="23" y="7" width="1" height="1" fill={palette.accent.highlight} />
          {/* Flowing Tail */}
          <rect x="24" y="9" width="4" height="10" rx="1" fill={palette.hair.base} />
          <rect x="25" y="10" width="2" height="8" fill={palette.hair.highlight} />
          <rect x="26" y="17" width="2" height="4" fill={palette.hair.shadow} />
        </g>
      )

    case 'bob':
      return (
        <g className="hair-bob">
          {/* Rounded Top */}
          <rect x="8" y="7" width="16" height="6" fill={palette.hair.base} />
          <rect x="11" y="7" width="7" height="2" fill={palette.hair.highlight} />
          {/* Blunt Bangs */}
          <rect x="10" y="10" width="12" height="3" fill={palette.hair.base} />
          <rect x="11" y="10" width="5" height="1" fill={palette.hair.highlight} />
          {/* Framing Side Bob Drapes */}
          <rect x="7" y="11" width="4" height="8" fill={palette.hair.highlight} />
          <rect x="8" y="12" width="3" height="7" fill={palette.hair.base} />
          <rect x="21" y="11" width="4" height="8" fill={palette.hair.deepShadow} />
          <rect x="21" y="12" width="3" height="7" fill={palette.hair.shadow} />
        </g>
      )

    case 'pixie':
      return (
        <g className="hair-pixie">
          {/* Cropped Crown */}
          <rect x="9" y="7" width="14" height="5" fill={palette.hair.base} />
          <rect x="11" y="6" width="6" height="3" fill={palette.hair.highlight} />
          {/* Sweeping Asymmetric Fringe */}
          <rect x="11" y="9" width="11" height="4" fill={palette.hair.highlight} />
          <rect x="15" y="11" width="6" height="3" fill={palette.hair.base} />
          {/* Short Taper Left, Longer Right */}
          <rect x="8" y="10" width="2" height="4" fill={palette.hair.shadow} />
          <rect x="21" y="10" width="3" height="6" fill={palette.hair.deepShadow} />
        </g>
      )

    case 'short':
    default:
      return (
        <g className="hair-short">
          {/* Standard Classic Crop */}
          <rect x="9" y="7" width="14" height="6" fill={palette.hair.base} />
          <rect x="11" y="7" width="8" height="2" fill={palette.hair.highlight} />
          {/* Sideburns */}
          <rect x="8" y="11" width="3" height="4" fill={palette.hair.shadow} />
          <rect x="21" y="11" width="3" height="4" fill={palette.hair.shadow} />
          {/* Front Fringe */}
          <rect x="11" y="10" width="8" height="2" fill={palette.hair.base} />
          <rect x="11" y="10" width="4" height="1" fill={palette.hair.highlight} />
        </g>
      )
  }
}

/**
 * Renders accessories (glasses, headphones, hat, laptop, etc.).
 */
function renderAccessory(
  accessory: NonNullable<OfficeAgent['avatar']['accessory']>,
  palette: AgentPixelPalette,
  _status: OfficeAgent['status']
): React.ReactElement | null {
  switch (accessory) {
    case 'glasses':
      return (
        <g className="acc-glasses">
          {/* Frame Outline */}
          <rect x="11" y="12" width="5" height="4" fill="none" stroke={palette.accessory.base} strokeWidth="1" />
          <rect x="17" y="12" width="5" height="4" fill="none" stroke={palette.accessory.base} strokeWidth="1" />
          {/* Bridge & Side Arms */}
          <rect x="15" y="13" width="3" height="1" fill={palette.accessory.base} />
          <rect x="9" y="13" width="2" height="1" fill={palette.accessory.base} />
          <rect x="22" y="13" width="2" height="1" fill={palette.accessory.base} />
          {/* Lens Specular Glint */}
          <rect x="12" y="13" width="1" height="1" fill="rgba(255, 255, 255, 0.75)" />
          <rect x="18" y="13" width="1" height="1" fill="rgba(255, 255, 255, 0.75)" />
        </g>
      )

    case 'headphones':
      return (
        <g className="acc-headphones">
          {/* Padded Headband */}
          <rect x="9" y="5" width="14" height="3" rx="1" fill={palette.accessory.shadow} />
          <rect x="11" y="5" width="10" height="1" fill={palette.accessory.highlight} />
          {/* Left Chunky Ear Cup */}
          <rect x="6" y="11" width="4" height="7" rx="1" fill={palette.accessory.base} />
          <rect x="7" y="12" width="2" height="5" fill={palette.accessory.highlight} />
          {/* Right Chunky Ear Cup */}
          <rect x="22" y="11" width="4" height="7" rx="1" fill={palette.accessory.shadow} />
          <rect x="23" y="12" width="2" height="5" fill={palette.accessory.base} />
        </g>
      )

    case 'hat':
      return (
        <g className="acc-hat">
          {/* Beanie / Fedora Brim */}
          <rect x="6" y="8" width="20" height="3" rx="1" fill={palette.accessory.base} />
          <rect x="7" y="8" width="18" height="1" fill={palette.accessory.highlight} />
          {/* Hat Crown */}
          <rect x="9" y="3" width="14" height="6" rx="1" fill={palette.accessory.base} />
          <rect x="10" y="3" width="8" height="2" fill={palette.accessory.highlight} />
          {/* Accent Ribbon */}
          <rect x="9" y="7" width="14" height="2" fill={palette.accent.base} />
          <rect x="10" y="7" width="6" height="1" fill={palette.accent.highlight} />
        </g>
      )

    case 'laptop':
      return (
        <g className="acc-laptop">
          {/* Mini Cyber Laptop */}
          <rect x="10" y="27" width="12" height="7" rx="1" fill="#1e222d" />
          <rect x="11" y="28" width="10" height="5" fill={palette.accent.base} opacity="0.9" />
          <rect x="12" y="29" width="4" height="1" fill="#ffffff" />
          <rect x="12" y="31" width="6" height="1" fill="#ffffff" opacity="0.75" />
          <rect x="9" y="34" width="14" height="2" rx="1" fill="#2d3343" />
        </g>
      )

    case 'hoodie':
      return (
        <g className="acc-hoodie-up">
          {/* Hood Pulled Up Around Face */}
          <rect x="7" y="6" width="18" height="13" rx="2" fill="none" stroke={palette.outfit.base} strokeWidth="2" />
          <rect x="8" y="6" width="16" height="2" fill={palette.outfit.highlight} />
        </g>
      )

    default:
      return null
  }
}

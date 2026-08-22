import React, { useState } from 'react'
import { X, UserPlus, Sparkles, Wand2 } from 'lucide-react'
import { useOfficeStore } from '../../stores/officeStore'
import {
  AgentRole,
  AgentHairstyle,
  AgentOutfitStyle,
  OfficeAgent
} from '../../../shared/types'
import { PixelCharacterSprite } from './pixel/PixelCharacterSprite'

const RANDOM_NAMES = [
  'Elena Rostova',
  'Devon Vance',
  'Sora Tanaka',
  'Marcus Drake',
  'Nadia Thorne',
  'Jordan Reed',
  'Aria Sterling',
  'Leo Mercer',
  'Valerie Cross',
  'Quinn Callahan'
]

const SKIN_PALETTES = ['#fcd2b0', '#f8c09a', '#d6a374', '#aa724b', '#6a462f']
const HAIR_PALETTES = ['#1a1a24', '#2b211b', '#382a21', '#7a4220', '#e5c07b', '#c678dd']
const OUTFIT_PALETTES = ['#61afef', '#e06c75', '#98c379', '#e5c07b', '#c678dd', '#d19a66', '#2c3e50']

export const HireAgentModal: React.FC = () => {
  const { isHireModalOpen, setIsHireModalOpen, hireAgent, desks, agents } = useOfficeStore()

  const [role, setRole] = useState<AgentRole>('coder')
  const [name, setName] = useState('Elena Rostova')
  const [roleTitle, setRoleTitle] = useState('Fullstack Software Engineer')
  const [model, setModel] = useState('claude-3-7-sonnet')
  const [skinColor, setSkinColor] = useState('#f8c09a')
  const [hairColor, setHairColor] = useState('#382a21')
  const [outfitColor, setOutfitColor] = useState('#61afef')
  const [accentColor, setAccentColor] = useState('#e5c07b')
  const [hairstyle, setHairstyle] = useState<AgentHairstyle>('short')
  const [outfitStyle, setOutfitStyle] = useState<AgentOutfitStyle>('tech_tee')
  const [accessory, setAccessory] = useState<'glasses' | 'headphones' | 'coffee' | 'hat' | 'hoodie' | 'laptop'>('headphones')
  const [previewState, setPreviewState] = useState<OfficeAgent['status']>('idle')
  const [systemPrompt, setSystemPrompt] = useState('')

  // Occupied desk tracking for desk assignment step
  const occupiedDeskIds = new Set(agents.map((a) => a.deskId))
  const firstAvailableDesk = desks.find((d) => !occupiedDeskIds.has(d.id)) || desks[0]
  const [selectedDeskId, setSelectedDeskId] = useState<string>(firstAvailableDesk?.id || 'desk-coder')

  if (!isHireModalOpen) return null

  const handleRoleChange = (newRole: AgentRole) => {
    setRole(newRole)
    switch (newRole) {
      case 'orchestrator':
        setRoleTitle('Studio Coordinator & Orchestrator')
        setModel('gpt-4o')
        setOutfitColor('#e06c75')
        setAccentColor('#e5c07b')
        setHairstyle('slick')
        setOutfitStyle('blazer')
        setAccessory('glasses')
        break
      case 'coder':
        setRoleTitle('Fullstack Software Engineer')
        setModel('claude-3-7-sonnet')
        setOutfitColor('#61afef')
        setAccentColor('#56b6c2')
        setHairstyle('short')
        setOutfitStyle('tech_tee')
        setAccessory('headphones')
        break
      case 'researcher':
        setRoleTitle('Deep Research Analyst')
        setModel('gemini-2.0-flash')
        setOutfitColor('#98c379')
        setAccentColor('#e5c07b')
        setHairstyle('ponytail')
        setOutfitStyle('turtleneck')
        setAccessory('laptop')
        break
      case 'reviewer':
        setRoleTitle('QA & Security Reviewer')
        setModel('llama-3.3-70b')
        setOutfitColor('#c678dd')
        setAccentColor('#e06c75')
        setHairstyle('tousled')
        setOutfitStyle('hoodie')
        setAccessory('hoodie')
        break
      case 'devops':
        setRoleTitle('DevOps & Engine Runner')
        setModel('qwen2.5-coder-32b')
        setOutfitColor('#d19a66')
        setAccentColor('#56b6c2')
        setHairstyle('short')
        setOutfitStyle('jacket')
        setAccessory('coffee')
        break
      default:
        setRoleTitle('Specialist AI Agent')
        setModel('gpt-4o')
        setOutfitColor('#abb2bf')
        setAccentColor('#e06c75')
        setHairstyle('short')
        setOutfitStyle('tech_tee')
        setAccessory('glasses')
    }
  }

  const generateRandomName = () => {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]
    setName(random)
  }

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const newAgent = hireAgent({
      name: name.trim(),
      role,
      roleTitle: roleTitle.trim() || undefined,
      model,
      systemPrompt: systemPrompt.trim() || undefined,
      avatar: {
        skinColor,
        hairColor,
        outfitColor,
        accentColor,
        hairstyle,
        outfitStyle,
        accessory
      }
    })

    // If a custom desk was selected, update agent desk
    if (selectedDeskId && newAgent) {
      useOfficeStore.getState().updateAgent(newAgent.id, { deskId: selectedDeskId })
    }
  }

  const previewAgent: OfficeAgent = {
    id: 'preview-agent',
    name: name || 'Agent Preview',
    role,
    roleTitle,
    avatar: {
      skinColor,
      hairColor,
      outfitColor,
      accentColor,
      hairstyle,
      outfitStyle,
      accessory
    },
    status: previewState,
    deskId: selectedDeskId,
    position: { x: 0, y: 0 },
    model,
    providerId: 'preview',
    systemPrompt: '',
    assignedSkillIds: [],
    level: 1,
    xp: 0,
    xpToNextLevel: 250,
    stats: {
      tasksCompleted: 0,
      messagesSent: 0,
      toolCallsCount: 0,
      coffeeBreaksCount: 0
    },
    logs: [],
    memories: [],
    tokenBudget: 100000,
    tokensUsed: 0,
    unlockedAchievements: []
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-modal-backdrop)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={() => setIsHireModalOpen(false)}
    >
      <div
        style={{
          width: 580,
          maxHeight: '92vh',
          backgroundColor: 'var(--office-bg-dock)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--office-border-medium)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--office-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'rgba(97, 175, 239, 0.15)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <UserPlus size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Deploy New Agent
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Customize 16-bit pixel sprite & assign to an office workstation
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsHireModalOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleDeploy}
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          {/* Top Row: Live Pixel Preview Card + Role Preset */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
            {/* Live Pixel Preview Box */}
            <div
              style={{
                width: 140,
                backgroundColor: 'var(--office-bg-stage)',
                border: '1px solid var(--office-border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Pixel Preview
              </div>

              <div style={{ padding: '6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PixelCharacterSprite agent={previewAgent} scale={1.5} />
              </div>

              {/* State Preview Switcher */}
              <div style={{ display: 'flex', gap: 3 }}>
                {(['idle', 'working', 'break', 'error'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPreviewState(st)}
                    style={{
                      padding: '2px 4px',
                      fontSize: 8,
                      borderRadius: 3,
                      border: '1px solid var(--office-border-subtle)',
                      background: previewState === st ? 'var(--brand)' : 'var(--office-bg-card)',
                      color: previewState === st ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Role Preset Selector */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                SPECIALTY ROLE PRESET
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {(['coder', 'researcher', 'reviewer', 'devops', 'orchestrator', 'custom'] as const).map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      className="office-btn"
                      onClick={() => handleRoleChange(r)}
                      style={{
                        justifyContent: 'center',
                        textTransform: 'capitalize',
                        borderColor: role === r ? 'var(--brand)' : 'var(--office-border-subtle)',
                        backgroundColor: role === r ? 'rgba(224, 108, 117, 0.15)' : 'var(--office-bg-card)',
                        color: role === r ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: role === r ? 600 : 400,
                        padding: '6px 8px'
                      }}
                    >
                      {r}
                    </button>
                  )
                )}
              </div>

              {/* Workstation Desk Assignment */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  WORKSTATION DESK ASSIGNMENT
                </label>
                <select
                  value={selectedDeskId}
                  onChange={(e) => setSelectedDeskId(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--office-bg-input)',
                    border: '1px solid var(--office-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-primary)',
                    padding: '5px 8px',
                    fontSize: 11
                  }}
                >
                  {desks.map((d) => {
                    const occupant = agents.find((a) => a.deskId === d.id)
                    return (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.zone.toUpperCase()}) {occupant ? `— Occupied by ${occupant.name}` : '— Available ✓'}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Name & Job Title */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                AGENT FULL NAME
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent Name"
                  required
                  style={{
                    flex: 1,
                    background: 'var(--office-bg-input)',
                    border: '1px solid var(--office-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-primary)',
                    padding: '5px 8px',
                    fontSize: 11
                  }}
                />
                <button
                  type="button"
                  className="office-btn"
                  onClick={generateRandomName}
                  title="Generate Random Name"
                  style={{ padding: '4px 8px' }}
                >
                  <Wand2 size={12} />
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                JOB TITLE
              </label>
              <input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Job Title"
                required
                style={{
                  width: '100%',
                  background: 'var(--office-bg-input)',
                  border: '1px solid var(--office-border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  padding: '5px 8px',
                  fontSize: 11
                }}
              />
            </div>
          </div>

          {/* Pixel Customization: Hair & Outfit Styles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                HAIRSTYLE
              </label>
              <select
                value={hairstyle}
                onChange={(e) => setHairstyle(e.target.value as AgentHairstyle)}
                style={{
                  width: '100%',
                  background: 'var(--office-bg-input)',
                  border: '1px solid var(--office-border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  padding: '5px 8px',
                  fontSize: 11
                }}
              >
                <option value="short">Short Crop</option>
                <option value="tousled">Tousled Anime</option>
                <option value="slick">Slicked Back</option>
                <option value="afro">Curly Afro</option>
                <option value="ponytail">High Ponytail</option>
                <option value="bob">Classic Bob</option>
                <option value="pixie">Chic Pixie</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                OUTFIT STYLE
              </label>
              <select
                value={outfitStyle}
                onChange={(e) => setOutfitStyle(e.target.value as AgentOutfitStyle)}
                style={{
                  width: '100%',
                  background: 'var(--office-bg-input)',
                  border: '1px solid var(--office-border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  padding: '5px 8px',
                  fontSize: 11
                }}
              >
                <option value="tech_tee">Tech Tee & Badge</option>
                <option value="hoodie">Street Hoodie</option>
                <option value="blazer">Executive Blazer & Tie</option>
                <option value="turtleneck">Knit Turtleneck</option>
                <option value="jacket">Open Zip Jacket</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                ACCESSORY
              </label>
              <select
                value={accessory}
                onChange={(e) => setAccessory(e.target.value as any)}
                style={{
                  width: '100%',
                  background: 'var(--office-bg-input)',
                  border: '1px solid var(--office-border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  padding: '5px 8px',
                  fontSize: 11
                }}
              >
                <option value="headphones">Headphones</option>
                <option value="glasses">Glasses</option>
                <option value="coffee">Coffee Mug</option>
                <option value="hoodie">Hoodie Up</option>
                <option value="laptop">Cyber Laptop</option>
                <option value="hat">Cap / Beanie</option>
              </select>
            </div>
          </div>

          {/* Color Palettes (Skin, Hair, Outfit) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {/* Skin Palette */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                SKIN TONE
              </label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {SKIN_PALETTES.map((color) => (
                  <div
                    key={color}
                    onClick={() => setSkinColor(color)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: color,
                      cursor: 'pointer',
                      border: skinColor === color ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: skinColor === color ? `0 0 6px ${color}` : 'none'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Hair Palette */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                HAIR COLOR
              </label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {HAIR_PALETTES.map((color) => (
                  <div
                    key={color}
                    onClick={() => setHairColor(color)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: color,
                      cursor: 'pointer',
                      border: hairColor === color ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: hairColor === color ? `0 0 6px ${color}` : 'none'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Outfit Palette */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                OUTFIT COLOR
              </label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {OUTFIT_PALETTES.map((color) => (
                  <div
                    key={color}
                    onClick={() => setOutfitColor(color)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: color,
                      cursor: 'pointer',
                      border: outfitColor === color ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: outfitColor === color ? `0 0 6px ${color}` : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Model String */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              INFERENCE MODEL
            </label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model string (e.g. claude-3-7-sonnet, gpt-4o, llama-3.3-70b)"
              required
              style={{
                width: '100%',
                background: 'var(--office-bg-input)',
                border: '1px solid var(--office-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text-primary)',
                padding: '5px 8px',
                fontSize: 11
              }}
            />
          </div>

          {/* Modal Action Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 6,
              paddingTop: 10,
              borderTop: '1px solid var(--office-border-subtle)'
            }}
          >
            <button
              type="button"
              className="office-btn"
              onClick={() => setIsHireModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="office-btn primary">
              <Sparkles size={13} /> Deploy to Office
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

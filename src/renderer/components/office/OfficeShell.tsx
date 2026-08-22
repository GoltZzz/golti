import React, { useState } from 'react'
import { OfficeTopBar } from './OfficeTopBar'
import { OfficeFloorCanvas } from './OfficeFloorCanvas'
import { OfficeTaskRail } from './OfficeTaskRail'
import { OfficeDock } from './OfficeDock'
import { HireAgentModal } from './HireAgentModal'

export const OfficeShell: React.FC = () => {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)

  return (
    <div className="office-shell">
      {/* 1. TopBar */}
      <OfficeTopBar />

      {/* 2. Isometric Floor Stage */}
      <OfficeFloorCanvas hoveredTaskId={hoveredTaskId} />

      {/* 3. Task Rail Horizontal Work Strip */}
      <OfficeTaskRail
        hoveredTaskId={hoveredTaskId}
        onHoverTask={setHoveredTaskId}
      />

      {/* 4. Right Dock (Persistent Tabbed Container) */}
      <OfficeDock />

      {/* 5. Modals */}
      <HireAgentModal />
    </div>
  )
}

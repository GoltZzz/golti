import React, { useEffect } from 'react'
import { OfficeShell } from './OfficeShell'
import { useOfficeStore } from '../../stores/officeStore'

export const OfficeView: React.FC = () => {
  const subscribeToStreams = useOfficeStore((s) => s.subscribeToStreams)
  const hydrate = useOfficeStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => subscribeToStreams(), [subscribeToStreams])

  return <OfficeShell />
}

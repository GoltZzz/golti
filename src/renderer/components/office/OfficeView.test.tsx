// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { OfficeView } from './OfficeView'
import { useOfficeStore } from '../../stores/officeStore'

describe('OfficeView Rebuild', () => {
  beforeEach(() => {
    useOfficeStore.getState().resetToDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders topbar with studio brand, momentum progress bar, and hire button', () => {
    const { container } = render(<OfficeView />)
    const topbar = container.querySelector('.office-topbar') as HTMLElement
    expect(topbar).toBeTruthy()
    expect(within(topbar).getByText('Golti AI Studio')).toBeTruthy()
    expect(within(topbar).getByText('Hire Agent')).toBeTruthy()
    expect(within(topbar).getByText('Momentum')).toBeTruthy()
  })

  it('renders floor canvas with starter agents', () => {
    render(<OfficeView />)
    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Kai Chen').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Maya Lin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sam Vance').length).toBeGreaterThan(0)
  })

  it('renders persistent right dock with all 4 navigation tabs', () => {
    render(<OfficeView />)
    const dock = screen.getByRole('complementary', { name: /Office Studio Dock/i })
    expect(dock).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: /Roster/i })).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: /Agent/i })).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: /Tasks/i })).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: /Feed/i })).toBeTruthy()
  })

  it('renders org chart in Roster dock tab with Studio Director at top', () => {
    render(<OfficeView />)
    const dock = screen.getByRole('complementary', { name: /Office Studio Dock/i })
    expect(within(dock).getByText('Alex Rivera')).toBeTruthy()
    expect(within(dock).getByText('Engineering & QA Bullpen')).toBeTruthy()
  })

  it('selecting an agent from Roster switches dock to Agent tab with subtabs', () => {
    render(<OfficeView />)
    const dock = screen.getByRole('complementary', { name: /Office Studio Dock/i })
    const kaiRow = within(dock).getByText('Kai Chen')
    fireEvent.click(kaiRow)

    expect(within(dock).getByText('Principal Code Crafter')).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: 'Stream' })).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: 'Tasks' })).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: 'Log' })).toBeTruthy()
    expect(within(dock).getByRole('tab', { name: 'Stats & XP' })).toBeTruthy()
  })

  it('selecting an agent on the floor switches dock to Agent tab', () => {
    render(<OfficeView />)
    const alexAvatar = screen.getByRole('button', { name: /Alex Rivera, Studio Director/i })
    fireEvent.click(alexAvatar)

    const dock = screen.getByRole('complementary', { name: /Office Studio Dock/i })
    expect(within(dock).getByText('Studio Director & Orchestrator')).toBeTruthy()
    expect(alexAvatar.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens Tasks tab in dock showing task ledger when clicking Tasks tab', () => {
    render(<OfficeView />)
    const dock = screen.getByRole('complementary', { name: /Office Studio Dock/i })
    const tasksTab = within(dock).getByRole('tab', { name: /Tasks/i })
    fireEvent.click(tasksTab)

    expect(within(dock).getByText('Studio Tasks Ledger')).toBeTruthy()
    expect(within(dock).getByText(/Summarize the architecture of this codebase/i)).toBeTruthy()
  })

  it('renders horizontal work flow Task Rail at bottom of floor', () => {
    render(<OfficeView />)
    const rail = screen.getByRole('region', { name: /Active workflow task rail/i })
    expect(rail).toBeTruthy()
    expect(within(rail).getByText('Work Flow')).toBeTruthy()
    expect(within(rail).getByText(/Summarize the architecture of this codebase/i)).toBeTruthy()
  })

  it('opens hire modal with desk assignment step when clicking Hire Agent button', () => {
    render(<OfficeView />)
    const hireBtn = screen.getByText('Hire Agent')
    fireEvent.click(hireBtn)

    expect(screen.getByText('Deploy New Agent')).toBeTruthy()
    expect(screen.getByText(/WORKSTATION DESK ASSIGNMENT/i)).toBeTruthy()
  })

  it('describes floor canvas for screen readers with agent counts', () => {
    render(<OfficeView />)
    const floor = screen.getByRole('img', { name: /Studio floor/i })
    expect(floor.getAttribute('aria-label')).toMatch(/4 agents/)
  })

  it('moves focus between agents with arrow keys', () => {
    render(<OfficeView />)
    const agentButtons = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('agent-node'))
    expect(agentButtons.length).toBe(4)

    agentButtons[0].focus()
    expect(document.activeElement).toBe(agentButtons[0])

    fireEvent.keyDown(agentButtons[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(agentButtons[1])

    fireEvent.keyDown(agentButtons[1], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(agentButtons[0])
  })

  it('opens Feed tab in dock showing studio activity entries', () => {
    render(<OfficeView />)
    const dock = screen.getByRole('complementary', { name: /Office Studio Dock/i })
    const feedTab = within(dock).getByRole('tab', { name: /Feed/i })
    fireEvent.click(feedTab)

    // Starter tasks are recorded in feed
    expect(within(dock).getAllByText(/Task queued/i).length).toBeGreaterThan(0)
  })
})

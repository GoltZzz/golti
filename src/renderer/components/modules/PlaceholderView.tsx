import React from 'react'
import { ActiveTab } from '../../stores/sidebarStore'
import { Search, Brain, FileText, Mail, GitCompare, BookOpen, Clock } from 'lucide-react'

interface PlaceholderViewProps {
  tab: ActiveTab
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({ tab }) => {
  const meta: Record<string, { title: string; desc: string; phase: string; icon: React.ReactNode }> = {
    research: {
      title: 'Deep Research',
      desc: 'Multi-step autonomous web searching, source evaluation, and report synthesis.',
      phase: 'Phase 2',
      icon: <Search size={32} />
    },
    memory: {
      title: 'Brain & Memory System',
      desc: 'Vector-indexed long-term memory that retains facts, user preferences, and project context.',
      phase: 'Phase 2',
      icon: <Brain size={32} />
    },
    docs: {
      title: 'Document Editor',
      desc: 'Rich Markdown & WYSIWYG editor with live AI co-writing and multi-tab editing.',
      phase: 'Phase 3',
      icon: <FileText size={32} />
    },
    email: {
      title: 'Email & Calendar',
      desc: 'IMAP/SMTP inbox triage, AI email drafting, and CalDAV calendar schedule management.',
      phase: 'Phase 3',
      icon: <Mail size={32} />
    },
    compare: {
      title: 'Model Comparison Scoreboard',
      desc: 'Side-by-side multi-model benchmarking with blind evaluation and latency metrics.',
      phase: 'Phase 4',
      icon: <GitCompare size={32} />
    },
    cookbook: {
      title: 'Hardware Cookbook',
      desc: 'Hardware scanner and model fit recommendation engine for local Ollama models.',
      phase: 'Phase 4',
      icon: <BookOpen size={32} />
    }
  }

  const item = meta[tab] || {
    title: tab,
    desc: 'Feature coming in upcoming phase.',
    phase: 'Upcoming Phase',
    icon: <Clock size={32} />
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 'var(--space-8)',
      textAlign: 'center',
      backgroundColor: 'var(--bg-app)'
    }} className="animate-fade-in">
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: 'var(--radius-xl)',
        backgroundColor: 'var(--accent-primary-alpha)',
        color: 'var(--accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 'var(--space-4)',
        boxShadow: 'var(--shadow-glow)'
      }}>
        {item.icon}
      </div>

      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color: 'var(--accent-primary)',
        marginBottom: '8px'
      }}>
        {item.phase} Feature
      </span>

      <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
        {item.title}
      </h2>

      <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '460px', lineHeight: 1.6 }}>
        {item.desc}
      </p>
    </div>
  )
}

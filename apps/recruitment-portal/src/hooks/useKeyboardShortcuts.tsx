// ============================================================================
// Allied Recruitment Portal - Keyboard Shortcuts (R11.5)
// Location: apps/recruitment-portal/src/hooks/useKeyboardShortcuts.ts
// ============================================================================

import { useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type ShortcutHandler = () => void

interface Shortcut {
  key: string
  ctrl?: boolean
  meta?: boolean  // Cmd on Mac
  shift?: boolean
  alt?: boolean
  handler: ShortcutHandler
  description: string
  global?: boolean // Works even when input is focused
}

// ============================================================================
// KEYBOARD SHORTCUTS HOOK
// ============================================================================

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement
      const isInputFocused = 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable

      for (const shortcut of shortcuts) {
        // Skip non-global shortcuts when input is focused
        if (isInputFocused && !shortcut.global) continue

        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : true
        const metaMatch = shortcut.meta ? event.metaKey : true
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey

        // For shortcuts that require Cmd/Ctrl, ensure it's pressed
        if (shortcut.ctrl || shortcut.meta) {
          if (!(event.ctrlKey || event.metaKey)) continue
        }

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          event.preventDefault()
          shortcut.handler()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}

// ============================================================================
// GLOBAL SHORTCUTS HOOK
// ============================================================================

interface GlobalShortcutsConfig {
  onSearch?: () => void
  onNewCandidate?: () => void
  onNewJob?: () => void
  onHelp?: () => void
}

export function useGlobalShortcuts(config: GlobalShortcutsConfig) {
  const navigate = useNavigate()

  const shortcuts: Shortcut[] = [
    // Cmd/Ctrl + K - Open search
    {
      key: 'k',
      ctrl: true,
      handler: () => config.onSearch?.(),
      description: 'Open search',
      global: true,
    },
    // Cmd/Ctrl + N - New candidate
    {
      key: 'n',
      ctrl: true,
      handler: () => config.onNewCandidate?.() || navigate('/candidates?action=new'),
      description: 'New candidate',
    },
    // Cmd/Ctrl + J - New job
    {
      key: 'j',
      ctrl: true,
      handler: () => config.onNewJob?.() || navigate('/jobs?action=new'),
      description: 'New job',
    },
    // Cmd/Ctrl + / - Show help/shortcuts
    {
      key: '/',
      ctrl: true,
      handler: () => config.onHelp?.(),
      description: 'Show keyboard shortcuts',
      global: true,
    },
    // G then D - Go to Dashboard
    // G then C - Go to Candidates
    // G then J - Go to Jobs
    // G then I - Go to Interviews
    // G then S - Go to Settings
  ]

  useKeyboardShortcuts(shortcuts)
}

// ============================================================================
// SHORTCUTS HELP MODAL DATA
// ============================================================================

export const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open search' },
      { keys: ['⌘', '/'], description: 'Show shortcuts help' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'N'], description: 'New candidate' },
      { keys: ['⌘', 'J'], description: 'New job' },
      { keys: ['⌘', 'S'], description: 'Save (in forms)' },
      { keys: ['Esc'], description: 'Close modal / Cancel' },
    ],
  },
  {
    title: 'Tables & Lists',
    shortcuts: [
      { keys: ['↑', '↓'], description: 'Navigate rows' },
      { keys: ['Enter'], description: 'Open selected' },
      { keys: ['Space'], description: 'Toggle selection' },
    ],
  },
]

// ============================================================================
// KEYBOARD SHORTCUTS MODAL COMPONENT
// ============================================================================

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="shortcuts-modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcuts-modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="shortcuts-modal-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h3>{group.title}</h3>
              <ul>
                {group.shortcuts.map((shortcut, index) => (
                  <li key={index}>
                    <span className="shortcut-description">{shortcut.description}</span>
                    <span className="shortcut-keys">
                      {shortcut.keys.map((key, i) => (
                        <kbd key={i}>{key}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="shortcuts-modal-footer">
          <p>Press <kbd>⌘</kbd> <kbd>/</kbd> to toggle this dialog</p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMMAND PALETTE / SEARCH MODAL
// ============================================================================

interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: CommandItem[]
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Filter commands based on search
  const filteredCommands = commands.filter(cmd => {
    const searchLower = search.toLowerCase()
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(searchLower))
    )
  })

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex, onClose])

  if (!isOpen) return null

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="command-palette-input-wrapper">
          <svg className="command-palette-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="command-palette-input"
            placeholder="Search commands..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <kbd className="command-palette-kbd">Esc</kbd>
        </div>
        
        <div className="command-palette-results">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">No results found</div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  cmd.action()
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {cmd.icon && <span className="command-palette-item-icon">{cmd.icon}</span>}
                <span className="command-palette-item-content">
                  <span className="command-palette-item-label">{cmd.label}</span>
                  {cmd.description && (
                    <span className="command-palette-item-description">{cmd.description}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

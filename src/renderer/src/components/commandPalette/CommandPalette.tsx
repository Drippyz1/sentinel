import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlertHistoryStore } from '../../store/alertHistoryStore'
import { useUiSettingsStore } from '../../store/uiSettingsStore'
import { Modal } from '../ui/Modal'
import { createCommandRegistry, type CommandDefinition } from './commandRegistry'

function matchesSearch(command: CommandDefinition, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  return [command.label, ...command.keywords].some((value) => value.toLowerCase().includes(query))
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const dashboardPaused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const setDashboardPaused = useUiSettingsStore((state) => state.setDashboardPollingPaused)
  const alerts = useAlertHistoryStore((state) => state.alerts)
  const alertAnalytics = useAlertHistoryStore((state) => state.analytics)
  const markAllAlertsRead = useAlertHistoryStore((state) => state.markAllRead)
  const clearAlertHistory = useAlertHistoryStore((state) => state.clear)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const unreadAlerts = alertAnalytics?.unreadAlerts ?? alerts.filter((alert) => !alert.read).length

  const commands = useMemo(
    () =>
      createCommandRegistry({
        navigate,
        dashboardPaused,
        setDashboardPaused,
        unreadAlerts,
        alertCount: alerts.length,
        markAllAlertsRead,
        clearAlertHistory
      }),
    [
      alerts,
      clearAlertHistory,
      dashboardPaused,
      markAllAlertsRead,
      navigate,
      setDashboardPaused,
      unreadAlerts
    ]
  )
  const filteredCommands = useMemo(
    () => commands.filter((command) => matchesSearch(command, search)),
    [commands, search]
  )

  useEffect(() => {
    document
      .getElementById(`command-${filteredCommands[selectedIndex]?.id}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, filteredCommands])

  async function execute(command: CommandDefinition): Promise<void> {
    if (command.disabled) return
    dismiss()
    try {
      await command.execute()
    } catch (error) {
      console.error(`Command failed: ${command.label}`, error)
    }
  }

  function dismiss() {
    setSearch('')
    setSelectedIndex(0)
    onClose()
  }

  if (!open) return null

  return (
    <Modal titleId="command-palette-title" onClose={dismiss} variant="palette">
      <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
        <h2 id="command-palette-title" className="sr-only">
          Command Palette
        </h2>
        <label htmlFor="command-search" className="sr-only">
          Search commands
        </label>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
            ⌕
          </span>
          <input
            data-initial-focus
            id="command-search"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-expanded="true"
            aria-activedescendant={
              filteredCommands[selectedIndex]
                ? `command-${filteredCommands[selectedIndex].id}`
                : undefined
            }
            placeholder="Search commands..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex((index) =>
                  filteredCommands.length ? (index + 1) % filteredCommands.length : 0
                )
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((index) =>
                  filteredCommands.length
                    ? (index - 1 + filteredCommands.length) % filteredCommands.length
                    : 0
                )
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const command = filteredCommands[selectedIndex]
                if (command) void execute(command)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                dismiss()
              }
            }}
            className="min-h-10 flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd
            className="rounded-md px-2 py-1 text-[10px] font-semibold"
            style={{
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border)'
            }}
          >
            Esc
          </kbd>
        </div>
      </div>

      <div
        id="command-list"
        role="listbox"
        aria-label="Commands"
        className="max-h-[48vh] overflow-y-auto p-2"
      >
        {filteredCommands.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No commands found.
          </div>
        ) : (
          filteredCommands.map((command, index) => {
            const selected = selectedIndex === index
            return (
              <button
                key={command.id}
                id={`command-${command.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                disabled={command.disabled}
                onMouseMove={() => setSelectedIndex(index)}
                onClick={() => void execute(command)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  color: 'var(--text-primary)',
                  backgroundColor: selected ? 'var(--selection)' : 'transparent'
                }}
              >
                <span className="min-w-0 truncate text-sm font-medium">{command.label}</span>
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {command.group}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[10px]"
        style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
      >
        <span>↑↓ Navigate</span>
        <span>Enter Run</span>
        <span>Esc Close</span>
      </div>
    </Modal>
  )
}

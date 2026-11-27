import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CommandPalette } from '../commandPalette/CommandPalette'
import { WorkspaceTabs } from './WorkspaceTabs'
import { pageName } from './navigation'
import { useMetricsStore } from '../../store/metricsStore'
import { formatTime } from '../../utils/format'
import { UiSettingsFeedback } from '../ui/UiSettingsFeedback'
import { useUiSettingsStore } from '../../store/uiSettingsStore'

function StatusStrip({ activity }: { activity: string | null }) {
  const lastUpdated = useMetricsStore((state) => state.lastUpdated)
  const paused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  return (
    <footer className="status-strip" aria-label="Monitoring status">
      <span className="monitor-status">
        <span className="device-dot" data-paused={paused} aria-hidden="true" />
        {paused ? 'Display paused' : lastUpdated ? 'Live monitoring' : 'Awaiting observations'}
      </span>
      {paused && <span className="status-context">Collection continues in background</span>}
      {activity && <span className="status-context status-analysis">{activity}</span>}
      {lastUpdated !== null && (
        <span className="status-time">
          Last display update{' '}
          <time dateTime={lastUpdated.toISOString()}>{formatTime(lastUpdated)}</time>
        </span>
      )}
      <span className="status-device">Local device</span>
    </footer>
  )
}

export function AppLayout() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  const isMac = navigator.userAgent.toUpperCase().includes('MAC')
  const { pathname } = useLocation()
  const appearance = useUiSettingsStore((state) => state.appearance)
  const save = useUiSettingsStore((state) => state.savePreferences)
  const saving = useUiSettingsStore((state) => state.saveState.saving)
  const collapsed = appearance.sidebar === 'collapsed'
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const primaryModifier = isMac ? event.metaKey : event.ctrlKey
      if (
        event.key.toLowerCase() !== 'k' ||
        !primaryModifier ||
        (!commandPaletteOpen && document.querySelector('dialog[open]'))
      )
        return
      event.preventDefault()
      setCommandPaletteOpen((open) => !open)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, isMac])

  return (
    <div className="desktop-shell" data-sidebar={appearance.sidebar}>
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('workspace-main')?.focus()
        }}
      >
        Skip to content
      </a>
      {commandPaletteOpen && <CommandPalette open onClose={closeCommandPalette} />}
      <div className="desktop-column">
        <WorkspaceTabs
          tools={
            <>
              <button
                type="button"
                className="control control--icon"
                disabled={saving}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() =>
                  save({
                    appearance: { ...appearance, sidebar: collapsed ? 'expanded' : 'collapsed' }
                  })
                }
              >
                <svg
                  aria-hidden="true"
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="control command-trigger"
                aria-label={`Open command palette, ${isMac ? 'Command' : 'Control'} K`}
              >
                <svg
                  aria-hidden="true"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="10" cy="10" r="5.5" />
                  <path d="m14.1 14.1 4.4 4.4" />
                </svg>
                <span>Commands</span>
                <kbd>{isMac ? <>&#8984;</> : 'Ctrl+'}K</kbd>
              </button>
            </>
          }
        />
        <div className="px-4 empty:hidden sm:px-6">
          <UiSettingsFeedback />
        </div>

        <main
          id="workspace-main"
          className="desktop-main"
          aria-label={pageName(pathname)}
          tabIndex={-1}
        >
          <Suspense
            fallback={
              <p className="text-sm" role="status">
                Loading view...
              </p>
            }
          >
            <Outlet context={setActivity} />
          </Suspense>
        </main>
        <StatusStrip activity={activity} />
      </div>
    </div>
  )
}

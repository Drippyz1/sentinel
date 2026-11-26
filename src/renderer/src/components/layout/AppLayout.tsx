import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CommandPalette } from '../commandPalette/CommandPalette'
import { Sidebar } from './Sidebar'
import { useMetricsStore } from '../../store/metricsStore'
import { formatTime } from '../../utils/format'

function UpdatedTime() {
  const lastUpdated = useMetricsStore((state) => state.lastUpdated)
  return lastUpdated ? (
    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
      Updated {formatTime(lastUpdated)}
    </span>
  ) : null
}

export function AppLayout() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const isMac = navigator.userAgent.toUpperCase().includes('MAC')
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const primaryModifier = isMac ? event.metaKey : event.ctrlKey
      if (event.key.toLowerCase() !== 'k' || !primaryModifier) return
      event.preventDefault()
      setCommandPaletteOpen((open) => !open)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMac])

  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      {commandPaletteOpen && <CommandPalette open onClose={closeCommandPalette} />}
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        <header
          className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-xs transition-colors"
            style={{
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)'
            }}
            aria-label={`Open command palette, ${isMac ? 'Command' : 'Control'} K`}
          >
            <span className="hidden sm:inline">Commands</span>
            <kbd className="text-[10px] font-semibold">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <UpdatedTime />
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-5 xl:p-6">
          <Suspense
            fallback={
              <p className="text-sm" role="status">
                Loading view...
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

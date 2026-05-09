import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useMetricsStatus } from '../../hooks/useMetrics'
import { formatTime } from '../../utils/format'

export function AppLayout() {
  const { lastUpdated } = useMetricsStatus()

  return (
    <div className="h-screen flex overflow-hidden"
         style={{ backgroundColor: 'var(--bg-base)' }}>

      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Top bar */}
        <header
          className="flex items-center justify-end px-6 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Updated {formatTime(lastUpdated)}
            </span>
          )}
        </header>

        {/* Page content — Outlet renders the current page */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

      </div>
    </div>
  )
}
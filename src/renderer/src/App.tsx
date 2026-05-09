import { useMetricsPolling, useMetricsStatus } from './hooks/useMetrics'
import { formatTime } from './utils/format'
import { CpuWidget }     from './components/widgets/CpuWidget'
import { MemoryWidget }  from './components/widgets/MemoryWidget'
import { DiskWidget }    from './components/widgets/DiskWidget'
import { NetworkWidget } from './components/widgets/NetworkWidget'

function App() {
  useMetricsPolling()
  const { isLoading, error, lastUpdated } = useMetricsStatus()

  if (isLoading && !lastUpdated) {
    return (
      <div className="h-screen flex items-center justify-center"
           style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Sentinel</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Reading system metrics...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center"
           style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="text-center" style={{ color: 'var(--accent-red)' }}>
          <div className="text-xl font-bold mb-2">Error</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden"
         style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
          <h1 className="text-base font-semibold tracking-wide">Sentinel</h1>
        </div>
        {lastUpdated && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatTime(lastUpdated)}
          </span>
        )}
      </header>

      {/* Dashboard grid */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-4">
          <CpuWidget />
          <MemoryWidget />
          <DiskWidget />
          <NetworkWidget />
        </div>
      </main>

    </div>
  )
}

export default App
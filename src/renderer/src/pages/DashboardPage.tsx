import { CpuWidget } from '../components/widgets/CpuWidget'
import { MemoryWidget } from '../components/widgets/MemoryWidget'
import { DiskWidget } from '../components/widgets/DiskWidget'
import { NetworkWidget } from '../components/widgets/NetworkWidget'
import { GpuWidget } from '../components/widgets/GpuWidget'
import { BatteryWidget } from '../components/widgets/BatteryWidget'
import { AnomalyPanel } from '../components/widgets/AnomalyPanel'
import { useMetricsStatus } from '../hooks/useMetrics'
import { formatTime } from '../utils/format'

export function DashboardPage() {
  const { lastUpdated, isPollingPaused, setPollingPaused } = useMetricsStatus()

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Overview
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {lastUpdated ? `Last updated ${formatTime(lastUpdated)}` : 'Waiting for metrics'}
            {isPollingPaused ? ' · Updates paused' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPollingPaused(!isPollingPaused)}
          className="min-h-9 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            backgroundColor: isPollingPaused ? 'var(--accent-green)' : 'rgba(245, 158, 11, 0.12)',
            color: isPollingPaused ? 'white' : 'var(--accent-amber)',
            border: `1px solid ${isPollingPaused ? 'var(--accent-green)' : 'rgba(245, 158, 11, 0.35)'}`
          }}
        >
          {isPollingPaused ? 'Resume live updates' : 'Pause live updates'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 mb-4 items-stretch">
        <CpuWidget />
        <MemoryWidget />
        <DiskWidget />
        <NetworkWidget />
        <GpuWidget />
        <BatteryWidget />
      </div>

      <AnomalyPanel />
    </div>
  )
}

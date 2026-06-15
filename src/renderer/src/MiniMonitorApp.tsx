import { useEffect } from 'react'
import {
  useBatteryMetrics,
  useCpuMetrics,
  useGpuMetrics,
  useMemoryMetrics,
  useMetricsStatus,
  useMetricsSubscription,
  useNetworkMetrics
} from './hooks/useMetrics'
import { useUiSettingsStore } from './store/uiSettingsStore'
import { formatPercent, formatSpeed, formatTime } from './utils/format'

function Metric({
  label,
  value,
  color = 'var(--text-primary)'
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div
      className="min-w-0 rounded-lg px-2.5 py-2"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-nowrap">
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      </p>
      <p
        className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums"
        style={{ color }}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

export function MiniMonitorApp() {
  const initializeUiSettings = useUiSettingsStore((state) => state.initialize)
  const initialized = useUiSettingsStore((state) => state.initialized)
  const alwaysOnTop = useUiSettingsStore((state) => state.miniMonitorAlwaysOnTop)

  useEffect(() => {
    void initializeUiSettings()
  }, [initializeUiSettings])

  useMetricsSubscription()

  const cpu = useCpuMetrics()
  const memory = useMemoryMetrics()
  const network = useNetworkMetrics()
  const gpu = useGpuMetrics()
  const battery = useBatteryMetrics()
  const { isLoading, lastUpdated } = useMetricsStatus()
  const gpuController = gpu?.hasGpu ? gpu.controllers[0] : undefined

  async function toggleAlwaysOnTop() {
    await window.electronAPI.setMiniMonitorAlwaysOnTop(!alwaysOnTop)
  }

  if (!initialized || (isLoading && !lastUpdated)) {
    return (
      <div className="window-drag flex h-full items-center justify-center">
        <div className="text-center">
          <div
            className="mx-auto mb-2 h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: 'var(--accent-blue)' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Reading metrics...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-2.5">
      <header
        className="window-drag flex items-start justify-between gap-2 border-b pb-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--accent-green)' }}
            />
            <h1 className="text-xs font-semibold">Sentinel Mini Monitor</h1>
          </div>
          <p className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {lastUpdated ? `Updated ${formatTime(lastUpdated)}` : 'Waiting for metrics'}
          </p>
        </div>
        <button
          type="button"
          className="window-no-drag min-h-7 shrink-0 rounded-md px-2 text-[10px] font-semibold"
          style={{
            color: alwaysOnTop ? 'var(--accent-blue)' : 'var(--text-muted)',
            backgroundColor: alwaysOnTop ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card)',
            border: '1px solid var(--border)'
          }}
          aria-pressed={alwaysOnTop}
          onClick={() => void toggleAlwaysOnTop()}
        >
          {alwaysOnTop ? 'Unpin' : 'Pin'}
        </button>
      </header>

      <main className="window-drag min-h-0 flex-1 py-2">
        <div className="grid grid-cols-2 gap-1.5">
          <Metric
            label="CPU"
            value={cpu ? formatPercent(cpu.usagePercent, 0) : 'Unavailable'}
            color="var(--accent-blue)"
          />
          <Metric
            label="Memory"
            value={memory ? formatPercent(memory.usagePercent, 0) : 'Unavailable'}
            color="var(--accent-purple)"
          />
          {gpuController && (
            <Metric
              label="GPU"
              value={formatPercent(gpuController.utilizationPercent, 0)}
              color="var(--accent-purple)"
            />
          )}
          {battery?.hasBattery && (
            <Metric
              label="Battery"
              value={`${battery.chargePercent}%${battery.isCharging ? ' · Charging' : ''}`}
              color={battery.chargePercent < 20 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
          )}
          <Metric
            label="Down"
            value={network ? formatSpeed(network.totalDownloadBytesPerSec) : 'Unavailable'}
            color="var(--accent-green)"
          />
          <Metric
            label="Up"
            value={network ? formatSpeed(network.totalUploadBytesPerSec) : 'Unavailable'}
            color="var(--accent-blue)"
          />
        </div>
      </main>

      <footer
        className="window-no-drag grid grid-cols-2 gap-1.5 border-t pt-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => void window.electronAPI.openMainWindow()}
          className="min-h-8 rounded-lg px-2 text-[11px] font-semibold"
          style={{
            color: 'var(--accent-blue)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)'
          }}
        >
          Open Sentinel
        </button>
        <button
          type="button"
          onClick={() => void window.electronAPI.hideMiniMonitor()}
          className="min-h-8 rounded-lg px-2 text-[11px] font-semibold"
          style={{
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)'
          }}
        >
          Hide Monitor
        </button>
      </footer>
    </div>
  )
}

import { useEffect, useState, type CSSProperties } from 'react'
import {
  useBatteryMetrics,
  useCpuMetrics,
  useGpuMetrics,
  useMemoryMetrics,
  useMetricsStatus,
  useMetricsSubscription,
  useNetworkMetrics
} from './hooks/useMetrics'
import { boundedPercent } from '../../shared/utils/visualization'
import { useUiSettingsStore } from './store/uiSettingsStore'
import { formatPercent, formatSpeed, formatTime } from './utils/format'

function Metric({
  label,
  value,
  color = 'var(--text-primary)',
  percent
}: {
  label: string
  value: string
  color?: string
  percent?: number | null
}) {
  const fill = boundedPercent(percent)
  return (
    <div
      className="mini-tile mini-instrument"
      style={
        { '--mini-ink': color, '--mini-fill': fill === null ? '0%' : `${fill}%` } as CSSProperties
      }
    >
      <span className="mini-instrument-label">{label}</span>
      <strong className="mini-instrument-reading" title={value}>
        {value}
      </strong>
      {fill !== null && <span className="mini-instrument-meter" aria-hidden="true" />}
    </div>
  )
}

export function MiniMonitorApp() {
  const initializeUiSettings = useUiSettingsStore((state) => state.initialize)
  const initialized = useUiSettingsStore((state) => state.initialized)
  const alwaysOnTop = useUiSettingsStore((state) => state.miniMonitorAlwaysOnTop)
  const presentation = useUiSettingsStore((state) => state.miniPresentation)
  const paused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<'pin' | 'hide' | null>(null)

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

  async function togglePin(): Promise<void> {
    setPending(true)
    setFailure(null)
    try {
      if (!(await window.electronAPI.setMiniMonitorAlwaysOnTop(!alwaysOnTop))) setFailure('pin')
    } catch {
      setFailure('pin')
    } finally {
      setPending(false)
    }
  }

  async function dismiss(): Promise<void> {
    setFailure(null)
    try {
      // A false response still dismisses the window. Main reports the save failure.
      await window.electronAPI.hideMiniMonitor()
    } catch {
      setFailure('hide')
    }
  }

  const reading = !initialized || (isLoading && !lastUpdated)
  const unavailable = reading ? 'Pending' : 'Unavailable'

  return (
    <div className="aux-workbench mini-workbench flex h-full flex-col overflow-hidden p-2.5">
      <header
        className="window-drag flex items-start justify-between gap-2 border-b pb-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: paused ? 'var(--accent-amber)' : 'var(--accent-green)' }}
            />
            <h1 className="text-xs font-semibold">Sentinel Mini Monitor</h1>
          </div>
          <p
            className="mt-0.5 truncate text-[10px]"
            role={failure ? 'alert' : undefined}
            style={{ color: failure ? 'var(--accent-amber)' : 'var(--text-muted)' }}
          >
            {failure === 'pin'
              ? 'Could not save. Try again.'
              : failure === 'hide'
                ? 'Could not hide. Try again.'
                : paused
                  ? 'Live updates paused'
                  : reading
                    ? 'Reading metrics…'
                    : lastUpdated
                      ? `Updated ${formatTime(lastUpdated)}`
                      : 'Waiting for metrics'}
          </p>
        </div>
        <button
          type="button"
          className="window-no-drag control shrink-0"
          aria-pressed={alwaysOnTop}
          disabled={pending}
          onClick={() => void togglePin()}
        >
          {alwaysOnTop ? 'Unpin' : 'Pin'}
        </button>
      </header>

      <main className="window-no-drag aux-scroll py-2">
        <div className="mini-grid" data-layout={presentation.layout}>
          {presentation.metrics.includes('cpu') && (
            <Metric
              label="CPU"
              percent={cpu?.usagePercent}
              value={cpu ? formatPercent(cpu.usagePercent, 0) : unavailable}
              color="var(--accent-blue)"
            />
          )}
          {presentation.metrics.includes('memory') && (
            <Metric
              label="Memory"
              percent={memory?.usagePercent}
              value={memory ? formatPercent(memory.usagePercent, 0) : unavailable}
              color="var(--accent-purple)"
            />
          )}
          {presentation.metrics.includes('gpu') && (
            <Metric
              label="GPU"
              percent={gpuController?.utilizationPercent}
              value={
                gpuController ? formatPercent(gpuController.utilizationPercent, 0) : unavailable
              }
              color="var(--accent-purple)"
            />
          )}
          {presentation.metrics.includes('battery') && (
            <Metric
              label="Battery"
              percent={battery?.hasBattery ? battery.chargePercent : null}
              value={
                battery?.hasBattery
                  ? `${battery.chargePercent}%${battery.isCharging ? ' · Charging' : ''}`
                  : unavailable
              }
              color={
                battery?.hasBattery && battery.chargePercent < 20
                  ? 'var(--accent-red)'
                  : 'var(--accent-green)'
              }
            />
          )}
          {presentation.metrics.includes('network') && (
            <>
              <Metric
                label="Down"
                value={network ? formatSpeed(network.totalDownloadBytesPerSec) : unavailable}
                color="var(--accent-green)"
              />
              <Metric
                label="Up"
                value={network ? formatSpeed(network.totalUploadBytesPerSec) : unavailable}
                color="var(--accent-blue)"
              />
            </>
          )}
        </div>
      </main>

      <footer
        className="window-no-drag grid grid-cols-2 gap-1.5 border-t pt-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => void window.electronAPI.openMainWindow()}
          className="control control--accent"
        >
          Open Sentinel
        </button>
        <button type="button" onClick={() => void dismiss()} className="control">
          Hide Monitor
        </button>
      </footer>
    </div>
  )
}

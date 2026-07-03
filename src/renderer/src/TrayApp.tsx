import { useEffect, useState } from 'react'
import {
  useBatteryMetrics,
  useCpuMetrics,
  useDiskMetrics,
  useGpuMetrics,
  useMemoryMetrics,
  useMetricsStatus,
  useMetricsSubscription,
  useNetworkMetrics
} from './hooks/useMetrics'
import { UsageBar } from './components/ui/UsageBar'
import { useUiSettingsStore } from './store/uiSettingsStore'
import { useAlertHistoryStore } from './store/alertHistoryStore'
import { selectPrimaryDrive } from '../../shared/utils/disk'
import { formatBytes, formatPercent, formatSpeed, formatTime } from './utils/format'

interface MetricRowProps {
  label: string
  value: string
  percent: number
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  detail?: string
  compact: boolean
}

function MetricRow({ label, value, percent, accent, detail, compact }: MetricRowProps) {
  return (
    <div className={compact ? 'py-1.5' : 'py-2'}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-14 shrink-0 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <div className="min-w-0 flex-1">
          {!compact && <UsageBar percent={percent} accent={accent} height={3} />}
        </div>
        <span
          className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </span>
      </div>
      {!compact && detail && (
        <p className="mt-1 truncate pl-16 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {detail}
        </p>
      )}
    </div>
  )
}

function TrayContent() {
  const initializeUiSettings = useUiSettingsStore((state) => state.initialize)
  const initialized = useUiSettingsStore((state) => state.initialized)
  const isPaused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const setPaused = useUiSettingsStore((state) => state.setDashboardPollingPaused)
  const initializeAlertHistory = useAlertHistoryStore((state) => state.initialize)
  const alerts = useAlertHistoryStore((state) => state.alerts)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    void initializeUiSettings()
    void initializeAlertHistory()
  }, [initializeAlertHistory, initializeUiSettings])

  useMetricsSubscription()

  const cpu = useCpuMetrics()
  const memory = useMemoryMetrics()
  const disk = useDiskMetrics()
  const network = useNetworkMetrics()
  const gpu = useGpuMetrics()
  const battery = useBatteryMetrics()
  const { isLoading, lastUpdated } = useMetricsStatus()
  const unreadAlerts = alerts.filter((alert) => !alert.read)
  const mostRecentAlert = alerts[0]
  const primaryDrive = selectPrimaryDrive(disk?.drives)
  const gpuController = gpu?.controllers[0]

  function toggleCompact() {
    const next = !compact
    setCompact(next)
    void window.electronAPI.setTrayCompact(next)
  }

  if (!initialized || (isLoading && !lastUpdated)) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="text-center">
          <div
            className="mx-auto mb-2 h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: 'var(--accent-blue)' }}
          />
          <p className="text-xs">Reading system metrics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <header
        className="flex items-start justify-between gap-3 border-b pb-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: isPaused ? 'var(--accent-amber)' : 'var(--accent-green)'
              }}
            />
            <h1 className="text-sm font-semibold">Sentinel</h1>
          </div>
          <p className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {lastUpdated ? `Updated ${formatTime(lastUpdated)}` : 'Waiting for metrics'}
            {isPaused ? ' · Paused' : ''}
            {unreadAlerts.length > 0
              ? ` · ${unreadAlerts.length} unread alert${unreadAlerts.length === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void window.electronAPI.openMainWindow()}
          className="min-h-8 shrink-0 rounded-lg px-2.5 text-xs font-semibold"
          style={{
            color: 'var(--accent-blue)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)'
          }}
        >
          Open
        </button>
      </header>

      <section className="min-h-0 flex-1 divide-y" style={{ borderColor: 'var(--border)' }}>
        <MetricRow
          label="CPU"
          value={cpu ? formatPercent(cpu.usagePercent, 0) : '—'}
          percent={cpu?.usagePercent ?? 0}
          detail={cpu ? `${cpu.speedGHz} GHz · ${cpu.cores} cores` : undefined}
          compact={compact}
        />
        <MetricRow
          label="Mem"
          value={memory ? formatPercent(memory.usagePercent, 0) : '—'}
          percent={memory?.usagePercent ?? 0}
          accent="purple"
          detail={
            memory
              ? `${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)}`
              : undefined
          }
          compact={compact}
        />
        {!compact && (
          <MetricRow
            label="GPU"
            value={gpuController ? formatPercent(gpuController.utilizationPercent, 0) : '—'}
            percent={gpuController?.utilizationPercent ?? 0}
            accent="purple"
            detail={gpuController?.name ?? 'Unavailable'}
            compact={compact}
          />
        )}
        <MetricRow
          label="Disk"
          value={primaryDrive ? formatBytes(primaryDrive.availableBytes) : '—'}
          percent={primaryDrive?.usagePercent ?? 0}
          detail={
            disk && primaryDrive
              ? `${formatPercent(primaryDrive.usagePercent, 0)} used · Read ${formatSpeed(disk.io.readBytesPerSec)} · Write ${formatSpeed(disk.io.writeBytesPerSec)}`
              : undefined
          }
          compact={compact}
        />

        <div className={compact ? 'py-2' : 'py-2.5'}>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="min-w-0 rounded-lg px-2 py-1.5"
              style={{ background: 'var(--bg-card)' }}
            >
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Down
              </p>
              <p
                className="truncate font-mono text-xs font-semibold tabular-nums"
                style={{ color: 'var(--accent-green)' }}
                title={network ? formatSpeed(network.totalDownloadBytesPerSec) : 'Unavailable'}
              >
                {network ? formatSpeed(network.totalDownloadBytesPerSec) : '—'}
              </p>
            </div>
            <div
              className="min-w-0 rounded-lg px-2 py-1.5"
              style={{ background: 'var(--bg-card)' }}
            >
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Up
              </p>
              <p
                className="truncate font-mono text-xs font-semibold tabular-nums"
                style={{ color: 'var(--accent-blue)' }}
                title={network ? formatSpeed(network.totalUploadBytesPerSec) : 'Unavailable'}
              >
                {network ? formatSpeed(network.totalUploadBytesPerSec) : '—'}
              </p>
            </div>
          </div>
        </div>

        {!compact && (
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Battery
            </span>
            <span className="min-w-0 truncate text-right font-mono text-xs font-semibold tabular-nums">
              {battery?.hasBattery
                ? `${battery.chargePercent}% · ${battery.isCharging ? 'Charging' : 'On battery'}`
                : '—'}
            </span>
          </div>
        )}

        {!compact && (
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Alerts
            </span>
            <span
              className="min-w-0 truncate text-right text-xs font-semibold"
              style={{
                color: unreadAlerts.length > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'
              }}
              title={mostRecentAlert?.title}
            >
              {unreadAlerts.length > 0
                ? `${unreadAlerts.length} unread`
                : mostRecentAlert?.title || 'None'}
            </span>
          </div>
        )}
      </section>

      <footer
        className="grid grid-cols-3 gap-2 border-t pt-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => setPaused(!isPaused)}
          className="min-h-8 rounded-lg px-2 text-xs font-semibold"
          style={{
            backgroundColor: isPaused ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${isPaused ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            color: isPaused ? 'var(--accent-green)' : 'var(--accent-amber)'
          }}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={toggleCompact}
          className="min-h-8 rounded-lg px-2 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)'
          }}
        >
          {compact ? 'Expanded' : 'Compact'}
        </button>
        <button
          type="button"
          onClick={() => void window.electronAPI.quitApp()}
          className="min-h-8 rounded-lg px-2 text-xs font-semibold"
          style={{
            color: 'var(--accent-red)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)'
          }}
        >
          Quit
        </button>
      </footer>
    </div>
  )
}

export function TrayApp() {
  return <TrayContent />
}

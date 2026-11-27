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
import { UiSettingsFeedback } from './components/ui/UiSettingsFeedback'
import type { TrayAlertSummary } from '../../shared/contracts'
import { selectPrimaryDrive } from '../../shared/utils/disk'
import { formatBytes, formatPercent, formatSpeed, formatTime } from './utils/format'

interface MetricRowProps {
  label: string
  value: string
  percent: number | null
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  detail?: string
  compact: boolean
}

function MetricRow({ label, value, percent, accent, detail, compact }: MetricRowProps) {
  return (
    <div className={compact ? 'tray-reading py-1.5' : 'tray-reading py-2'}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-14 shrink-0 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <div className="min-w-0 flex-1">
          {!compact && percent !== null && (
            <UsageBar percent={percent} accent={accent} height={3} />
          )}
        </div>
        <span
          className="max-w-[45%] shrink-0 text-right text-xs font-semibold tabular-nums break-words"
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
  const saving = useUiSettingsStore((state) => state.saveState.saving)
  const [summary, setSummary] = useState<TrayAlertSummary | null>(null)
  const { compact, metrics } = useUiSettingsStore((state) => state.trayPresentation)
  const [compactError, setCompactError] = useState(false)
  const [savingCompact, setSavingCompact] = useState(false)

  useEffect(() => {
    void initializeUiSettings()
    let current = true
    let received = false
    const stop = window.electronAPI.onTrayAlertSummaryUpdated((value) => {
      received = true
      setSummary(value)
    })
    window.electronAPI
      .getTrayAlertSummary()
      .then((value) => {
        if (current && !received) setSummary(value)
      })
      .catch(console.error)
    return () => {
      current = false
      stop()
    }
  }, [initializeUiSettings])

  useMetricsSubscription()

  const cpu = useCpuMetrics()
  const memory = useMemoryMetrics()
  const disk = useDiskMetrics()
  const network = useNetworkMetrics()
  const gpu = useGpuMetrics()
  const battery = useBatteryMetrics()
  const { isLoading, lastUpdated } = useMetricsStatus()
  const unreadCount = summary?.unreadCount ?? 0
  const primaryDrive = selectPrimaryDrive(disk?.drives)
  const gpuController = gpu?.controllers[0]

  async function toggleCompact() {
    setSavingCompact(true)
    setCompactError(false)
    try {
      if (!(await window.electronAPI.setTrayCompact(!compact))) setCompactError(true)
    } catch {
      setCompactError(true)
    } finally {
      setSavingCompact(false)
    }
  }

  if (!initialized || (isLoading && !lastUpdated)) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="text-center">
          <div
            className="mx-auto mb-2 h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--accent-blue)' }}
          />
          <p className="text-xs">Reading system metrics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="aux-workbench tray-instruments flex h-full flex-col overflow-hidden p-3">
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
            {unreadCount > 0 ? ` · ${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}` : ''}
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

      <section
        className="aux-scroll divide-y"
        style={{ borderColor: 'var(--border)' }}
        aria-label="Metrics"
      >
        {metrics.includes('cpu') && (
          <MetricRow
            label="CPU"
            value={cpu ? formatPercent(cpu.usagePercent, 0) : '—'}
            percent={cpu?.usagePercent ?? null}
            detail={cpu ? `${cpu.speedGHz} GHz · ${cpu.cores} cores` : undefined}
            compact={compact}
          />
        )}
        {metrics.includes('memory') && (
          <MetricRow
            label="Mem"
            value={memory ? formatPercent(memory.usagePercent, 0) : '—'}
            percent={memory?.usagePercent ?? null}
            accent="purple"
            detail={
              memory
                ? `${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)}`
                : undefined
            }
            compact={compact}
          />
        )}
        {metrics.includes('gpu') && (
          <MetricRow
            label="GPU"
            value={gpuController ? formatPercent(gpuController.utilizationPercent, 0) : '—'}
            percent={gpuController?.utilizationPercent ?? null}
            accent="purple"
            detail={gpuController?.name ?? 'Unavailable'}
            compact={compact}
          />
        )}
        {metrics.includes('disk') && (
          <MetricRow
            label="Disk"
            value={primaryDrive ? formatBytes(primaryDrive.availableBytes) : '—'}
            percent={primaryDrive?.usagePercent ?? null}
            detail={
              disk && primaryDrive
                ? `${formatPercent(primaryDrive.usagePercent, 0)} used · Read ${formatSpeed(disk.io.readBytesPerSec)} · Write ${formatSpeed(disk.io.writeBytesPerSec)}`
                : undefined
            }
            compact={compact}
          />
        )}

        {metrics.includes('network') && (
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
        )}

        {metrics.includes('battery') && (
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

        {
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Alerts
            </span>
            <span
              className="min-w-0 truncate text-right text-xs font-semibold"
              style={{
                color: unreadCount > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'
              }}
              title={summary?.latestTitle ?? undefined}
            >
              {unreadCount > 0
                ? `${unreadCount} unread`
                : (summary?.latestTitle ?? (summary ? 'None' : 'Unavailable'))}
            </span>
          </div>
        }
      </section>

      <footer
        className="grid grid-cols-3 gap-2 border-t pt-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="col-span-3 empty:hidden">
          <UiSettingsFeedback compact />
          {compactError && (
            <p className="workspace-meta" role="alert">
              Could not save tray layout.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPaused(!isPaused)}
          disabled={saving}
          className="control"
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
          onClick={() => void toggleCompact()}
          disabled={savingCompact}
          className="control"
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
          className="control control--danger"
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

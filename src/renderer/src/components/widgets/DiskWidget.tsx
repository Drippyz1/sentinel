import { useDiskMetrics } from '../../hooks/useMetrics'
import { useMetricsStatus } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { selectPrimaryDrive } from '../../../../shared/utils/disk'
import { formatSpeed, formatBytes, formatPercent } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'
import { MiniChart } from '../ui/MiniChart'
import {
  DASHBOARD_CHART_HEIGHT,
  isCompactDashboard,
  type DashboardWidgetProps
} from './dashboardDensity'

export function DiskWidget({ density }: DashboardWidgetProps) {
  const disk = useDiskMetrics()
  const { error, isLoading } = useMetricsStatus()
  const readHistory = useHistoryStore((state) => state.diskRead)
  const writeHistory = useHistoryStore((state) => state.diskWrite)
  const compact = isCompactDashboard(density)

  if (!disk) {
    return (
      <Card
        title="Disk"
        subtitle={isLoading ? 'Collecting metrics' : 'Unavailable'}
        density={density}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {error ?? (isLoading ? 'Reading storage data...' : 'Storage data unavailable')}
        </p>
      </Card>
    )
  }

  const primaryDrive = selectPrimaryDrive(disk.drives)
  if (!primaryDrive) {
    return (
      <Card title="Disk" subtitle="No mounted storage" density={density}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No mounted storage information available
        </p>
      </Card>
    )
  }

  const availabilityMayExcludePurgeable =
    isApfsStorageType(primaryDrive.type) &&
    primaryDrive.purgeableBytes === null &&
    !primaryDrive.availableIncludesPurgeable
  const subtitle =
    primaryDrive.mount === '/' ? primaryDrive.type : `${primaryDrive.mount} · ${primaryDrive.type}`

  return (
    <Card title="Disk" subtitle={subtitle} density={density}>
      <div className="mb-3 min-w-0">
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Available
        </p>
        <span
          className={`${compact ? 'text-3xl' : 'text-4xl'} break-words font-mono font-bold`}
          style={{ color: 'var(--text-primary)' }}
        >
          {formatBytes(primaryDrive.availableBytes)}
        </span>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {formatPercent(primaryDrive.usagePercent, 0)} used
        </p>
      </div>

      {!compact && <UsageBar percent={primaryDrive.usagePercent} />}

      <div
        className={compact ? 'mt-3 pt-3' : 'mt-4 pt-4'}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="grid grid-cols-2 gap-3">
          <MiniChart
            data={readHistory}
            color="#22c55e"
            label={compact ? 'Read · 2 min' : 'Read · Last 2 min'}
            status={formatSpeed(disk.io.readBytesPerSec)}
            ariaLabel="Recent disk read activity trend"
            formatValue={formatSpeed}
            domain={[0, Math.max(...readHistory.map((p) => p.value), 1)]}
            height={DASHBOARD_CHART_HEIGHT[density]}
          />
          <MiniChart
            data={writeHistory}
            color="#f59e0b"
            label={compact ? 'Write · 2 min' : 'Write · Last 2 min'}
            status={formatSpeed(disk.io.writeBytesPerSec)}
            ariaLabel="Recent disk write activity trend"
            formatValue={formatSpeed}
            domain={[0, Math.max(...writeHistory.map((p) => p.value), 1)]}
            height={DASHBOARD_CHART_HEIGHT[density]}
          />
        </div>
      </div>

      {!compact && (
        <div className="mt-4 pt-4 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
          <StatRow
            label="Available"
            value={formatBytes(primaryDrive.availableBytes)}
            accent="green"
          />
          <StatRow label="Free now" value={formatBytes(primaryDrive.freeBytes)} accent="green" />
          <StatRow
            label="Purgeable"
            value={formatOptionalBytes(primaryDrive.purgeableBytes)}
            accent={primaryDrive.purgeableBytes === null ? 'amber' : 'green'}
          />
          <StatRow label="Used" value={formatBytes(primaryDrive.usedBytes)} accent="blue" />
          <StatRow label="Total" value={formatBytes(primaryDrive.totalBytes)} accent="blue" />
          {availabilityMayExcludePurgeable && (
            <p className="pt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Available data may exclude purgeable macOS storage.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function formatOptionalBytes(bytes: number | null): string {
  return bytes === null ? 'Unavailable' : formatBytes(bytes)
}

function isApfsStorageType(type: string): boolean {
  return type.trim().toLowerCase() === 'apfs'
}

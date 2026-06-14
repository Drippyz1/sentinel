import { useDiskMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { formatSpeed, formatBytes } from '../../utils/format'
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
  const readHistory = useHistoryStore((state) => state.diskRead)
  const writeHistory = useHistoryStore((state) => state.diskWrite)
  if (!disk) return null

  const primaryDrive = disk.drives.find((d) => d.mount === '/') ?? disk.drives[0]
  if (!primaryDrive) return null
  const compact = isCompactDashboard(density)

  return (
    <Card title="Disk" subtitle={primaryDrive.type} density={density}>
      <div className="flex items-end gap-2 mb-3">
        <span
          className={`${compact ? 'text-3xl' : 'text-4xl'} font-bold font-mono`}
          style={{ color: 'var(--text-primary)' }}
        >
          {primaryDrive.usagePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>
          %
        </span>
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
          <StatRow label="Used" value={formatBytes(primaryDrive.usedBytes)} accent="blue" />
          <StatRow label="Free" value={formatBytes(primaryDrive.freeBytes)} accent="green" />
          <StatRow label="Total" value={formatBytes(primaryDrive.totalBytes)} accent="blue" />
        </div>
      )}
    </Card>
  )
}

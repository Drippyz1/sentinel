import { useDiskMetrics } from '../../hooks/useMetrics'
import { formatBytes, formatPercent, formatSpeed } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'

export function DiskWidget() {
  const disk = useDiskMetrics()
  if (!disk) return null

  // Show the root drive first
  const primaryDrive = disk.drives.find(d => d.mount === '/') ?? disk.drives[0]
  if (!primaryDrive) return null

  return (
    <Card title="Disk" subtitle={primaryDrive.type}>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-bold font-mono"
              style={{ color: 'var(--text-primary)' }}>
          {primaryDrive.usagePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>%</span>
      </div>

      <UsageBar percent={primaryDrive.usagePercent} />

      <div className="mt-4 space-y-1">
        <StatRow label="Used"  value={formatBytes(primaryDrive.usedBytes)}  accent="blue"  />
        <StatRow label="Free"  value={formatBytes(primaryDrive.freeBytes)}  accent="green" />
        <StatRow label="Total" value={formatBytes(primaryDrive.totalBytes)} accent="blue"  />
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          I/O Activity
        </p>
        <StatRow label="Read"  value={formatSpeed(disk.io.readBytesPerSec)}  accent="green" />
        <StatRow label="Write" value={formatSpeed(disk.io.writeBytesPerSec)} accent="amber" />
      </div>

    </Card>
  )
}
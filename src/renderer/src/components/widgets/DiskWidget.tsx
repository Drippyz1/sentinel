import { useDiskMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { formatBytes, formatPercent, formatSpeed } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'
import { MiniChart } from '../ui/MiniChart'

export function DiskWidget() {
  const disk        = useDiskMetrics()
  const readHistory  = useHistoryStore(state => state.diskRead)
  const writeHistory = useHistoryStore(state => state.diskWrite)
  if (!disk) return null

  const primaryDrive = disk.drives.find(d => d.mount === '/') ?? disk.drives[0]
  if (!primaryDrive) return null

  return (
    <Card title="Disk" subtitle={primaryDrive.type}>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
          {primaryDrive.usagePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>%</span>
      </div>

      <UsageBar percent={primaryDrive.usagePercent} />

      <div className="mt-3 space-y-1">
        <StatRow label="Used"  value={formatBytes(primaryDrive.usedBytes)}  accent="blue"  />
        <StatRow label="Free"  value={formatBytes(primaryDrive.freeBytes)}  accent="green" />
        <StatRow label="Total" value={formatBytes(primaryDrive.totalBytes)} accent="blue"  />
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              Read — {formatSpeed(disk.io.readBytesPerSec)}
            </p>
            <MiniChart
              data={readHistory}
              color="#22c55e"
              formatValue={formatSpeed}
              domain={[0, Math.max(...readHistory.map(p => p.value), 1)]}
              height={50}
            />
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              Write — {formatSpeed(disk.io.writeBytesPerSec)}
            </p>
            <MiniChart
              data={writeHistory}
              color="#f59e0b"
              formatValue={formatSpeed}
              domain={[0, Math.max(...writeHistory.map(p => p.value), 1)]}
              height={50}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
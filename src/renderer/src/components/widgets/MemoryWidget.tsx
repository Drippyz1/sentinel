import { useMemoryMetrics } from '../../hooks/useMetrics'
import { formatBytes, formatPercent } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'

export function MemoryWidget() {
  const memory = useMemoryMetrics()
  if (!memory) return null

  return (
    <Card title="Memory" subtitle={`${formatBytes(memory.totalBytes)} total`}>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-bold font-mono"
              style={{ color: 'var(--text-primary)' }}>
          {memory.usagePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>%</span>
      </div>

      <UsageBar percent={memory.usagePercent} />

      <div className="mt-4 space-y-1">
        <StatRow label="Used"     value={formatBytes(memory.usedBytes)}      accent="blue"   />
        <StatRow label="Free"     value={formatBytes(memory.freeBytes)}      accent="green"  />
        <StatRow label="Cached"   value={formatBytes(memory.cachedBytes)}    accent="purple" />
        <StatRow label="Swap Used" value={formatBytes(memory.swapUsedBytes)} accent="amber"  />
      </div>

      {memory.swapTotalBytes > 0 && (
        <div className="mt-4">
          <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Swap — {formatPercent(memory.swapUsagePercent)}
          </p>
          <UsageBar percent={memory.swapUsagePercent} accent="purple" />
        </div>
      )}

    </Card>
  )
}
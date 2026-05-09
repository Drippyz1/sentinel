import { useGpuMetrics } from '../../hooks/useMetrics'
import { formatBytes } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'

export function GpuWidget() {
  const gpu = useGpuMetrics()

  if (!gpu || !gpu.hasGpu) {
    return (
      <Card title="GPU">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No GPU detected.
        </p>
      </Card>
    )
  }

  const controller = gpu.controllers[0]

  return (
    <Card title="GPU" subtitle={controller.name}>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-bold font-mono"
              style={{ color: 'var(--text-primary)' }}>
          {controller.utilizationPercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>%</span>
      </div>

      <UsageBar percent={controller.utilizationPercent} />

      <div className="mt-4 space-y-1">
        <StatRow
          label="Temperature"
          value={controller.temperatureCelsius ? `${controller.temperatureCelsius}°C` : 'N/A'}
          accent="amber"
        />
        <StatRow
          label="Power Draw"
          value={controller.powerDrawWatts ? `${controller.powerDrawWatts}W` : 'N/A'}
          accent="blue"
        />
        <StatRow
          label="Power Limit"
          value={controller.powerLimitWatts ? `${controller.powerLimitWatts}W` : 'N/A'}
          accent="blue"
        />
      </div>

      {controller.vramBytes > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            VRAM — {controller.vramUsagePercent}%
          </p>
          <UsageBar percent={controller.vramUsagePercent} accent="purple" />
          <div className="mt-2 space-y-1">
            <StatRow label="Used"  value={formatBytes(controller.vramUsedBytes)} accent="purple" />
            <StatRow label="Free"  value={formatBytes(controller.vramFreeBytes)} accent="green"  />
            <StatRow label="Total" value={formatBytes(controller.vramBytes)}     accent="blue"   />
          </div>
        </div>
      )}

    </Card>
  )
}
import { useGpuMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { useTemp } from '../../hooks/useTemp'
import { formatBytes } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'
import { MiniChart } from '../ui/MiniChart'
import {
  DASHBOARD_CHART_HEIGHT,
  isCompactDashboard,
  type DashboardWidgetProps
} from './dashboardDensity'

export function GpuWidget({ density }: DashboardWidgetProps) {
  const gpu = useGpuMetrics()
  const history = useHistoryStore((state) => state.gpu)
  const { formatTemp } = useTemp()

  if (!gpu || !gpu.hasGpu) {
    return (
      <Card title="GPU" density={density}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No GPU detected.
        </p>
      </Card>
    )
  }

  const controller = gpu.controllers[0]
  const compact = isCompactDashboard(density)

  return (
    <Card title="GPU" subtitle={controller.name} density={density}>
      <div className="flex items-end gap-2 mb-3">
        <span
          className={`${compact ? 'text-3xl' : 'text-4xl'} font-bold font-mono`}
          style={{ color: 'var(--text-primary)' }}
        >
          {controller.utilizationPercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>
          %
        </span>
      </div>

      {!compact && <UsageBar percent={controller.utilizationPercent} />}

      <div
        className={compact ? 'mt-3 pt-3' : 'mt-4 pt-4'}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {history.length >= 2 ? (
          <MiniChart
            data={history}
            color="#ec4899"
            ariaLabel="Recent GPU usage trend"
            formatValue={(value) => `${value}%`}
            domain={[0, 100]}
            height={DASHBOARD_CHART_HEIGHT[density]}
          />
        ) : (
          <div
            className={`rounded-lg border px-3 text-center text-sm ${compact ? 'py-4' : 'py-6'}`}
            style={{
              backgroundColor: 'var(--bg-base)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)'
            }}
          >
            No GPU activity data available
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-4 pt-4 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
          <StatRow
            label="Temperature"
            value={formatTemp(controller.temperatureCelsius)}
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
      )}

      {!compact && controller.vramBytes > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            VRAM — {controller.vramUsagePercent}%
          </p>
          <UsageBar percent={controller.vramUsagePercent} accent="purple" />
          <div className="mt-2 space-y-1">
            <StatRow label="Used" value={formatBytes(controller.vramUsedBytes)} accent="purple" />
            <StatRow label="Free" value={formatBytes(controller.vramFreeBytes)} accent="green" />
            <StatRow label="Total" value={formatBytes(controller.vramBytes)} accent="blue" />
          </div>
        </div>
      )}
    </Card>
  )
}

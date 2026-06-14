import { useCpuMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { formatPercent } from '../../utils/format'
import { useTemp } from '../../hooks/useTemp'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'
import { MiniChart } from '../ui/MiniChart'
import { TrendIndicator } from '../ui/TrendIndicator'
import {
  DASHBOARD_CHART_HEIGHT,
  isCompactDashboard,
  type DashboardWidgetProps
} from './dashboardDensity'

export function CpuWidget({ density }: DashboardWidgetProps) {
  const cpu = useCpuMetrics()
  const history = useHistoryStore((state) => state.cpu)
  const { formatTemp } = useTemp()
  if (!cpu) return null
  const compact = isCompactDashboard(density)

  return (
    <Card title="CPU" subtitle={cpu.brand} density={density}>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1 mb-3">
        <span
          className={`${compact ? 'text-3xl' : 'text-4xl'} font-bold font-mono`}
          style={{ color: 'var(--text-primary)' }}
        >
          {cpu.usagePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>
          %
        </span>
        <span className="mb-1.5 ml-auto">
          <TrendIndicator data={history} />
        </span>
      </div>

      {!compact && <UsageBar percent={cpu.usagePercent} />}

      <div
        className={compact ? 'mt-3 pt-3' : 'mt-4 pt-4'}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <MiniChart
          data={history}
          color="#3b82f6"
          ariaLabel="Recent CPU usage trend"
          formatValue={(v) => `${v}%`}
          domain={[0, 100]}
          height={DASHBOARD_CHART_HEIGHT[density]}
        />
      </div>

      {!compact && (
        <>
          <div className="mt-4 pt-4 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
            <StatRow label="Cores" value={`${cpu.cores}`} accent="blue" />
            <StatRow label="Speed" value={`${cpu.speedGHz} GHz`} accent="blue" />
            <StatRow label="Temperature" value={formatTemp(cpu.temperature)} accent="amber" />
          </div>

          <div className="mt-4">
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Per core
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {cpu.perCoreUsage.map((usage, i) => (
                <div key={i} className="text-center">
                  <UsageBar percent={usage} height={3} />
                  <span
                    className="text-xs font-mono mt-1 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {formatPercent(usage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

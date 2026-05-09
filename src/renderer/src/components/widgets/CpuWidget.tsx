import { useCpuMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { formatPercent } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'
import { MiniChart } from '../ui/MiniChart'

export function CpuWidget() {
  const cpu     = useCpuMetrics()
  const history = useHistoryStore(state => state.cpu)
  if (!cpu) return null

  return (
    <Card title="CPU" subtitle={cpu.brand}>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
          {cpu.usagePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>%</span>
      </div>

      <UsageBar percent={cpu.usagePercent} />

      <div className="mt-3">
        <MiniChart
          data={history}
          color="#3b82f6"
          formatValue={(v) => `${v}%`}
          domain={[0, 100]}
        />
      </div>

      <div className="mt-3 space-y-1">
        <StatRow label="Cores"       value={`${cpu.cores}`}        accent="blue"  />
        <StatRow label="Speed"       value={`${cpu.speedGHz} GHz`} accent="blue"  />
        <StatRow label="Temperature" value={cpu.temperature ? `${cpu.temperature}°C` : 'N/A'} accent="amber" />
      </div>

      <div className="mt-4">
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Per core</p>
        <div className="grid grid-cols-4 gap-1.5">
          {cpu.perCoreUsage.map((usage, i) => (
            <div key={i} className="text-center">
              <UsageBar percent={usage} height={3} />
              <span className="text-xs font-mono mt-1 block" style={{ color: 'var(--text-muted)' }}>
                {formatPercent(usage, 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
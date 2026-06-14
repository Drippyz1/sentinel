import { useBatteryMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { UsageBar } from '../ui/UsageBar'
import { MiniChart } from '../ui/MiniChart'

function formatTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function healthColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 80) return 'green'
  if (pct >= 60) return 'amber'
  return 'red'
}

export function BatteryWidget() {
  const battery = useBatteryMetrics()
  const history = useHistoryStore((state) => state.battery)

  if (!battery) {
    return (
      <Card title="Battery">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading...
        </p>
      </Card>
    )
  }

  if (!battery.hasBattery) {
    return (
      <Card title="Battery">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No battery.
        </p>
      </Card>
    )
  }

  const chargeAccent = battery.isCharging
    ? 'green'
    : battery.chargePercent < 20
      ? 'red'
      : battery.chargePercent < 40
        ? 'amber'
        : 'blue'

  const statusLabel = battery.isCharging
    ? 'Charging'
    : battery.isPluggedIn
      ? 'Plugged in'
      : 'On battery'

  return (
    <Card title="Battery" subtitle={statusLabel}>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
          {battery.chargePercent}
        </span>
        <span className="text-lg mb-1" style={{ color: 'var(--text-muted)' }}>
          %
        </span>
        {battery.isCharging && (
          <span className="text-sm mb-1.5 ml-1" style={{ color: 'var(--accent-green)' }}>
            ⚡
          </span>
        )}
      </div>

      <UsageBar percent={battery.chargePercent} accent={chargeAccent} />

      <div className="mt-3">
        <MiniChart
          data={history}
          color={battery.isCharging ? '#22c55e' : '#3b82f6'}
          ariaLabel="Recent battery percentage trend"
          formatValue={(value) => `${value}%`}
          domain={[0, 100]}
        />
      </div>

      <div className="mt-4 space-y-1">
        {battery.timeRemainingMins !== null && (
          <StatRow
            label={battery.isCharging ? 'Time to full' : 'Time remaining'}
            value={formatTime(battery.timeRemainingMins)}
            accent="blue"
          />
        )}
        {battery.cycleCount !== null && (
          <StatRow label="Cycle count" value={`${battery.cycleCount}`} accent="blue" />
        )}
        {battery.voltage !== null && (
          <StatRow label="Voltage" value={`${battery.voltage.toFixed(2)}V`} accent="blue" />
        )}
      </div>

      {battery.healthPercent !== null && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Battery Health
          </p>
          <UsageBar percent={battery.healthPercent} accent={healthColor(battery.healthPercent)} />
          <div className="mt-2 space-y-1">
            <StatRow
              label="Health"
              value={`${battery.healthPercent}%`}
              accent={healthColor(battery.healthPercent)}
            />
            {battery.capacityWh !== null && (
              <StatRow
                label="Current capacity"
                value={`${battery.capacityWh.toFixed(1)} Wh`}
                accent="blue"
              />
            )}
            {battery.designCapacityWh !== null && (
              <StatRow
                label="Design capacity"
                value={`${battery.designCapacityWh.toFixed(1)} Wh`}
                accent="blue"
              />
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

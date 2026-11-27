import { useBatteryMetrics } from '../../hooks/useMetrics'
import { useUiSettingsStore } from '../../store/uiSettingsStore'
import { formatPercent } from '../../utils/format'
import { LiveChart } from '../ui/MiniChart'
import { MetricMessage } from './MetricMessage'
import { MetricDetails, MetricFacts, PercentDisplay, WidgetFrame } from './MetricVisuals'
import type { DashboardWidgetProps } from './dashboardDensity'

function duration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return 'Unavailable'
  return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m`
}
const quantity = (value: number | null, unit: string) =>
  Number.isFinite(value) && value !== null ? `${value.toFixed(1)} ${unit}` : 'Unavailable'

export function BatteryWidget({
  expanded,
  showChart = true,
  style = 'ring'
}: DashboardWidgetProps) {
  const battery = useBatteryMetrics()
  const paused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  return (
    <WidgetFrame
      id="battery"
      title="Battery"
      meta={battery?.hasBattery ? (battery.isPluggedIn ? 'AC power' : 'On battery') : undefined}
    >
      {battery?.hasBattery ? (
        <>
          <div className="instrument-split">
            <PercentDisplay
              value={battery.chargePercent}
              style={style === 'ring' || style === 'bar' ? style : 'number'}
            />
            <div>
              <strong>
                {battery.isCharging
                  ? 'Charging'
                  : battery.isPluggedIn
                    ? 'Plugged in'
                    : 'Discharging'}
              </strong>
              {battery.healthPercent !== null && (
                <p className="instrument-note">
                  Health · {formatPercent(battery.healthPercent, 0)}
                </p>
              )}
            </div>
          </div>
          <MetricDetails expanded={expanded} label="Battery health">
            <MetricFacts
              values={[
                [
                  paused ? 'Last time estimate' : 'Estimated time remaining',
                  duration(battery.timeRemainingMins)
                ],
                ['Cycle count', battery.cycleCount?.toString() ?? 'Unavailable'],
                ['Voltage', quantity(battery.voltage, 'V')],
                ['Current capacity', quantity(battery.capacityWh, 'Wh')],
                ['Design capacity', quantity(battery.designCapacityWh, 'Wh')]
              ]}
            />
            {showChart && (
              <LiveChart
                series="battery"
                label="Battery charge"
                color="var(--metric-ink)"
                max={100}
                formatValue={formatPercent}
              />
            )}
          </MetricDetails>
        </>
      ) : (
        <MetricMessage group="battery" name="battery readings" notDetected="No battery detected." />
      )}
    </WidgetFrame>
  )
}

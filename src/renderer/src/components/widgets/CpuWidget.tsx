import { useCpuMetrics, useCpuTemperature } from '../../hooks/useMetrics'
import { useTemp } from '../../hooks/useTemp'
import { formatPercent } from '../../utils/format'
import { LiveChart } from '../ui/MiniChart'
import { MetricMessage } from './MetricMessage'
import {
  CoreActivity,
  MetricDetails,
  MetricFacts,
  PercentDisplay,
  WidgetFrame
} from './MetricVisuals'
import type { DashboardWidgetProps } from './dashboardDensity'

export function CpuWidget({ expanded, showChart = true, style = 'gauge' }: DashboardWidgetProps) {
  const cpu = useCpuMetrics()
  const temperature = useCpuTemperature()
  const { formatTemp } = useTemp()
  const timeline = (
    <LiveChart
      series="cpu"
      label="CPU utilization"
      color="var(--metric-ink)"
      max={100}
      formatValue={formatPercent}
      calibrated
    />
  )
  return (
    <WidgetFrame id="cpu" title="Processor" meta="CPU">
      {cpu ? (
        <>
          <div className="instrument-split">
            <PercentDisplay
              value={cpu.usagePercent}
              style={style === 'gauge' || style === 'bar' ? style : 'number'}
              note="How busy the processor is"
            />
            <div className="cpu-observed">
              <strong>{cpu.brand}</strong>
              <span>{cpu.cores} logical processors</span>
              <span>Temperature: {formatTemp(temperature)}</span>
            </div>
          </div>
          {showChart && timeline}
          <CoreActivity cores={cpu.perCoreUsage} />
          <MetricDetails expanded={expanded} label="Core activity">
            <MetricFacts
              values={[
                ['Nominal clock', cpu.speedGHz > 0 ? `${cpu.speedGHz} GHz` : 'Unavailable'],
                ['Physical cores', cpu.physicalCores?.toString() ?? 'Unavailable']
              ]}
            />
            {cpu.loadAverage?.length === 3 && cpu.loadAverage.every(Number.isFinite) && (
              <MetricFacts
                values={[
                  [
                    'System load (1 / 5 / 15 min)',
                    cpu.loadAverage.map((value) => value.toFixed(2)).join(' / ')
                  ]
                ]}
              />
            )}
            <p className="instrument-note">
              Temperature depends on OS sensor access. An unavailable sensor does not indicate
              overheating.
            </p>
          </MetricDetails>
        </>
      ) : (
        <>
          <MetricMessage group="cpu" name="processor data" />
          {temperature !== null && (
            <MetricFacts values={[['Temperature', formatTemp(temperature)]]} />
          )}
        </>
      )}
    </WidgetFrame>
  )
}

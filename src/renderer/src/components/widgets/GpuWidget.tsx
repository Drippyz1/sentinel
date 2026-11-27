import { useGpuMetrics } from '../../hooks/useMetrics'
import { useTemp } from '../../hooks/useTemp'
import { formatBytes, formatPercent } from '../../utils/format'
import { LiveChart } from '../ui/MiniChart'
import { MetricMessage } from './MetricMessage'
import {
  FractionMeter,
  MetricDetails,
  MetricFacts,
  PercentDisplay,
  WidgetFrame
} from './MetricVisuals'
import type { DashboardWidgetProps } from './dashboardDensity'

const watts = (value: number | null) => (value === null ? 'Unavailable' : `${value} W`)

export function GpuWidget({ expanded, showChart = true, style = 'gauge' }: DashboardWidgetProps) {
  const controllers = useGpuMetrics()?.controllers
  const controller = controllers?.[0]
  const { formatTemp } = useTemp()
  const timeline = controller?.utilizationPercent != null && (
    <LiveChart
      series="gpu"
      label="GPU utilization"
      color="var(--metric-ink)"
      max={100}
      formatValue={formatPercent}
    />
  )
  return (
    <WidgetFrame id="gpu" title="Graphics" meta="GPU">
      {controller ? (
        <>
          <div className="instrument-split">
            <PercentDisplay
              value={controller.utilizationPercent}
              style={style === 'gauge' ? 'gauge' : 'number'}
              note="GPU utilization"
            />
            <p className="instrument-note">{controller.name}</p>
          </div>
          {showChart && timeline}
          {controller.vramUsagePercent != null && (
            <>
              <p className="instrument-note">
                VRAM · {formatPercent(controller.vramUsagePercent, 0)}
              </p>
              <FractionMeter value={controller.vramUsagePercent} />
            </>
          )}
          <MetricDetails expanded={expanded} label="Graphics details">
            <MetricFacts
              values={[
                ['Temperature', formatTemp(controller.temperatureCelsius)],
                ['Power draw', watts(controller.powerDrawWatts)],
                ['Power limit', watts(controller.powerLimitWatts)],
                ['VRAM used', formatBytes(controller.vramUsedBytes)],
                ['VRAM free', formatBytes(controller.vramFreeBytes)],
                ['VRAM total', formatBytes(controller.vramBytes)]
              ]}
            />
            {controller.utilizationPercent === null && (
              <p className="instrument-note">
                The OS identified this adapter but did not expose utilization through the current
                provider.
              </p>
            )}
            {controllers?.slice(1).map((adapter, index) => (
              <section key={index} className="interface-detail">
                <strong>{adapter.name}</strong>
                <MetricFacts
                  values={[
                    ['Utilization', formatPercent(adapter.utilizationPercent)],
                    ['Dedicated memory', formatBytes(adapter.vramBytes)],
                    ['Temperature', formatTemp(adapter.temperatureCelsius)]
                  ]}
                />
              </section>
            ))}
          </MetricDetails>
        </>
      ) : (
        <MetricMessage group="gpu" name="GPU readings" notDetected="No GPU detected." />
      )}
    </WidgetFrame>
  )
}

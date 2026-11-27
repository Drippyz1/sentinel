import { useMemoryMetrics } from '../../hooks/useMetrics'
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

export function MemoryWidget({ expanded, showChart = true, style = 'ring' }: DashboardWidgetProps) {
  const memory = useMemoryMetrics()
  const timeline = (
    <LiveChart
      series="memory"
      label="Active memory"
      color="var(--metric-ink)"
      max={100}
      formatValue={formatPercent}
      calibrated
    />
  )
  return (
    <WidgetFrame id="memory" title="Memory" meta="RAM">
      {memory ? (
        <>
          <div className="instrument-split">
            <PercentDisplay
              value={memory.usagePercent}
              style={style === 'ring' || style === 'bar' ? style : 'number'}
            />
            <div>
              <strong>{formatBytes(memory.usedBytes)} active</strong>
              <p className="instrument-note">of {formatBytes(memory.totalBytes)} physical</p>
            </div>
          </div>
          {showChart && timeline}
          {memory.totalBytes > 0 &&
            memory.activeBytes >= 0 &&
            memory.activeBytes <= memory.totalBytes && (
              <div className="memory-composition">
                <strong>Memory composition</strong>
                <div
                  role="img"
                  aria-label={`${formatBytes(memory.activeBytes)} active; ${formatBytes(memory.totalBytes - memory.activeBytes)} not counted as active`}
                >
                  <span style={{ width: `${(100 * memory.activeBytes) / memory.totalBytes}%` }} />
                </div>
                <div>
                  <span>Active · {formatBytes(memory.activeBytes)}</span>
                  <span>Not active · {formatBytes(memory.totalBytes - memory.activeBytes)}</span>
                </div>
              </div>
            )}
          <MetricFacts
            values={[
              ['Estimated available', formatBytes(memory.availableBytes ?? null)],
              [
                'Swap used',
                memory.swapUsedBytes === null ? 'Unavailable' : formatBytes(memory.swapUsedBytes)
              ]
            ]}
          />
          <MetricDetails expanded={expanded} label="Memory and swap">
            <MetricFacts
              values={[
                ['Free now', formatBytes(memory.freeBytes)],
                ['Cached', formatBytes(memory.cachedBytes)],
                ['Inactive', formatBytes(memory.inactiveBytes)],
                [
                  'Swap used',
                  `${formatBytes(memory.swapUsedBytes)} / ${formatBytes(memory.swapTotalBytes)}`
                ]
              ]}
            />
            {memory.swapUsagePercent !== null && (
              <>
                <p className="instrument-note">Swap: {formatPercent(memory.swapUsagePercent, 0)}</p>
                <FractionMeter value={memory.swapUsagePercent} />
              </>
            )}
            <p className="instrument-note">
              Active memory is not OS memory pressure. Some cached memory can be reused. These
              provider categories are shown independently. Swap is storage used as virtual memory.
            </p>
          </MetricDetails>
        </>
      ) : (
        <MetricMessage group="memory" name="memory data" />
      )}
    </WidgetFrame>
  )
}

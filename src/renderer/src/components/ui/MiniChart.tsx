import { useContext, useId, useMemo } from 'react'
import { observationRuns, LIVE_WINDOW_MS } from '../../../../shared/utils/visualization'
import { useHistoryStore, type LiveSeriesKey, type DataPoint } from '../../store/historyStore'
import { formatTime } from '../../utils/format'
import { LiveTraceWindow } from './liveTraceWindow'

type Mode = 'line' | 'area' | 'bars'
type Formatter = (value: number) => string
const WIDTH = 200
const HEIGHT = 44
const PAD = 3

export function LiveChart({
  series,
  color,
  label,
  max,
  formatValue,
  mode,
  calibrated
}: {
  series: LiveSeriesKey
  color: string
  label: string
  max?: number
  formatValue: Formatter
  mode?: Mode
  calibrated?: boolean
}) {
  const data = useHistoryStore((state) => state[series])
  return (
    <MiniChart
      data={data}
      color={color}
      label={label}
      max={max}
      formatValue={formatValue}
      mode={mode}
      calibrated={calibrated}
    />
  )
}

export function LiveThroughput({
  down,
  up,
  formatValue,
  mode
}: {
  down: LiveSeriesKey
  up: LiveSeriesKey
  formatValue: Formatter
  mode?: Mode
}) {
  const first = useHistoryStore((state) => state[down])
  const second = useHistoryStore((state) => state[up])
  const domain = useMemo(
    () => ({
      max: Math.max(1, ...first.map((p) => p.value ?? 0), ...second.map((p) => p.value ?? 0)),
      end: Math.max(first.at(-1)?.timestamp ?? 0, second.at(-1)?.timestamp ?? 0),
      earliest: Math.min(first[0]?.timestamp ?? Infinity, second[0]?.timestamp ?? Infinity)
    }),
    [first, second]
  )
  const network = down === 'networkDown'
  return (
    <div className="activity-pair">
      <MiniChart
        data={first}
        end={domain.end}
        earliest={domain.earliest}
        max={domain.max}
        color="var(--series-network)"
        label={network ? 'Download' : 'Read'}
        formatValue={formatValue}
        mode={mode}
      />
      <MiniChart
        data={second}
        end={domain.end}
        earliest={domain.earliest}
        max={domain.max}
        color="var(--accent-blue)"
        label={network ? 'Upload' : 'Write'}
        formatValue={formatValue}
        mode={mode}
      />
    </div>
  )
}

export function MiniChart({
  data,
  color,
  label,
  max,
  end,
  earliest,
  formatValue,
  mode,
  calibrated
}: {
  data: DataPoint[]
  color: string
  label: string
  max?: number
  end?: number
  earliest?: number
  formatValue: Formatter
  mode?: Mode
  calibrated?: boolean
}) {
  const id = useId()
  const chosenWindow = useContext(LiveTraceWindow)
  const lastTimestamp = end ?? data.at(-1)?.timestamp ?? 0
  const windowMs =
    chosenWindow ??
    Math.min(
      LIVE_WINDOW_MS,
      Math.max(20_000, lastTimestamp - (earliest ?? data[0]?.timestamp ?? lastTimestamp))
    )
  const start = lastTimestamp - windowMs
  const runs = useMemo(
    () =>
      observationRuns(
        data.filter(({ timestamp }) => timestamp >= start),
        max
      ),
    [data, max, start]
  )
  const latest = runs.at(-1)?.at(-1)
  if (!latest) return <p className="live-chart-empty">{label}: no observations yet</p>
  const points = runs.flat()
  const ceiling = max ?? Math.max(1, ...points.map((p) => p.value ?? 0))
  const x = (point: DataPoint) => PAD + ((point.timestamp - start) / windowMs) * (WIDTH - 2 * PAD)
  const y = (point: DataPoint) => HEIGHT - PAD - ((point.value ?? 0) / ceiling) * (HEIGHT - 2 * PAD)
  const when = formatTime(new Date(latest.timestamp))
  const last = latest === data.at(-1) ? 'Latest' : 'Last known'
  return (
    <figure
      className="live-chart"
      data-calibrated={calibrated || undefined}
      data-mode={mode ?? 'theme'}
      aria-labelledby={id}
      title={`${label} · ${last} ${formatValue(latest.value ?? 0)} at ${when}`}
    >
      <figcaption id={id}>
        <strong>{label}</strong>
        <span>
          0 – {formatValue(ceiling)} · {Math.ceil(windowMs / 1000)}s
        </span>
      </figcaption>
      <div className="trace-plot">
        {calibrated && (
          <div className="trace-y" aria-hidden="true">
            {[1, 0.75, 0.5, 0.25, 0].map((part) => (
              <span key={part}>{formatValue(part * ceiling)}</span>
            ))}
          </div>
        )}
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <path
            className="live-grid-line"
            d={
              calibrated
                ? [0, 0.25, 0.5, 0.75, 1]
                    .map(
                      (part) =>
                        `M${PAD} ${PAD + part * (HEIGHT - 2 * PAD)}H${WIDTH - PAD} M${PAD + part * (WIDTH - 2 * PAD)} ${PAD}V${HEIGHT - PAD}`
                    )
                    .join(' ')
                : `M0 ${HEIGHT - PAD}H${WIDTH} M0 ${HEIGHT / 2}H${WIDTH}`
            }
          />
          {mode === 'bars' ? (
            <path
              d={points
                .map(
                  (point) =>
                    `M${x(point).toFixed(1)} ${(y(point) - (point.value === 0 ? 1 : 0)).toFixed(1)}V${HEIGHT - PAD}`
                )
                .join(' ')}
              stroke={color}
              strokeWidth="2"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            runs.map((run) => {
              const first = run[0]
              if (run.length === 1)
                return (
                  <circle key={first.timestamp} cx={x(first)} cy={y(first)} r={1.5} fill={color} />
                )
              const line = run
                .map(
                  (point, index) =>
                    `${index ? 'L' : 'M'}${x(point).toFixed(1)} ${y(point).toFixed(1)}`
                )
                .join(' ')
              return (
                <g key={first.timestamp}>
                  <path
                    className="live-chart-area"
                    d={`${line} L${x(run[run.length - 1])} ${HEIGHT - PAD} L${x(first)} ${HEIGHT - PAD}Z`}
                    fill={color}
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )
            })
          )}
        </svg>
      </div>
      {calibrated && (
        <div className="trace-x" aria-hidden="true">
          {[start, start + windowMs / 2, lastTimestamp].map((timestamp) => (
            <span key={timestamp}>{formatTime(new Date(timestamp))}</span>
          ))}
        </div>
      )}
      <span className="sr-only">
        {last} {formatValue(latest.value ?? 0)} at {when}. {Math.ceil(windowMs / 1000)}-second
        observation window; missing data is not joined.
      </span>
    </figure>
  )
}

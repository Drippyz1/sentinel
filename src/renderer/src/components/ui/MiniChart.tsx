import { useId, useMemo } from 'react'
import type { DataPoint } from '../../store/historyStore'

interface MiniChartProps {
  data: DataPoint[]
  color: string
  ariaLabel: string
  label?: string
  status?: string
  formatValue?: (value: number) => string
  domain?: [number, number]
  height?: number
}

const WIDTH = 320
const INSET = 4

export function MiniChart({
  data,
  color,
  ariaLabel,
  label = 'Last 2 minutes',
  status,
  formatValue = String,
  domain = [0, 100],
  height = 74
}: MiniChartProps) {
  const id = useId()
  const [min, max] = domain
  const plot = useMemo(() => {
    if (data.length < 2) return null
    const first = data[0]
    const last = data[data.length - 1]
    const elapsed = Math.max(1, last.timestamp - first.timestamp)
    const scale = Math.max(1, max - min)
    const points = data.map(({ timestamp, value }) => [
      INSET + ((timestamp - first.timestamp) / elapsed) * (WIDTH - INSET * 2),
      height - INSET - ((Math.min(max, Math.max(min, value)) - min) / scale) * (height - INSET * 2)
    ])
    const line = points
      .map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ')
    const lowerEdge = height - INSET
    const values = data.map(({ value }) => value)
    return {
      line,
      fill: `${line} L${points[points.length - 1][0]} ${lowerEdge} L${points[0][0]} ${lowerEdge} Z`,
      last: points[points.length - 1],
      stats: [
        ['Latest', last.value],
        ['Min', Math.min(...values)],
        ['Max', Math.max(...values)],
        ['Average', values.reduce((sum, value) => sum + value, 0) / values.length]
      ] as const
    }
  }, [data, height, min, max])

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      aria-describedby={plot ? `${id}-summary` : undefined}
      tabIndex={plot ? 0 : undefined}
      className="group relative min-w-0 rounded-lg border px-2.5 pt-2 pb-1 focus-visible:outline"
      style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}
    >
      <div className="mb-0.5 flex min-w-0 flex-wrap items-center justify-between gap-x-2">
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ color: 'var(--text-muted)' }}
        >
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
        {status && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {status}
          </span>
        )}
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {plot && (
          <>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <path d={plot.fill} fill={`url(#${id})`} />
            <path
              d={plot.line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={plot.last[0]} cy={plot.last[1]} r={3.5} fill={color} />
          </>
        )}
      </svg>
      {plot && (
        <dl
          id={`${id}-summary`}
          className="pointer-events-none absolute right-2 top-7 z-10 hidden w-32 rounded-lg border p-2 text-xs shadow-xl group-hover:block group-focus:block"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {plot.stats.map(([name, value]) => (
            <div key={name} className="flex flex-wrap justify-between gap-x-2">
              <dt style={{ color: 'var(--text-muted)' }}>{name}</dt>
              <dd className="font-mono tabular-nums">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

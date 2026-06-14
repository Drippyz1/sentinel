import { useId, useMemo } from 'react'
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

interface ChartSummary {
  latest: number
  min: number
  max: number
  average: number
}

function SummaryTooltip({
  active,
  summary,
  formatValue
}: {
  active?: boolean
  summary: ChartSummary | null
  formatValue: (value: number) => string
}) {
  if (!active || !summary) return null

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-xl"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {[
        ['Latest', summary.latest],
        ['Min', summary.min],
        ['Max', summary.max],
        ['Average', summary.average]
      ].map(([label, value]) => (
        <div key={label} className="flex min-w-32 items-center justify-between gap-4">
          <span style={{ color: 'var(--text-muted)' }}>{label}</span>
          <span
            className="font-mono font-medium tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatValue(value as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MiniChart({
  data,
  color,
  ariaLabel,
  label = 'Last 2 minutes',
  status,
  formatValue = (value) => `${value}`,
  domain = [0, 100],
  height = 74
}: MiniChartProps) {
  const gradientId = `mini-chart-gradient-${useId().replace(/:/g, '')}`
  const chartData = useMemo(
    () => data.map((point) => ({ t: point.timestamp, v: point.value })),
    [data]
  )
  const summary = useMemo<ChartSummary | null>(() => {
    if (data.length === 0) return null

    const values = data.map((point) => point.value)
    return {
      latest: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      average: values.reduce((total, value) => total + value, 0) / values.length
    }
  }, [data])
  const latestPoint = chartData[chartData.length - 1]

  if (chartData.length < 2) return null

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="min-w-0 overflow-hidden rounded-lg border px-2.5 pt-2 pb-1"
      style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}
    >
      <div className="mb-0.5 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span
            className="truncate text-[10px] font-semibold tracking-wide uppercase"
            style={{ color: 'var(--text-muted)' }}
          >
            {label}
          </span>
        </div>
        {status && (
          <span
            className="shrink-0 truncate text-[10px] font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {status}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 6, right: 5, left: 3, bottom: 1 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} hide />
          <YAxis domain={domain} hide />
          <Tooltip
            content={(props) => (
              <SummaryTooltip active={props.active} summary={summary} formatValue={formatValue} />
            )}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: 'var(--bg-card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={latestPoint.t}
            y={latestPoint.v}
            r={3.5}
            fill={color}
            stroke="var(--bg-card)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

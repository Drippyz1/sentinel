import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
  Tooltip,
} from 'recharts'
import { DataPoint } from '../../store/historyStore'

interface MiniChartProps {
  data:          DataPoint[]
  color:         string
  formatValue?:  (value: number) => string
  domain?:       [number, number]
  height?:       number
}

function CustomTooltip({ active, payload, formatValue }: {
  active?:      boolean
  payload?:     { value?: number }[]
  formatValue?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const value = payload[0].value ?? 0
  return (
    <div
      className="px-2 py-1 rounded text-xs font-mono"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)'
      }}
    >
      {formatValue ? formatValue(value) : `${value}`}
    </div>
  )
}

export function MiniChart({
  data,
  color,
  formatValue,
  domain = [0, 100],
  height = 60
}: MiniChartProps) {
  const chartData = data.map(p => ({ t: p.timestamp, v: p.value }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <YAxis domain={domain} hide />
        <Tooltip
          content={(props) => (
            <CustomTooltip
              active={props.active}
              payload={props.payload as unknown as { value?: number }[] | undefined}
              formatValue={formatValue}
            />
          )}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`${color}20`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

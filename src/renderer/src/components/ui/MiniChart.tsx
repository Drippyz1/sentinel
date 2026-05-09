import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
  Tooltip,
  TooltipProps
} from 'recharts'
import { DataPoint } from '../../store/historyStore'

interface MiniChartProps {
  data:       DataPoint[]
  color:      string        // hex or css var value e.g. "#3b82f6"
  formatValue?: (value: number) => string  // how to display the value in tooltip
  domain?:    [number, number]             // Y axis min/max, defaults to [0, 100]
  height?:    number
}

// Custom tooltip that appears on hover
// We type it properly so TypeScript is happy
function CustomTooltip({ active, payload, formatValue }: TooltipProps<number, string> & {
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

  // Recharts needs objects with named keys — our DataPoint already has this
  // but we rename "value" to "v" just to keep the chart config short
  const chartData = data.map(p => ({ t: p.timestamp, v: p.value }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>

        {/* Hidden Y axis just to enforce the domain */}
        <YAxis domain={domain} hide />

        <Tooltip
          content={(props) => <CustomTooltip {...props} formatValue={formatValue} />}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
        />

        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          // Fill is a gradient from the line color fading to transparent
          fill={`${color}20`}   // 20 = hex for ~12% opacity
          dot={false}           // no dots on each data point
          isAnimationActive={false}  // disable animation for live data
        />

      </AreaChart>
    </ResponsiveContainer>
  )
}
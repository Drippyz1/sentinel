import type { DataPoint } from '../../store/historyStore'
import { getTrendDirection } from '../../utils/trend'
import type { TrendDirection } from '../../utils/trend'

interface TrendIndicatorProps {
  data: DataPoint[]
  threshold?: number
}

const trendDisplay: Record<TrendDirection, { arrow: string; label: string; color: string }> = {
  rising: { arrow: '↑', label: 'Rising', color: 'var(--accent-amber)' },
  falling: { arrow: '↓', label: 'Falling', color: 'var(--accent-green)' },
  stable: { arrow: '→', label: 'Stable', color: 'var(--text-muted)' }
}

export function TrendIndicator({ data, threshold }: TrendIndicatorProps) {
  const direction = getTrendDirection(data, threshold)
  const display = trendDisplay[direction]

  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap"
      style={{ color: display.color }}
      aria-label={`Trend: ${display.label}`}
    >
      <span aria-hidden="true">{display.arrow}</span>
      {display.label}
    </span>
  )
}

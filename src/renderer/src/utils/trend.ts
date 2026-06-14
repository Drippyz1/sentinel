import type { DataPoint } from '../store/historyStore'

export type TrendDirection = 'rising' | 'falling' | 'stable'

export function getTrendDirection(data: DataPoint[], threshold = 1): TrendDirection {
  if (data.length < 4) return 'stable'

  const recent = data.slice(-Math.min(data.length, 10))
  const midpoint = Math.floor(recent.length / 2)
  const earlierValues = recent.slice(0, midpoint)
  const latestValues = recent.slice(midpoint)
  const average = (values: DataPoint[]) =>
    values.reduce((total, point) => total + point.value, 0) / values.length
  const change = average(latestValues) - average(earlierValues)

  if (change > threshold) return 'rising'
  if (change < -threshold) return 'falling'
  return 'stable'
}

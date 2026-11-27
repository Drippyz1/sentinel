export function observedSummary(values: Iterable<number | null>) {
  let count = 0
  let min: number | null = null
  let max: number | null = null
  let average = 0
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue
    count++
    min = min === null ? value : Math.min(min, value)
    max = max === null ? value : Math.max(max, value)
    average += (value - average) / count
  }
  return { count, min, max, average: count ? average : null }
}

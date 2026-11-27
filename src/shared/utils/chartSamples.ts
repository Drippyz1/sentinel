import { HISTORY_BUCKET_MS } from '../contracts/history'

interface ChartSample {
  timestamp: number
  value: number | null
}

// Reduce valid values first; restore every gap between retained observations in one pass.
export function projectHistoryChart(samples: ChartSample[], bucketCount = 120): ChartSample[] {
  const isObserved = (sample: ChartSample) => sample.value !== null && Number.isFinite(sample.value)
  const observations = samples.filter(isObserved)
  if (!observations.length) return []

  const selected = selectChartSamples(observations, bucketCount)
  const result: ChartSample[] = []
  let next = 0
  let previous: ChartSample | undefined
  let gap: number | undefined
  for (const sample of samples) {
    if (previous && sample.timestamp - previous.timestamp > HISTORY_BUCKET_MS) {
      gap ??= previous.timestamp + HISTORY_BUCKET_MS
    }
    previous = sample
    if (!isObserved(sample)) gap ??= sample.timestamp
    if (sample !== selected[next]) continue
    if (gap !== undefined) result.push({ timestamp: gap, value: null })
    result.push(sample)
    gap = undefined
    next++
  }
  if (gap !== undefined && previous) result.push({ timestamp: previous.timestamp, value: null })
  return result
}

// This is view-only decimation. Keep endpoints, bucket extrema, and a gap indicator.
export function selectChartSamples(samples: ChartSample[], bucketCount = 120): ChartSample[] {
  if (samples.length <= bucketCount * 2 + 2) return samples
  const result = [samples[0]]
  const interior = samples.length - 2
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = 1 + Math.floor((bucket * interior) / bucketCount)
    const end = 1 + Math.floor(((bucket + 1) * interior) / bucketCount)
    let min = -1
    let minValue = Infinity
    let max = -1
    let maxValue = -Infinity
    let gap = -1
    for (let i = start; i < end; i++) {
      const value = samples[i].value
      if (value === null) {
        if (gap < 0) gap = i
      } else {
        if (value < minValue) {
          min = i
          minValue = value
        }
        if (value >= maxValue) {
          max = i
          maxValue = value
        }
      }
    }
    for (const i of [...new Set([min, max, gap])].sort((a, b) => a - b)) {
      if (i >= 0) result.push(samples[i])
    }
  }
  result.push(samples[samples.length - 1])
  return result
}

interface ChartSample {
  timestamp: number
  value: number | null
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

import type { DiskDrive } from '../contracts/metrics'

export interface Observation {
  timestamp: number
  value: number | null
  breakBefore?: boolean
}

export const LIVE_WINDOW_MS = 120_000
const MAX_OBSERVATIONS = 122

export function boundedPercent(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null
}

export function appendObservation(
  points: Observation[],
  sample: Observation | undefined,
  frameTime: number
): Observation[] {
  const cutoff = frameTime - LIVE_WINDOW_MS
  const recent =
    points[0]?.timestamp < cutoff ? points.filter((point) => point.timestamp >= cutoff) : points
  if (
    !sample ||
    !Number.isFinite(sample.timestamp) ||
    sample.timestamp < cutoff ||
    (recent.length && sample.timestamp <= recent[recent.length - 1].timestamp)
  )
    return recent
  return [
    ...recent,
    {
      ...sample,
      value:
        sample.value !== null && Number.isFinite(sample.value) && sample.value >= 0
          ? sample.value
          : null
    }
  ].slice(-MAX_OBSERVATIONS)
}

export function observationRuns(points: readonly Observation[], max = Infinity): Observation[][] {
  const runs: Observation[][] = []
  let run: Observation[] | undefined
  let previous: Observation | undefined
  for (const point of points) {
    if (!Number.isFinite(point.timestamp)) continue
    if (point.breakBefore || (previous && point.timestamp - previous.timestamp > 35_000))
      run = undefined
    if (previous && point.timestamp <= previous.timestamp) continue
    previous = point
    if (
      point.value === null ||
      !Number.isFinite(point.value) ||
      point.value < 0 ||
      point.value > max
    ) {
      run = undefined
      continue
    }
    if (!run) {
      run = []
      runs.push(run)
    }
    run.push(point)
  }
  return runs
}

export function capacityParts(
  drive: Pick<
    DiskDrive,
    | 'totalBytes'
    | 'usedBytes'
    | 'availableBytes'
    | 'freeBytes'
    | 'availableIncludesPurgeable'
    | 'purgeableBytes'
  >
) {
  const {
    totalBytes,
    usedBytes,
    availableBytes,
    freeBytes,
    purgeableBytes,
    availableIncludesPurgeable
  } = drive
  if (
    ![totalBytes, usedBytes, availableBytes, freeBytes].every(
      (v) => Number.isFinite(v) && v >= 0
    ) ||
    totalBytes <= 0 ||
    usedBytes + availableBytes > totalBytes ||
    freeBytes > availableBytes
  )
    return null
  const split =
    availableIncludesPurgeable &&
    purgeableBytes !== null &&
    purgeableBytes >= 0 &&
    freeBytes + purgeableBytes === availableBytes
  return [
    { kind: 'used', value: usedBytes },
    { kind: 'reserved', value: totalBytes - usedBytes - availableBytes },
    ...(split
      ? [
          { kind: 'purgeable', value: purgeableBytes },
          { kind: 'free', value: freeBytes }
        ]
      : [{ kind: availableIncludesPurgeable ? 'available' : 'free', value: availableBytes }])
  ].filter((part) => part.value > 0)
}

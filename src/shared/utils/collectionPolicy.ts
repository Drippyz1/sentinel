import { METRIC_GROUPS, type MetricGroup } from '../contracts/metrics'
import type { CollectionOverrides } from '../contracts/settings'

export const COLLECTION_INTERVALS = [1000, 2000, 5000, 10000, 15000, 30000] as const

const DEFAULT_MINIMUMS: Record<MetricGroup, number> = {
  cpu: 0,
  cpuTemperature: 10000,
  memory: 0,
  diskCapacity: 15000,
  diskIo: 0,
  network: 0,
  gpu: 15000,
  battery: 10000,
  processes: 5000
}

export function resolveCollectionIntervals(
  baseMs: number,
  overrides: CollectionOverrides = {}
): Record<MetricGroup, number> {
  return Object.fromEntries(
    METRIC_GROUPS.map((group) => [
      group,
      overrides[group] ?? Math.max(baseMs, DEFAULT_MINIMUMS[group])
    ])
  ) as Record<MetricGroup, number>
}

export function isCollectionInterval(value: unknown): value is number {
  return COLLECTION_INTERVALS.some((option) => option === value)
}

export function normalizeCollectionOverrides(value: unknown): CollectionOverrides {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const overrides: CollectionOverrides = {}
  for (const group of METRIC_GROUPS) {
    if (Object.hasOwn(raw, group) && isCollectionInterval(raw[group])) overrides[group] = raw[group]
  }
  return overrides
}

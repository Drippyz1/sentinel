import type { MetricCollectionResult, MetricUnavailableReason } from '../shared/contracts/metrics'

export function observed<T>(value: T): MetricCollectionResult<T> {
  return { state: 'ok', value }
}

export function unavailable(reason: MetricUnavailableReason): MetricCollectionResult<never> {
  return { state: 'unavailable', reason }
}

export function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function percent(value: unknown): number | null {
  const number = nonNegative(value)
  return number !== null && number <= 100 ? number : null
}

export function cachedProbe<T>(
  load: () => Promise<T>,
  maxAgeMs = Infinity,
  now = () => performance.now()
): () => Promise<T> {
  let cache: { value: T; expiresAt: number } | undefined
  let active: Promise<T> | undefined

  return () => {
    if (active) return active
    if (cache && now() < cache.expiresAt) return Promise.resolve(cache.value)
    active = Promise.resolve()
      .then(load)
      .then((value) => {
        cache = { value, expiresAt: now() + maxAgeMs }
        return value
      })
      .finally(() => {
        active = undefined
      })
    return active
  }
}

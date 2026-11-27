export interface ByteCounters {
  id: string
  read: number | null
  write: number | null
}

interface ByteRates {
  read: number | null
  write: number | null
}

export function counterRate(
  previous: number | null,
  current: number | null,
  elapsedMs: number
): number | null {
  if (
    previous === null ||
    current === null ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current) ||
    previous < 0 ||
    current < previous ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0
  )
    return null
  const rate = ((current - previous) / elapsedMs) * 1000
  return Number.isFinite(rate) ? rate : null
}

// Supported collection policies are at most 30 seconds. Longer gaps are not live intervals.
export function usableInterval(elapsed: number, wallElapsed = elapsed): boolean {
  return (
    Number.isFinite(elapsed) &&
    elapsed > 0 &&
    elapsed <= 45_000 &&
    Number.isFinite(wallElapsed) &&
    wallElapsed > 0 &&
    Math.abs(wallElapsed - elapsed) <= 5000
  )
}

export class CounterRates {
  private previous = new Map<string, ByteCounters>()
  private sampledAt: number | undefined
  private wallAt: number | undefined

  clear(): void {
    this.previous.clear()
    this.sampledAt = undefined
    this.wallAt = undefined
  }

  sample(counters: ByteCounters[], now: number, wallAt = now): Map<string, ByteRates> {
    const elapsed = this.sampledAt === undefined ? 0 : now - this.sampledAt
    const interval = usableInterval(elapsed, wallAt - (this.wallAt ?? wallAt)) ? elapsed : 0
    const rates = new Map(
      counters.map((counter) => {
        const previous = this.previous.get(counter.id)
        return [
          counter.id,
          {
            read: counterRate(previous?.read ?? null, counter.read, interval),
            write: counterRate(previous?.write ?? null, counter.write, interval)
          }
        ]
      })
    )
    this.previous = new Map(counters.map((counter) => [counter.id, counter]))
    this.sampledAt = now
    this.wallAt = wallAt
    return rates
  }
}

export function sumCompleteRates(rates: (number | null)[]): number | null {
  if (!rates.length) return null
  let sum = 0
  for (const rate of rates) {
    if (rate === null || !Number.isFinite(rate) || rate < 0) return null
    sum += rate
  }
  return Number.isFinite(sum) ? sum : null
}

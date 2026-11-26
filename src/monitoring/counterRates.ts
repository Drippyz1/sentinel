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
  return ((current - previous) * 1000) / elapsedMs
}

export class CounterRates {
  private previous = new Map<string, ByteCounters>()
  private sampledAt: number | undefined

  sample(counters: ByteCounters[], now: number): Map<string, ByteRates> {
    const elapsed = this.sampledAt === undefined ? 0 : now - this.sampledAt
    const rates = new Map(
      counters.map((counter) => {
        const previous = this.previous.get(counter.id)
        return [
          counter.id,
          {
            read: counterRate(previous?.read ?? null, counter.read, elapsed),
            write: counterRate(previous?.write ?? null, counter.write, elapsed)
          }
        ]
      })
    )
    this.previous = new Map(counters.map((counter) => [counter.id, counter]))
    this.sampledAt = now
    return rates
  }
}

export function sumCompleteRates(rates: (number | null)[]): number | null {
  if (!rates.length) return null
  let sum = 0
  for (const rate of rates) {
    if (rate === null) return null
    sum += rate
  }
  return sum
}

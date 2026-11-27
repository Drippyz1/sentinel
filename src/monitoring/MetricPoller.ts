import type {
  MetricCapability,
  MetricCollectionResult,
  MetricStatus
} from '../shared/contracts/metrics'

export interface MetricObservation<T> {
  status: MetricStatus
  capability: MetricCapability
  value: T | null
}

export type MetricCollectors<T> = { [K in keyof T]: () => Promise<MetricCollectionResult<T[K]>> }
export type CollectionIntervals<T> = { [K in keyof T]: number }

interface PollClock {
  now: () => number
  timestamp: () => number
  schedule: (run: () => void, delayMs: number) => () => void
}

interface PollerOptions {
  clock?: PollClock
  timeoutMs?: number
  onError?: (group: string, error: unknown) => void
}

interface Slot<T> {
  observation: MetricObservation<T>
  failures: number
  active?: Promise<void>
  cancelNext?: () => void
  cancelDeadline?: () => void
}

const systemClock: PollClock = {
  now: () => performance.now(),
  timestamp: Date.now,
  schedule(run, delayMs) {
    const timer = setTimeout(run, delayMs)
    return () => clearTimeout(timer)
  }
}

function pending<T>(): MetricObservation<T> {
  return {
    value: null,
    capability: 'unknown',
    status: { state: 'pending', reason: null, sampledAt: null, revision: 0 }
  }
}

export class MetricPoller<T> {
  private readonly groups: Array<keyof T>
  private readonly slots: { [K in keyof T]: Slot<T[K]> }
  private readonly clock: PollClock
  private readonly timeoutMs: number
  private intervals: CollectionIntervals<T>
  private generation = 0
  private revision = 0
  private running = false

  constructor(
    private readonly collectors: MetricCollectors<T>,
    intervals: CollectionIntervals<T>,
    private readonly options: PollerOptions = {}
  ) {
    this.groups = Object.keys(collectors) as Array<keyof T>
    this.slots = {} as { [K in keyof T]: Slot<T[K]> }
    for (const group of this.groups) this.slots[group] = { observation: pending(), failures: 0 }
    this.clock = options.clock ?? systemClock
    this.timeoutMs = options.timeoutMs ?? 15_000
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 2_147_483_647
    ) {
      throw new RangeError('Invalid collection timeout')
    }
    this.checkIntervals(intervals)
    this.intervals = { ...intervals }
  }

  get sequence(): number {
    return this.revision
  }

  get<K extends keyof T>(group: K): MetricObservation<T[K]> {
    return this.slots[group].observation
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.generation += 1
    for (const group of this.groups) this.schedule(group, 0)
  }

  setIntervals(intervals: CollectionIntervals<T>): void {
    this.checkIntervals(intervals)
    const previous = this.intervals
    this.intervals = { ...intervals }
    if (!this.running) return
    for (const group of this.groups) {
      if (previous[group] !== intervals[group]) this.schedule(group, intervals[group])
    }
  }

  invalidate(): void {
    if (!this.running) return
    this.generation += 1
    for (const group of this.groups) {
      const slot = this.slots[group]
      slot.observation = {
        value: null,
        capability: slot.observation.capability,
        status: {
          state: 'pending',
          reason: 'warming-up',
          sampledAt: null,
          revision: ++this.revision
        }
      }
      slot.failures = 0
      this.schedule(group, 0)
    }
  }

  async stop(): Promise<void> {
    this.running = false
    this.generation += 1
    for (const group of this.groups) {
      this.slots[group].cancelNext?.()
      this.slots[group].cancelDeadline?.()
    }
    await Promise.all(this.groups.map((group) => this.slots[group].active))
  }

  private checkIntervals(intervals: CollectionIntervals<T>): void {
    for (const group of this.groups) {
      if (
        !Number.isSafeInteger(intervals[group]) ||
        intervals[group] < 1 ||
        intervals[group] > 2_147_483_647
      ) {
        throw new RangeError(`Invalid collection interval for ${String(group)}`)
      }
    }
  }

  private schedule<K extends keyof T>(group: K, delayMs: number): void {
    const slot = this.slots[group]
    if (!this.running || slot.active) return
    slot.cancelNext?.()
    slot.cancelNext = this.clock.schedule(() => this.collect(group), delayMs)
  }

  private collect<K extends keyof T>(group: K): void {
    const slot = this.slots[group]
    slot.cancelNext = undefined
    const generation = this.generation
    const startedAt = this.clock.now()
    const isCurrent = () => this.running && generation === this.generation
    let timedOut = false

    // A timeout updates status but never starts another OS probe until this one settles.
    slot.cancelDeadline = this.clock.schedule(() => {
      timedOut = true
      if (isCurrent()) this.publish(group, 'error', 'timed-out', null)
    }, this.timeoutMs)

    slot.active = Promise.resolve()
      .then(this.collectors[group])
      .then((result) => {
        if (!isCurrent() || timedOut) return
        if (result.state === 'ok') {
          this.publish(group, 'ok', null, result.value)
        } else {
          this.publish(group, 'unavailable', result.reason, null)
        }
      })
      .catch((error) => {
        if (!isCurrent() || timedOut) return
        const firstError = slot.observation.status.state !== 'error'
        this.publish(group, 'error', 'collection-failed', null)
        if (firstError) this.options.onError?.(String(group), error)
      })
      .finally(() => {
        slot.cancelDeadline?.()
        slot.cancelDeadline = undefined
        slot.active = undefined
        if (!this.running) return
        const baseInterval = this.intervals[group]
        const interval = Math.max(baseInterval, Math.min(30_000, baseInterval * 2 ** slot.failures))
        const elapsed = Math.max(0, this.clock.now() - startedAt)
        this.schedule(group, isCurrent() ? interval - (elapsed % interval) : 0)
      })
  }

  private publish<K extends keyof T>(
    group: K,
    state: MetricStatus['state'],
    reason: MetricStatus['reason'],
    value: T[K] | null
  ): void {
    const slot = this.slots[group]
    slot.failures = state === 'error' ? Math.min(5, slot.failures + 1) : 0
    const capability =
      state === 'ok' || reason === 'warming-up'
        ? 'supported'
        : reason === 'not-supported' || reason === 'not-detected'
          ? reason
          : slot.observation.capability
    slot.observation = {
      value,
      capability,
      status: { state, reason, sampledAt: this.clock.timestamp(), revision: ++this.revision }
    }
  }
}

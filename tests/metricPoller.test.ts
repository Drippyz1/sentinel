import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { MetricPoller } from '../src/monitoring/MetricPoller'
import { cachedProbe, observed, unavailable } from '../src/monitoring/probe'
import type { MetricCollectionResult } from '../src/shared/contracts/metrics'

class FakeClock {
  private time = 0
  private readonly tasks = new Map<() => void, number>()

  now = () => this.time
  timestamp = () => 1_700_000_000_000 + this.time
  schedule = (run: () => void, delayMs: number) => {
    this.tasks.set(run, this.time + delayMs)
    return () => {
      this.tasks.delete(run)
    }
  }

  async advance(ms: number): Promise<void> {
    const target = this.time + ms
    for (;;) {
      const next = [...this.tasks].sort((a, b) => a[1] - b[1])[0]
      if (!next || next[1] > target) break
      const [run, time] = next
      this.tasks.delete(run)
      this.time = time
      run()
      await setImmediate()
    }
    this.time = target
  }
}

test('independent groups run at their configured cadence and reconfigure without a global restart', async () => {
  const clock = new FakeClock()
  const calls = { fast: 0, slow: 0 }
  const poller = new MetricPoller<{ fast: number; slow: number }>(
    { fast: async () => observed(++calls.fast), slow: async () => observed(++calls.slow) },
    { fast: 10, slow: 30 },
    { clock }
  )
  assert.equal(poller.get('fast').status.state, 'pending')
  poller.start()
  poller.start()
  await clock.advance(30)
  assert.deepEqual(calls, { fast: 4, slow: 2 })
  assert.equal(poller.get('slow').status.sampledAt, clock.timestamp())
  assert.equal(poller.sequence, 6)
  poller.setIntervals({ fast: 20, slow: 30 })
  await clock.advance(30)
  assert.deepEqual(calls, { fast: 5, slow: 3 })
  await poller.stop()
  await clock.advance(120)
  assert.deepEqual(calls, { fast: 5, slow: 3 })
})

test('a timed-out probe cannot overlap or publish late, and does not block another group', async () => {
  const clock = new FakeClock()
  let resolveSlow: (value: MetricCollectionResult<number>) => void = () => {}
  let runs = 0
  const poller = new MetricPoller<{ fast: number; slow: number }>(
    {
      fast: async () => observed(clock.now()),
      slow: () => {
        runs += 1
        return runs === 1
          ? new Promise((resolve) => {
              resolveSlow = resolve
            })
          : Promise.resolve(observed(12))
      }
    },
    { fast: 8, slow: 10 },
    { clock, timeoutMs: 25 }
  )
  poller.start()
  await clock.advance(52)
  assert.equal(runs, 1)
  assert.equal(poller.get('slow').status.reason, 'timed-out')
  assert.equal(poller.get('fast').value, 48)
  resolveSlow(observed(99))
  await setImmediate()
  assert.equal(poller.get('slow').value, null)
  await clock.advance(8)
  assert.equal(runs, 2)
  assert.equal(poller.get('slow').value, 12)
  await poller.stop()
})

test('a transient failure clears the reading without pretending the capability disappeared', async () => {
  const clock = new FakeClock()
  const poller = new MetricPoller<{ supported: number; missing: number }>(
    {
      supported: async () => {
        if (clock.now() !== 0) throw new Error('test failure')
        return observed(0)
      },
      missing: async () => unavailable('not-detected')
    },
    { supported: 20, missing: 20 },
    { clock }
  )
  poller.start()
  await clock.advance(0)
  assert.equal(poller.get('supported').value, 0)
  assert.equal(poller.get('missing').capability, 'not-detected')
  await clock.advance(20)
  assert.equal(poller.get('supported').status.state, 'error')
  assert.equal(poller.get('supported').capability, 'supported')
  assert.equal(poller.get('supported').value, null)
  await poller.stop()
})

test('stopping suppresses results from work that was already in flight', async () => {
  const clock = new FakeClock()
  let complete: (value: MetricCollectionResult<number>) => void = () => {}
  const poller = new MetricPoller<{ active: number }>(
    {
      active: () =>
        new Promise((resolve) => {
          complete = resolve
        })
    },
    { active: 10 },
    { clock }
  )
  poller.start()
  await clock.advance(0)
  const drained = poller.stop()
  complete(observed(1))
  await drained
  assert.equal(poller.sequence, 0)
  await clock.advance(100)
  assert.equal(poller.get('active').status.state, 'pending')
})

test('resume invalidation suppresses pre-resume completions without overlapping probes', async () => {
  const clock = new FakeClock()
  let finish: (value: MetricCollectionResult<number>) => void = () => {}
  let calls = 0
  const poller = new MetricPoller<{ active: number }>(
    {
      active: () => {
        calls++
        if (calls > 1) return Promise.resolve(observed(2))
        return new Promise((resolve) => {
          finish = resolve
        })
      }
    },
    { active: 10 },
    { clock }
  )
  poller.start()
  await clock.advance(0)
  poller.invalidate()
  assert.equal(poller.get('active').status.state, 'pending')
  assert.equal(calls, 1)
  finish(observed(1))
  await setImmediate()
  await clock.advance(0)
  assert.equal(calls, 2)
  assert.equal(poller.get('active').value, 2)
  await poller.stop()
})

test('collector failures back off and success restores the configured cadence', async () => {
  const clock = new FakeClock()
  const attempts: number[] = []
  const errors: unknown[] = []
  const poller = new MetricPoller<{ metric: number }>(
    {
      metric: async () => {
        attempts.push(clock.now())
        if (attempts.length < 3) throw new Error('temporarily unavailable')
        return observed(42)
      }
    },
    { metric: 10 },
    { clock, onError: (_group, error) => errors.push(error) }
  )
  poller.start()
  await clock.advance(59)
  assert.deepEqual(attempts, [0, 20])
  assert.equal(errors.length, 1)
  assert.equal(poller.get('metric').status.state, 'error')
  await clock.advance(11)
  assert.deepEqual(attempts, [0, 20, 60, 70])
  assert.equal(poller.get('metric').status.state, 'ok')
  assert.equal(poller.get('metric').value, 42)
  await poller.stop()
})

test('inventory probes coalesce requests, expire by policy, and retry after failure', async () => {
  let calls = 0
  let time = 0
  const probe = cachedProbe(
    async () => {
      if (++calls === 2) throw new Error('test failure')
      return calls
    },
    10,
    () => time
  )

  assert.deepEqual(await Promise.all([probe(), probe()]), [1, 1])
  time = 5
  assert.equal(await probe(), 1)
  time = 10
  await assert.rejects(probe(), /test failure/)
  assert.equal(await probe(), 3)
})

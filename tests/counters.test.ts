import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linuxStartTicks } from '../src/main/ipc/processBirth'
import {
  parseDarwinDiskCounters,
  parseLinuxDiskCounters
} from '../src/monitoring/collectors/diskCounters'
import { CounterRates, counterRate, sumCompleteRates } from '../src/monitoring/counterRates'

test('counter rates use the real interval and only return zero for observed idle', () => {
  assert.equal(counterRate(1000, 1500, 250), 2000)
  assert.equal(counterRate(1500, 1500, 2000), 0)
  assert.equal(counterRate(1500, 1000, 2000), null)
  assert.equal(counterRate(0, null, 2000), null)
  assert.equal(counterRate(0, 500, 0), null)
})

test('per-device rates survive reordering and warm up again after a reset or reconnection', () => {
  const sampler = new CounterRates()
  const diskA = { id: 'a', read: 100, write: 300 }
  const diskB = { id: 'b', read: 20, write: 70 }
  assert.deepEqual(sampler.sample([diskA, diskB], 1000).get('a'), { read: null, write: null })
  const second = sampler.sample(
    [
      { ...diskB, read: 15 },
      { ...diskA, read: 300 }
    ],
    1500
  )
  assert.deepEqual(second.get('a'), { read: 400, write: 0 })
  assert.deepEqual(second.get('b'), { read: null, write: 0 })
  assert.equal(
    sumCompleteRates([second.get('a')?.read ?? null, second.get('b')?.read ?? null]),
    null
  )
  sampler.sample([diskA], 2000)
  assert.deepEqual(sampler.sample([diskA, diskB], 3000).get('b'), { read: null, write: null })
  assert.equal(sumCompleteRates([0, 25, 5]), 30)
})

test('OS disk adapters select bytes, not the neighboring operation counters or partitions', () => {
  assert.deepEqual(
    parseDarwinDiskCounters(`
+-o Driver <class IOBlockStorageDriver, id 0xac, registered>
    "Statistics" = {"Operations (Read)"=7,"Bytes (Read)"=512,"Bytes (Write)"=0}
+-o Other <class IOBlockStorageDriver, id 0xbc, registered>
    "Statistics" = {"Operations (Read)"=30}
  `),
    [{ id: '0xac', read: 512, write: 0 }]
  )
  assert.deepEqual(
    parseLinuxDiskCounters(
      `
  259 0 nvme0n1 4 2 8 1 12 3 5 2 0 0 0
  259 1 nvme0n1p1 4 2 8 1 12 3 5 2 0 0 0
    7 0 loop0 4 2 8 1 12 3 5 2 0 0 0
  `,
      new Map([['nvme0n1', 'backing-disk']])
    ),
    [{ id: '259:0:backing-disk', read: 4096, write: 2560 }]
  )
})

test('Linux process birth reads field 22 even when the name contains spaces and parentheses', () => {
  const fixture = (start: string) =>
    `42 (reader ) worker) S ${Array(18).fill('0').join(' ')} ${start} 0`
  assert.equal(linuxStartTicks(fixture('12345678900')), '12345678900')
  assert.equal(linuxStartTicks(fixture('12345678901')), '12345678901')
  assert.equal(linuxStartTicks(fixture('invalid')), null)
  assert.equal(linuxStartTicks('42 (truncated) S'), null)
})

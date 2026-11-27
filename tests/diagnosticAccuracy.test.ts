import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CounterRates, counterRate } from '../src/monitoring/counterRates'
import { splitEndpoint } from '../src/main/collectors/networkConnections'
import {
  pageProcesses,
  isProcessPageRequest,
  PROCESS_PAGE_SIZE
} from '../src/shared/utils/processPage'
import type { ProcessInfo, ProcessPageRequest } from '../src/shared/contracts'

test('sleep, wall-clock jumps, loss and resume rebaseline rate observations', () => {
  const rates = new CounterRates()
  const counters = (read: number) => [{ id: 'link', read, write: 0 }]
  assert.equal(rates.sample(counters(10), 100, 100).get('link')?.read, null)
  assert.equal(rates.sample(counters(10), 2100, 2100).get('link')?.read, 0)
  assert.equal(rates.sample(counters(30), 4100, 100_000).get('link')?.read, null)
  assert.equal(rates.sample(counters(50), 6100, 102_000).get('link')?.read, 10)
  assert.equal(rates.sample(counters(60), 66_100, 162_000).get('link')?.read, null)
  rates.clear()
  assert.equal(rates.sample(counters(80), 68_100, 164_000).get('link')?.read, null)
  assert.equal(counterRate(0, Number.MAX_VALUE, 0.01), null)
})

test('connection endpoints preserve unbracketed IPv6 and decode ports without DNS', () => {
  assert.deepEqual(splitEndpoint('2001:db8::443'), { address: '2001:db8::443', port: null })
  assert.deepEqual(splitEndpoint('[fe80::1%en0]:443'), { address: 'fe80::1%en0', port: '443' })
  assert.deepEqual(splitEndpoint('192.0.2.1:50100'), { address: '192.0.2.1', port: '50100' })
  assert.deepEqual(splitEndpoint('*:*'), { address: '*', port: '*' })
})

test('process inventory sorts nulls last, breaks ties deterministically and searches beyond the live slice', () => {
  const rows: ProcessInfo[] = Array.from({ length: 230 }, (_, n) => ({
    pid: n + 1,
    name: n === 200 ? 'Target Adapter' : 'Worker',
    started: 'sample',
    cpuPercent: n < 2 ? null : 104,
    memoryBytes: 1024,
    memoryPercent: 2,
    status: 'running'
  }))
  const request: ProcessPageRequest = {
    page: 0,
    query: '',
    sort: 'cpuPercent',
    direction: 'desc',
    filter: 'all'
  }
  const metadata = { reported: 240, collectedAt: 100_000, truncated: false }
  assert.ok(isProcessPageRequest(request))
  for (const invalid of [
    { ...request, page: -1 },
    { ...request, page: 1000 },
    { ...request, query: 'a'.repeat(129) },
    { ...request, column: 'secret' }
  ]) {
    assert.equal(isProcessPageRequest(invalid), false)
  }
  const first = pageProcesses(rows, request, metadata)
  assert.equal(first.rows.length, PROCESS_PAGE_SIZE)
  assert.equal(first.rows[0].pid, 3)
  const matched = pageProcesses(rows, { ...request, query: 'adapter', page: 4 }, metadata)
  assert.equal(matched.rows[0].pid, 201)
  assert.deepEqual(
    [matched.page, matched.matching, matched.captured, matched.reported],
    [0, 1, 230, 240]
  )
})

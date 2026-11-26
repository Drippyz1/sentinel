import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeCollectionOverrides,
  resolveCollectionIntervals
} from '../src/shared/utils/collectionPolicy'
import { normalizeDiskMetrics, selectPrimaryDrive } from '../src/shared/utils/disk'
import { isTrustedDocument } from '../src/shared/utils/rendererTrust'
import { matchesProcessIdentity } from '../src/monitoring/collectors/processes'

test('legacy global polling settings fall back to independent defaults and invalid overrides are ignored', () => {
  assert.deepEqual(normalizeCollectionOverrides(undefined), {})
  const overrides = normalizeCollectionOverrides({
    cpu: 5000,
    gpu: 0,
    diskCapacity: 30000,
    extra: 1000
  })
  assert.deepEqual(overrides, { cpu: 5000, diskCapacity: 30000 })
  const intervals = resolveCollectionIntervals(2000, overrides)
  assert.equal(intervals.cpu, 5000)
  assert.equal(intervals.memory, 2000)
  assert.equal(intervals.gpu, 15000)
  assert.equal(intervals.diskCapacity, 30000)
})

test('primary drive selection preserves APFS, alternate Windows system drives, and Linux root', () => {
  const apfs = selectPrimaryDrive([
    { mount: '/Volumes/USB', totalBytes: 3000 },
    {
      mount: '/',
      type: 'apfs',
      isPrimary: true,
      totalBytes: 2000,
      freeBytes: 50,
      availableBytes: 170,
      purgeableBytes: 120,
      availableIncludesPurgeable: true
    }
  ])
  assert.equal(apfs?.availableBytes, 170)
  assert.equal(apfs?.freeBytes, 50)
  assert.equal(apfs?.purgeableBytes, 120)
  assert.equal(
    selectPrimaryDrive([{ mount: 'C:\\' }, { mount: 'D:\\', isPrimary: true }])?.mount,
    'D:\\'
  )
  assert.equal(selectPrimaryDrive([{ mount: '/home' }, { mount: '/' }])?.mount, '/')
  assert.equal(normalizeDiskMetrics(undefined).io.readBytesPerSec, null)
  assert.equal(
    normalizeDiskMetrics({ drives: [], io: { readBytesPerSec: 0, writeBytesPerSec: NaN } }).io
      .readBytesPerSec,
    0
  )
})

test('trusted URL checks allow hash routing but require the exact document and origin', () => {
  const file = 'file:///C:/Sentinel/out/renderer/index.html'
  assert.equal(isTrustedDocument(`${file}#/settings`, file), true)
  assert.equal(isTrustedDocument(`${file}?other=true`, file), false)
  assert.equal(isTrustedDocument('file:///C:/Other/index.html', file), false)
  const dev = 'http://localhost:5173/'
  assert.equal(isTrustedDocument(`${dev}#tray`, dev), true)
  assert.equal(isTrustedDocument(`${dev}other.html`, dev), false)
  assert.equal(isTrustedDocument('http://localhost:5174/', dev), false)
})

test('process identity requires a nonempty start token and exact observed identity', () => {
  const seen = { pid: 42, name: 'example', started: '2026-01-01 10:00:00' }
  assert.equal(matchesProcessIdentity(seen, { ...seen }), true)
  assert.equal(matchesProcessIdentity(seen, { ...seen, started: '2026-01-01 10:02:00' }), false)
  assert.equal(matchesProcessIdentity(seen, { ...seen, name: 'different' }), false)
  assert.equal(matchesProcessIdentity({ ...seen, started: '' }, { ...seen, started: '' }), false)
  assert.equal(matchesProcessIdentity(seen, null), false)
})

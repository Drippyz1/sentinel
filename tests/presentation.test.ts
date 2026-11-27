import assert from 'node:assert/strict'
import { test } from 'node:test'
import { METRIC_GROUPS, type MetricsSnapshot } from '../src/shared/contracts/metrics'
import { historyValues } from '../src/main/storage/snapshotRow'
import { projectHistoryChart, selectChartSamples } from '../src/shared/utils/chartSamples'
import { HISTORY_BUCKET_MS as minute, type SnapshotRow } from '../src/shared/contracts/history'
import { formatHistoryCsv } from '../src/shared/utils/historyCsv'
import { metricsView, projectLiveMetrics } from '../src/shared/utils/liveMetrics'

test('chart projection bounds points without losing the endpoints, spikes, or missing spans', () => {
  const fixture = Array.from({ length: 1000 }, (_, timestamp) => ({
    timestamp,
    value: timestamp === 41 ? null : timestamp === 91 ? 99 : timestamp === 92 ? -99 : 0
  }))
  const projected = selectChartSamples(fixture, 10)
  assert.ok(projected.length <= 32)
  assert.equal(projected[0], fixture[0])
  assert.equal(projected.at(-1), fixture.at(-1))
  assert.ok(
    projected.includes(fixture[41]) &&
      projected.includes(fixture[91]) &&
      projected.includes(fixture[92])
  )
  assert.deepEqual(
    projected,
    [...projected].sort((a, b) => a.timestamp - b.timestamp)
  )
  assert.equal(fixture.length, 1000)
})

test('history inserts view-only sentinels for absent minutes and metric-specific nulls, not zeros', () => {
  const data = [
    { timestamp: 0, value: null },
    { timestamp: minute, value: 0 },
    { timestamp: 61 * minute, value: 100 },
    { timestamp: 62 * minute, value: null },
    { timestamp: 63 * minute, value: 0 },
    { timestamp: 64 * minute, value: null }
  ]
  assert.deepEqual(
    projectHistoryChart(data).map(({ timestamp, value }) => [timestamp / minute, value]),
    [
      [0, null],
      [1, 0],
      [2, null],
      [61, 100],
      [62, null],
      [63, 0],
      [64, null]
    ]
  )
  assert.equal(data.length, 6)
  assert.deepEqual(projectHistoryChart([]), [])
  assert.deepEqual(projectHistoryChart([{ timestamp: 0, value: null }]), [])
})

test('long sparse history preserves extrema and never connects retained points across missing buckets', () => {
  const data = Array.from({ length: 1440 }, (_, n) => ({
    timestamp: n * 3 * minute,
    value: n === 50 ? 900 : n === 400 ? -111 : 0
  }))
  const projected = projectHistoryChart(data)
  assert.ok(projected.length <= 485)
  assert.equal(projected[0], data[0])
  assert.equal(projected.at(-1), data.at(-1))
  assert.ok(projected.includes(data[50]))
  assert.ok(projected.includes(data[400]))
  assert.ok(
    projected.every(
      (point, i) => i === 0 || point.value === null || projected[i - 1].value === null
    )
  )
})

test('chart gap markers do not produce CSV rows or change disk unit columns', () => {
  const first: SnapshotRow = {
    timestamp: minute,
    cpu_usage: 0,
    memory_usage: null,
    memory_used: null,
    disk_usage: null,
    disk_available: null,
    disk_free: null,
    disk_purgeable: null,
    disk_read: null,
    disk_write: null,
    disk_read_legacy_ops: 2,
    disk_write_legacy_ops: 3,
    net_down: null,
    net_up: null,
    gpu_usage: null,
    battery: null,
    cpu_temperature: null,
    gpu_temperature: null
  }
  const second = {
    ...first,
    timestamp: 61 * minute,
    cpu_usage: 42,
    disk_write: 1024,
    disk_read_legacy_ops: null,
    disk_write_legacy_ops: null
  }
  const rows = [first, second]
  const points = projectHistoryChart(
    rows.map((row) => ({ timestamp: row.timestamp, value: row.cpu_usage }))
  )
  assert.deepEqual(
    points.map(({ value }) => value),
    [0, null, 42]
  )
  const [header, before, after] = formatHistoryCsv(rows).split('\r\n')
  assert.equal(formatHistoryCsv(rows).split('\r\n').length, 3)
  assert.equal(before.split(',').slice(-2).join(','), '2,3')
  assert.equal(after.split(',')[header.split(',').indexOf('disk_write')], '1024')
  assert.ok(header.endsWith('disk_read_legacy_ops_per_sec,disk_write_legacy_ops_per_sec'))
})

test('frame projections preserve sample times and only deliver process data to the Processes view', () => {
  const snapshot: MetricsSnapshot = {
    sequence: 10,
    timestamp: 5000,
    statuses: Object.fromEntries(
      METRIC_GROUPS.map((key) => [
        key,
        {
          state: 'ok',
          reason: null,
          sampledAt: 3000,
          revision: 5
        }
      ])
    ) as MetricsSnapshot['statuses'],
    capabilities: {
      platform: 'fixture',
      architecture: 'fixture',
      metrics: Object.fromEntries(
        METRIC_GROUPS.map((key) => [key, 'supported'])
      ) as MetricsSnapshot['capabilities']['metrics']
    },
    updatedGroups: ['cpu'],
    disk: { drives: [], io: { readBytesPerSec: null, writeBytesPerSec: null } },
    cpu: null,
    cpuTemperature: 54,
    memory: null,
    network: null,
    gpu: null,
    battery: null,
    processes: {
      total: 1,
      list: [
        {
          pid: 10,
          name: 'fixture',
          started: '',
          cpuPercent: 0,
          memoryPercent: 0,
          memoryBytes: 0,
          status: 'idle'
        }
      ]
    },
    anomalyReport: { anomalies: [], hasAnomalies: false, samplesCount: 1, isWarmedUp: false }
  }

  assert.equal(metricsView('#/processes/?filter=all', 'main'), 'processes')
  assert.equal(metricsView('#/processes', 'tray'), 'tray')
  assert.equal(metricsView('#/history', 'main'), 'status')
  for (const view of ['dashboard', 'system', 'status', 'tray', 'mini'] as const) {
    const frame = projectLiveMetrics(snapshot, view)
    assert.equal(frame.processes, undefined)
    assert.equal(frame.statuses.diskCapacity.sampledAt, 3000)
  }
  assert.equal(projectLiveMetrics(snapshot, 'processes').processes, snapshot.processes)
  assert.deepEqual(projectLiveMetrics(snapshot, 'dashboard').topProcesses, [
    { pid: 10, name: 'fixture', cpuPercent: 0, memoryBytes: 0 }
  ])
  for (const view of ['processes', 'system', 'status', 'tray', 'mini'] as const)
    assert.equal(projectLiveMetrics(snapshot, view).topProcesses, undefined)
  assert.equal(projectLiveMetrics(snapshot, 'dashboard').cpuTemperature, 54)
  assert.equal(projectLiveMetrics(snapshot, 'system').cpuTemperature, 54)
  assert.equal(projectLiveMetrics(snapshot, 'processes').cpuTemperature, undefined)
})

test('history records only fresh observations and CPU temperature recovers independently', () => {
  const snapshot = {
    statuses: { cpu: { state: 'error' }, cpuTemperature: { state: 'ok' } },
    updatedGroups: ['cpu', 'cpuTemperature'],
    cpu: null,
    cpuTemperature: 61
  } as unknown as MetricsSnapshot
  assert.equal(historyValues(snapshot).cpu_temperature, 61)
  assert.equal(historyValues(snapshot).cpu_usage, null)

  snapshot.updatedGroups = ['cpu']
  snapshot.statuses.cpu.state = 'ok'
  snapshot.cpu = {
    manufacturer: 'fixture',
    brand: 'fixture',
    speedGHz: 2,
    cores: 1,
    usagePercent: 0,
    perCoreUsage: [0],
    temperature: 61
  }
  assert.equal(historyValues(snapshot).cpu_temperature, null)
  assert.equal(historyValues(snapshot).cpu_usage, 0)

  snapshot.updatedGroups = ['cpuTemperature']
  for (const state of ['error', 'unavailable'] as const) {
    snapshot.statuses.cpuTemperature.state = state
    assert.equal(historyValues(snapshot).cpu_temperature, null)
    assert.equal(historyValues(snapshot).cpu_usage, null)
  }
  snapshot.statuses.cpuTemperature.state = 'ok'
  snapshot.cpuTemperature = 64
  assert.equal(historyValues(snapshot).cpu_temperature, 64)
})

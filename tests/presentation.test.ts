import assert from 'node:assert/strict'
import { test } from 'node:test'
import { METRIC_GROUPS, type MetricsSnapshot } from '../src/shared/contracts/metrics'
import { historyValues } from '../src/main/storage/snapshotRow'
import { selectChartSamples } from '../src/shared/utils/chartSamples'
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

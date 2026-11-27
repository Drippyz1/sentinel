import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkForAnomalies } from '../src/main/analysis/anomalyDetector'
import { MonitoringAlertService } from '../src/main/services/MonitoringAlertService'
import { historyRows } from '../src/main/storage/snapshotRow'
import {
  METRIC_GROUPS,
  type MetricsSnapshot,
  type MonitoringAlerts,
  type NewAlertHistoryEntry
} from '../src/shared/contracts'

const initial = 1_700_000_000_000
const rule = { enabled: false, thresholdPercent: 90 }
const settings: MonitoringAlerts = {
  cpu: { enabled: true, thresholdPercent: 90 },
  memory: rule,
  disk: rule,
  battery: rule,
  cooldownMinutes: 5
}

function frame(offset: number, cpu: number | null, fresh = true): MetricsSnapshot {
  const timestamp = initial + offset
  return {
    timestamp,
    sequence: offset,
    statuses: Object.fromEntries(
      METRIC_GROUPS.map((group) => [
        group,
        {
          state: cpu === null ? 'error' : 'ok',
          reason: null,
          sampledAt: timestamp,
          revision: offset
        }
      ])
    ) as MetricsSnapshot['statuses'],
    capabilities: {
      platform: 'test',
      architecture: 'test',
      metrics: Object.fromEntries(
        METRIC_GROUPS.map((group) => [group, 'supported'])
      ) as MetricsSnapshot['capabilities']['metrics']
    },
    updatedGroups: fresh ? ['cpu'] : [],
    cpu:
      cpu === null
        ? null
        : {
            manufacturer: 'test',
            brand: 'test',
            speedGHz: 0,
            cores: 1,
            usagePercent: cpu,
            perCoreUsage: [cpu],
            temperature: null
          },
    cpuTemperature: null,
    memory: null,
    disk: { drives: [], io: { readBytesPerSec: null, writeBytesPerSec: null } },
    network: null,
    gpu: null,
    battery: null,
    processes: null,
    anomalyReport: { anomalies: [], hasAnomalies: false, isWarmedUp: false, samplesCount: 0 }
  }
}

test('only fresh readings advance alerts, and an unavailable sample resets a sustained threshold', () => {
  const alerts: NewAlertHistoryEntry[] = []
  const service = new MonitoringAlertService({ onTriggered: (entries) => alerts.push(...entries) })
  service.processSnapshot(frame(0, 95), settings)
  service.processSnapshot(frame(12_000, 95, false), settings)
  assert.deepEqual(alerts, [])
  service.processSnapshot(frame(13_000, null), settings)
  service.processSnapshot(frame(15_000, 95), settings)
  service.processSnapshot(frame(24_000, 93), settings)
  assert.deepEqual(alerts, [])
  service.processSnapshot(frame(25_000, 91), settings)
  assert.deepEqual(
    alerts.map(({ type, metricValue }) => [type, metricValue]),
    [['cpu', 91]]
  )
})

test('anomaly warm-up counts real idle readings but not unavailable samples', () => {
  const empty = {
    cpu: null,
    memory: null,
    diskRead: null,
    diskWrite: null,
    netDown: null,
    netUp: null,
    gpu: null
  }
  const start = checkForAnomalies(empty).samplesCount
  assert.equal(checkForAnomalies(empty).samplesCount, start)
  assert.equal(checkForAnomalies({ ...empty, cpu: 0 }).samplesCount, start + 1)
})

test('continuous threshold episodes do not notify again after cooldown until a measured recovery', () => {
  const entries: NewAlertHistoryEntry[] = []
  const service = new MonitoringAlertService({ onTriggered: (alerts) => entries.push(...alerts) })
  for (let t = 0; t <= 320_000; t += 10_000) service.processSnapshot(frame(t, 96), settings)
  assert.equal(entries.length, 1)
  service.processSnapshot(frame(325_000, 102), settings)
  service.processSnapshot(frame(330_000, 40), settings)
  service.processSnapshot(frame(340_000, 94), settings)
  service.processSnapshot(frame(350_000, 94), settings)
  assert.equal(entries.length, 2)
})

test('observations across a minute boundary are written to their original buckets', () => {
  const snapshot = frame(40_040, 0)
  snapshot.updatedGroups.push('cpuTemperature')
  snapshot.cpuTemperature = 58
  snapshot.statuses.cpu.sampledAt = initial + 39_950
  snapshot.statuses.cpuTemperature.sampledAt = initial + 40_010
  const rows = historyRows(snapshot)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].cpu_usage, 0)
  assert.equal(rows[0].cpu_temperature, null)
  assert.equal(rows[1].cpu_temperature, 58)
  snapshot.statuses.cpuTemperature.sampledAt = snapshot.timestamp + 1
  assert.equal(historyRows(snapshot).length, 1)
})

test('low battery on AC and failed readings cannot alert', () => {
  const entries: NewAlertHistoryEntry[] = []
  const service = new MonitoringAlertService({ onTriggered: (alerts) => entries.push(...alerts) })
  const thresholds = { ...settings, battery: { enabled: true, thresholdPercent: 20 } }
  for (const offset of [0, 10_000, 20_000]) {
    const snapshot = frame(offset, 95)
    snapshot.updatedGroups = ['battery', 'cpu']
    snapshot.statuses.cpu.state = 'error'
    snapshot.battery = {
      hasBattery: true,
      chargePercent: 5,
      isCharging: false,
      isPluggedIn: true,
      timeRemainingMins: null,
      voltage: null,
      capacityWh: null,
      designCapacityWh: null,
      healthPercent: null,
      cycleCount: null,
      manufacturer: null,
      model: null
    }
    service.processSnapshot(snapshot, thresholds)
  }
  assert.equal(entries.length, 0)
})

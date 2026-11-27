import type {
  MetricGroup,
  MetricsSnapshot,
  MonitoringAlerts,
  MonitoringAlertRule,
  MonitoringAlertSeverity,
  NewAlertHistoryEntry
} from '../../shared/contracts'
import { boundedPercent } from '../../shared/utils/visualization'

const SUSTAINED_THRESHOLD_MS = 10_000
const MAX_SAMPLE_GAP_MS = 45_000

type AlertKey = 'cpu' | 'memory' | 'disk' | 'battery'

interface AlertState {
  exceededSince: number | null
  lastObservedAt: number | null
  thresholdPercent: number | null
  subject?: string
  notified?: boolean
}

interface AlertReading {
  key: AlertKey
  group: MetricGroup
  label: string
  value: number | null
  rule: MonitoringAlertRule
  isExceeded: boolean
  message: string
  subject?: string
}

interface MonitoringAlertServiceOptions {
  onTriggered?: (alerts: NewAlertHistoryEntry[]) => void
}

export class MonitoringAlertService {
  private readonly states: Record<AlertKey, AlertState> = {
    cpu: { exceededSince: null, lastObservedAt: null, thresholdPercent: null },
    memory: { exceededSince: null, lastObservedAt: null, thresholdPercent: null },
    disk: { exceededSince: null, lastObservedAt: null, thresholdPercent: null },
    battery: { exceededSince: null, lastObservedAt: null, thresholdPercent: null }
  }

  private lastNotificationAt = 0

  constructor(private readonly options: MonitoringAlertServiceOptions = {}) {}

  processSnapshot(snapshot: MetricsSnapshot, settings: MonitoringAlerts): void {
    const now = snapshot.timestamp
    const readings = this.getReadings(snapshot, settings)
    const sustainedAlerts: AlertReading[] = []

    for (const reading of readings) {
      if (!snapshot.updatedGroups.includes(reading.group)) continue
      const state = this.states[reading.key]
      const status = snapshot.statuses[reading.group]
      const observedAt = status.sampledAt
      const changed =
        state.thresholdPercent !== reading.rule.thresholdPercent ||
        (reading.subject !== undefined && state.subject !== reading.subject)
      if (changed || !reading.rule.enabled) {
        state.notified = false
        state.exceededSince = null
        state.lastObservedAt = null
        state.thresholdPercent = reading.rule.thresholdPercent
        if (reading.subject !== undefined) state.subject = reading.subject
      }
      if (!reading.rule.enabled) continue
      if (
        status.state !== 'ok' ||
        observedAt === null ||
        !Number.isFinite(observedAt) ||
        Math.abs(now - observedAt) > MAX_SAMPLE_GAP_MS ||
        reading.value === null
      ) {
        state.exceededSince = null
        state.lastObservedAt = null
        continue
      }
      if (!reading.isExceeded) {
        state.exceededSince = null
        state.lastObservedAt = null
        state.notified = false
        continue
      }

      const sampleGapTooLong =
        state.lastObservedAt !== null &&
        (observedAt < state.lastObservedAt || observedAt - state.lastObservedAt > MAX_SAMPLE_GAP_MS)
      if (state.exceededSince === null || sampleGapTooLong) {
        state.exceededSince = observedAt
      }
      state.lastObservedAt = observedAt
      state.thresholdPercent = reading.rule.thresholdPercent

      if (!state.notified && observedAt - state.exceededSince >= SUSTAINED_THRESHOLD_MS) {
        sustainedAlerts.push(reading)
      }
    }

    const cooldownMs = settings.cooldownMinutes * 60_000
    if (now < this.lastNotificationAt) this.lastNotificationAt = 0
    if (sustainedAlerts.length === 0 || now - this.lastNotificationAt < cooldownMs) return
    this.lastNotificationAt = now
    for (const reading of sustainedAlerts) this.states[reading.key].notified = true

    try {
      this.options.onTriggered?.(
        sustainedAlerts.flatMap((alert) =>
          alert.value === null
            ? []
            : [
                {
                  timestamp: now,
                  type: alert.key,
                  severity: this.getSeverity(alert),
                  title: `${alert.label} Alert`,
                  message: alert.message,
                  metricValue: alert.value,
                  threshold: alert.rule.thresholdPercent
                }
              ]
        )
      )
    } catch (error) {
      console.error('Failed to record monitoring alert history:', error)
    }
  }

  private getSeverity(alert: AlertReading): MonitoringAlertSeverity {
    if (alert.value === null) return 'warning'
    if (alert.key === 'battery') {
      return alert.value <= Math.min(10, alert.rule.thresholdPercent) ? 'critical' : 'warning'
    }
    return alert.value >= Math.min(100, alert.rule.thresholdPercent + 10) ? 'critical' : 'warning'
  }

  private getReadings(snapshot: MetricsSnapshot, settings: MonitoringAlerts): AlertReading[] {
    const disk = snapshot.disk.drives.reduce<(typeof snapshot.disk.drives)[number] | undefined>(
      (highest, drive) =>
        boundedPercent(drive.usagePercent) !== null &&
        (!highest || drive.usagePercent > highest.usagePercent)
          ? drive
          : highest,
      undefined
    )
    const diskUsage = disk?.usagePercent ?? null
    const batteryCharge = snapshot.battery?.hasBattery
      ? boundedPercent(snapshot.battery.chargePercent)
      : null
    const cpuUsage = boundedPercent(snapshot.cpu?.usagePercent)
    const memoryUsage = boundedPercent(snapshot.memory?.usagePercent)

    return [
      {
        key: 'cpu',
        group: 'cpu',
        label: 'CPU Usage',
        value: cpuUsage,
        rule: settings.cpu,
        isExceeded: cpuUsage !== null && cpuUsage >= settings.cpu.thresholdPercent,
        message: `CPU usage is ${Math.round(cpuUsage ?? 0)}% (threshold ${settings.cpu.thresholdPercent}%).`
      },
      {
        key: 'memory',
        group: 'memory',
        label: 'Active Memory',
        value: memoryUsage,
        rule: settings.memory,
        isExceeded: memoryUsage !== null && memoryUsage >= settings.memory.thresholdPercent,
        message: `Active memory is ${Math.round(memoryUsage ?? 0)}% (threshold ${settings.memory.thresholdPercent}%). This is not an OS memory pressure reading.`
      },
      {
        key: 'disk',
        group: 'diskCapacity',
        subject: disk ? JSON.stringify([disk.name, disk.mount]) : undefined,
        label: 'Disk Usage',
        value: diskUsage,
        rule: settings.disk,
        isExceeded: diskUsage !== null && diskUsage >= settings.disk.thresholdPercent,
        message: `Disk usage is ${Math.round(diskUsage ?? 0)}% (threshold ${settings.disk.thresholdPercent}%).`
      },
      {
        key: 'battery',
        group: 'battery',
        label: 'Low Battery',
        value: batteryCharge,
        rule: settings.battery,
        isExceeded:
          batteryCharge !== null &&
          !snapshot.battery?.isPluggedIn &&
          !snapshot.battery?.isCharging &&
          batteryCharge <= settings.battery.thresholdPercent,
        message: `Battery charge is ${Math.round(batteryCharge ?? 0)}% (threshold ${settings.battery.thresholdPercent}%).`
      }
    ]
  }
}

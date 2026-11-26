import type {
  MetricGroup,
  MetricsSnapshot,
  MonitoringAlerts,
  MonitoringAlertRule,
  MonitoringAlertSeverity,
  NewAlertHistoryEntry
} from '../../shared/contracts'

const SUSTAINED_THRESHOLD_MS = 10_000
const MAX_SAMPLE_GAP_MS = 45_000

type AlertKey = 'cpu' | 'memory' | 'disk' | 'battery'

interface AlertState {
  exceededSince: number | null
  lastObservedAt: number | null
  thresholdPercent: number | null
}

interface AlertReading {
  key: AlertKey
  group: MetricGroup
  label: string
  value: number | null
  rule: MonitoringAlertRule
  isExceeded: boolean
  message: string
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
      const observedAt = snapshot.statuses[reading.group].sampledAt ?? now

      if (!reading.rule.enabled || reading.value === null || !reading.isExceeded) {
        state.exceededSince = null
        state.lastObservedAt = null
        state.thresholdPercent = reading.rule.thresholdPercent
        continue
      }

      const thresholdChanged = state.thresholdPercent !== reading.rule.thresholdPercent
      const sampleGapTooLong =
        state.lastObservedAt !== null &&
        (observedAt < state.lastObservedAt || observedAt - state.lastObservedAt > MAX_SAMPLE_GAP_MS)
      if (state.exceededSince === null || thresholdChanged || sampleGapTooLong) {
        state.exceededSince = observedAt
      }
      state.lastObservedAt = observedAt
      state.thresholdPercent = reading.rule.thresholdPercent

      if (observedAt - state.exceededSince >= SUSTAINED_THRESHOLD_MS) {
        sustainedAlerts.push(reading)
      }
    }

    const cooldownMs = settings.cooldownMinutes * 60_000
    if (sustainedAlerts.length === 0 || now - this.lastNotificationAt < cooldownMs) return
    this.lastNotificationAt = now

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
    const diskUsage =
      snapshot.disk.drives.length > 0
        ? Math.max(...snapshot.disk.drives.map((drive) => drive.usagePercent))
        : null
    const batteryCharge = snapshot.battery?.hasBattery ? snapshot.battery.chargePercent : null
    const cpuUsage = snapshot.cpu?.usagePercent ?? null
    const memoryUsage = snapshot.memory?.usagePercent ?? null

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
        label: 'Memory Usage',
        value: memoryUsage,
        rule: settings.memory,
        isExceeded: memoryUsage !== null && memoryUsage >= settings.memory.thresholdPercent,
        message: `Memory usage is ${Math.round(memoryUsage ?? 0)}% (threshold ${settings.memory.thresholdPercent}%).`
      },
      {
        key: 'disk',
        group: 'diskCapacity',
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
          !snapshot.battery?.isCharging &&
          batteryCharge <= settings.battery.thresholdPercent,
        message: `Battery charge is ${Math.round(batteryCharge ?? 0)}% (threshold ${settings.battery.thresholdPercent}%).`
      }
    ]
  }
}

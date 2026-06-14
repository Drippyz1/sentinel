import { Notification } from 'electron'
import type { MetricsSnapshot, MonitoringAlerts, MonitoringAlertRule } from '../../shared/contracts'

const SUSTAINED_THRESHOLD_MS = 10_000
const MAX_SAMPLE_GAP_MS = 30_000

type AlertKey = 'cpu' | 'memory' | 'disk' | 'battery'

interface AlertState {
  exceededSince: number | null
  lastObservedAt: number | null
  thresholdPercent: number | null
}

interface AlertReading {
  key: AlertKey
  label: string
  value: number | null
  rule: MonitoringAlertRule
  isExceeded: boolean
  message: string
}

export class MonitoringAlertService {
  private readonly states: Record<AlertKey, AlertState> = {
    cpu: { exceededSince: null, lastObservedAt: null, thresholdPercent: null },
    memory: { exceededSince: null, lastObservedAt: null, thresholdPercent: null },
    disk: { exceededSince: null, lastObservedAt: null, thresholdPercent: null },
    battery: { exceededSince: null, lastObservedAt: null, thresholdPercent: null }
  }

  private lastNotificationAt = 0

  processSnapshot(snapshot: MetricsSnapshot, settings: MonitoringAlerts): void {
    const now = snapshot.timestamp
    const readings = this.getReadings(snapshot, settings)
    const sustainedAlerts: AlertReading[] = []

    for (const reading of readings) {
      const state = this.states[reading.key]

      if (!reading.rule.enabled || reading.value === null || !reading.isExceeded) {
        state.exceededSince = null
        state.lastObservedAt = null
        state.thresholdPercent = reading.rule.thresholdPercent
        continue
      }

      const thresholdChanged = state.thresholdPercent !== reading.rule.thresholdPercent
      const sampleGapTooLong =
        state.lastObservedAt !== null && now - state.lastObservedAt > MAX_SAMPLE_GAP_MS
      if (state.exceededSince === null || thresholdChanged || sampleGapTooLong) {
        state.exceededSince = now
      }
      state.lastObservedAt = now
      state.thresholdPercent = reading.rule.thresholdPercent

      if (now - state.exceededSince >= SUSTAINED_THRESHOLD_MS) {
        sustainedAlerts.push(reading)
      }
    }

    const cooldownMs = settings.cooldownMinutes * 60_000
    if (
      sustainedAlerts.length === 0 ||
      now - this.lastNotificationAt < cooldownMs ||
      !Notification.isSupported()
    ) {
      return
    }

    try {
      new Notification({
        title:
          sustainedAlerts.length === 1
            ? `Sentinel — ${sustainedAlerts[0].label} Alert`
            : 'Sentinel — Monitoring Alerts',
        body: sustainedAlerts.map((alert) => alert.message).join('\n'),
        silent: false
      }).show()
      this.lastNotificationAt = now
    } catch (error) {
      console.error('Failed to show monitoring alert notification:', error)
    }
  }

  private getReadings(snapshot: MetricsSnapshot, settings: MonitoringAlerts): AlertReading[] {
    const diskUsage =
      snapshot.disk.drives.length > 0
        ? Math.max(...snapshot.disk.drives.map((drive) => drive.usagePercent))
        : null
    const batteryCharge = snapshot.battery.hasBattery ? snapshot.battery.chargePercent : null

    return [
      {
        key: 'cpu',
        label: 'CPU Usage',
        value: snapshot.cpu.usagePercent,
        rule: settings.cpu,
        isExceeded: snapshot.cpu.usagePercent >= settings.cpu.thresholdPercent,
        message: `CPU usage is ${Math.round(snapshot.cpu.usagePercent)}% (threshold ${settings.cpu.thresholdPercent}%).`
      },
      {
        key: 'memory',
        label: 'Memory Usage',
        value: snapshot.memory.usagePercent,
        rule: settings.memory,
        isExceeded: snapshot.memory.usagePercent >= settings.memory.thresholdPercent,
        message: `Memory usage is ${Math.round(snapshot.memory.usagePercent)}% (threshold ${settings.memory.thresholdPercent}%).`
      },
      {
        key: 'disk',
        label: 'Disk Usage',
        value: diskUsage,
        rule: settings.disk,
        isExceeded: diskUsage !== null && diskUsage >= settings.disk.thresholdPercent,
        message: `Disk usage is ${Math.round(diskUsage ?? 0)}% (threshold ${settings.disk.thresholdPercent}%).`
      },
      {
        key: 'battery',
        label: 'Low Battery',
        value: batteryCharge,
        rule: settings.battery,
        isExceeded:
          batteryCharge !== null &&
          !snapshot.battery.isCharging &&
          batteryCharge <= settings.battery.thresholdPercent,
        message: `Battery charge is ${Math.round(batteryCharge ?? 0)}% (threshold ${settings.battery.thresholdPercent}%).`
      }
    ]
  }
}

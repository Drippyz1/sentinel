import { app } from 'electron'
import { stat } from 'fs/promises'
import { homedir, release, uptime } from 'os'
import { sep } from 'path'
import { getStartupMetrics } from '../collectors/startup'
import { getSystemInfo } from '../collectors/systemInfo'
import { MetricsService } from '../services/MetricsService'
import { getDatabasePath } from '../storage/database'
import { getHistoryMetadata } from '../storage/queries'
import { loadSettings } from '../storage/settings'
import type { SystemReport, SystemReportExport, SystemReportFormat } from '../../shared/contracts'
import { normalizeTemperature } from '../../shared/utils/temperature'
import { sanitizePrivateText } from './privacy'

export async function createSystemReportExport(
  metricsService: MetricsService,
  format: SystemReportFormat
): Promise<SystemReportExport> {
  const report = await createSystemReport(metricsService)
  const generatedAt = new Date(report.generatedAt)
  const extension = format === 'json' ? 'json' : 'txt'
  return {
    filename: `sentinel-report-${formatFilenameTimestamp(generatedAt)}.${extension}`,
    mimeType: format === 'json' ? 'application/json' : 'text/plain',
    content: serializeSystemReport(report, format)
  }
}

export async function createSystemReport(metricsService: MetricsService): Promise<SystemReport> {
  const [snapshot, systemInfo, startup, databaseSizeBytes] = await Promise.all([
    metricsService.getLatestSnapshot(),
    getSystemInfo(),
    getStartupMetrics(),
    getDatabaseSize()
  ])
  const settings = loadSettings()
  const history = getHistoryMetadata()
  const generatedAt = new Date()
  const startupItems = startup.items.map(({ name, type, description, enabled }) => ({
    name,
    type,
    description,
    enabled
  }))

  return {
    generatedAt: generatedAt.toISOString(),
    system: {
      hostname: systemInfo.hostname,
      platform: systemInfo.platform,
      osVersion: `${systemInfo.distro} ${systemInfo.release}`.trim(),
      kernelVersion: release(),
      architecture: systemInfo.arch,
      uptimeSeconds: Math.floor(uptime())
    },
    cpu: {
      manufacturer: snapshot.cpu.manufacturer,
      brand: snapshot.cpu.brand,
      cores: systemInfo.cpuCores,
      threads: systemInfo.cpuThreads,
      usagePercent: snapshot.cpu.usagePercent,
      temperatureCelsius: normalizeTemperature(snapshot.cpu.temperature)
    },
    memory: {
      totalBytes: snapshot.memory.totalBytes,
      usedBytes: snapshot.memory.usedBytes,
      freeBytes: snapshot.memory.freeBytes,
      usagePercent: snapshot.memory.usagePercent
    },
    gpu: snapshot.gpu.controllers.map((controller) => ({
      model: controller.name,
      vendor: controller.vendor,
      utilizationPercent: finiteOrNull(controller.utilizationPercent),
      temperatureCelsius: normalizeTemperature(controller.temperatureCelsius)
    })),
    storage: snapshot.disk.drives.map((drive) => ({
      name: drive.name,
      mount: sanitizeMountPoint(drive.mount),
      type: drive.type,
      capacityBytes: drive.totalBytes,
      usedBytes: drive.usedBytes,
      freeBytes: drive.freeBytes
    })),
    network: snapshot.network.interfaces.map((networkInterface) => ({
      name: networkInterface.name,
      localIpAddress: networkInterface.ipAddress === 'N/A' ? null : networkInterface.ipAddress,
      active: networkInterface.isActive,
      downloadBytesPerSecond: networkInterface.downloadBytesPerSec,
      uploadBytesPerSecond: networkInterface.uploadBytesPerSec
    })),
    battery: {
      present: snapshot.battery.hasBattery,
      charging: snapshot.battery.isCharging,
      percent: snapshot.battery.hasBattery ? snapshot.battery.chargePercent : null,
      timeRemainingMinutes: snapshot.battery.timeRemainingMins
    },
    startupApplications: {
      enabled: startupItems.filter((item) => item.enabled).map(toStartupReportItem),
      disabled: startupItems.filter((item) => !item.enabled).map(toStartupReportItem)
    },
    sentinel: {
      appVersion: app.getVersion(),
      settingsVersion: settings.settingsVersion,
      uiPreferences: settings.ui,
      pollingIntervalMs: settings.pollIntervalMs
    },
    historySummary: {
      databaseSizeBytes,
      snapshotCount: history.snapshotCount,
      oldestSnapshotTimestamp: toIsoTimestamp(history.oldestTimestamp),
      newestSnapshotTimestamp: toIsoTimestamp(history.newestTimestamp)
    }
  }
}

export function serializeSystemReport(report: SystemReport, format: SystemReportFormat): string {
  return format === 'json' ? JSON.stringify(report, null, 2) : formatTextReport(report)
}

async function getDatabaseSize(): Promise<number | null> {
  const databasePath = getDatabasePath()
  const sizes = await Promise.all(
    [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(async (filePath) => {
      try {
        return (await stat(filePath)).size
      } catch {
        return 0
      }
    })
  )
  const total = sizes.reduce((sum, size) => sum + size, 0)
  return total > 0 ? total : null
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sanitizeMountPoint(mount: string): string {
  const home = homedir()
  return mount === home || mount.startsWith(`${home}${sep}`) ? '[user volume]' : mount
}

function toStartupReportItem(item: { name: string; type: string; description: string }): {
  name: string
  type: string
  description: string
} {
  return {
    name: item.name,
    type: item.type,
    description: sanitizePrivateText(item.description)
  }
}

function toIsoTimestamp(timestamp: number | null): string | null {
  return timestamp === null ? null : new Date(timestamp).toISOString()
}

export function formatFilenameTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Unavailable'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days}d ${hours}h ${minutes}m`
}

function formatOptional(value: string | number | null, suffix = ''): string {
  return value === null ? 'Unavailable' : `${value}${suffix}`
}

function formatTextReport(report: SystemReport): string {
  const lines: string[] = [
    `Sentinel System Report`,
    `Generated: ${report.generatedAt}`,
    '',
    '=== System ===',
    `Hostname: ${report.system.hostname}`,
    `Platform: ${report.system.platform}`,
    `OS Version: ${report.system.osVersion}`,
    `Kernel Version: ${report.system.kernelVersion}`,
    `Architecture: ${report.system.architecture}`,
    `Uptime: ${formatDuration(report.system.uptimeSeconds)}`,
    '',
    '=== CPU ===',
    `Manufacturer: ${report.cpu.manufacturer}`,
    `Brand: ${report.cpu.brand}`,
    `Cores: ${report.cpu.cores}`,
    `Threads: ${report.cpu.threads}`,
    `Current Usage: ${report.cpu.usagePercent}%`,
    `Temperature: ${formatOptional(report.cpu.temperatureCelsius, '°C')}`,
    '',
    '=== Memory ===',
    `Total: ${formatBytes(report.memory.totalBytes)}`,
    `Used: ${formatBytes(report.memory.usedBytes)}`,
    `Free: ${formatBytes(report.memory.freeBytes)}`,
    `Usage: ${report.memory.usagePercent}%`,
    '',
    '=== GPU ==='
  ]

  if (report.gpu.length === 0) {
    lines.push('No GPU information available')
  } else {
    report.gpu.forEach((gpu, index) => {
      lines.push(
        `GPU ${index + 1}: ${gpu.model}`,
        `  Vendor: ${gpu.vendor || 'Unavailable'}`,
        `  Utilization: ${formatOptional(gpu.utilizationPercent, '%')}`,
        `  Temperature: ${formatOptional(gpu.temperatureCelsius, '°C')}`
      )
    })
  }

  lines.push('', '=== Storage ===')
  if (report.storage.length === 0) {
    lines.push('No mounted storage information available')
  } else {
    report.storage.forEach((drive) => {
      lines.push(
        `${drive.name} (${drive.mount})`,
        `  Type: ${drive.type || 'Unavailable'}`,
        `  Capacity: ${formatBytes(drive.capacityBytes)}`,
        `  Used: ${formatBytes(drive.usedBytes)}`,
        `  Free: ${formatBytes(drive.freeBytes)}`
      )
    })
  }

  lines.push('', '=== Network ===')
  if (report.network.length === 0) {
    lines.push('No network interface information available')
  } else {
    report.network.forEach((networkInterface) => {
      lines.push(
        `${networkInterface.name}`,
        `  Local IP: ${networkInterface.localIpAddress ?? 'Unavailable'}`,
        `  Active: ${networkInterface.active ? 'Yes' : 'No'}`,
        `  Download: ${formatBytes(networkInterface.downloadBytesPerSecond)}/s`,
        `  Upload: ${formatBytes(networkInterface.uploadBytesPerSecond)}/s`
      )
    })
  }

  lines.push(
    '',
    '=== Battery ===',
    `Present: ${report.battery.present ? 'Yes' : 'No'}`,
    `Charging: ${report.battery.charging ? 'Yes' : 'No'}`,
    `Percent: ${formatOptional(report.battery.percent, '%')}`,
    `Time Remaining: ${formatOptional(report.battery.timeRemainingMinutes, ' minutes')}`,
    '',
    '=== Startup Applications ===',
    `Enabled (${report.startupApplications.enabled.length}):`,
    ...formatStartupItems(report.startupApplications.enabled),
    `Disabled (${report.startupApplications.disabled.length}):`,
    ...formatStartupItems(report.startupApplications.disabled),
    '',
    '=== Sentinel ===',
    `App Version: ${report.sentinel.appVersion}`,
    `Settings Version: ${report.sentinel.settingsVersion}`,
    `Polling Interval: ${report.sentinel.pollingIntervalMs} ms`,
    `UI Preferences: ${JSON.stringify(report.sentinel.uiPreferences)}`,
    '',
    '=== History Summary ===',
    `Database Size: ${formatBytes(report.historySummary.databaseSizeBytes)}`,
    `Snapshot Count: ${report.historySummary.snapshotCount}`,
    `Oldest Snapshot: ${report.historySummary.oldestSnapshotTimestamp ?? 'None'}`,
    `Newest Snapshot: ${report.historySummary.newestSnapshotTimestamp ?? 'None'}`
  )

  return `${lines.join('\n')}\n`
}

function formatStartupItems(items: SystemReport['startupApplications']['enabled']): string[] {
  return items.length === 0
    ? ['  None']
    : items.map((item) => `  - ${item.name} [${item.type}] — ${item.description}`)
}

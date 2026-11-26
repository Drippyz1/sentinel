import type { UiSettings } from './settings'
import type { MetricsSnapshot } from './metrics'
import type { StartupMetrics } from './system'

export type SystemReportFormat = 'json' | 'txt'

export interface SystemReport {
  generatedAt: string
  monitoring: Pick<MetricsSnapshot, 'timestamp' | 'statuses' | 'capabilities'>
  system: {
    hostname: string
    platform: string
    osVersion: string
    kernelVersion: string
    architecture: string
    uptimeSeconds: number
  }
  cpu: {
    manufacturer: string
    brand: string
    cores: number
    threads: number
    usagePercent: number | null
    temperatureCelsius: number | null
  }
  memory: {
    totalBytes: number | null
    usedBytes: number | null
    freeBytes: number | null
    usagePercent: number | null
  }
  gpu: {
    model: string
    vendor: string
    utilizationPercent: number | null
    temperatureCelsius: number | null
  }[]
  storage: {
    name: string
    mount: string
    type: string
    capacityBytes: number
    usedBytes: number
    availableBytes: number | null
    freeBytes: number
    purgeableBytes: number | null
    availableIncludesPurgeable: boolean
    isPrimary: boolean
  }[]
  network: {
    name: string
    localIpAddress: string | null
    active: boolean
    downloadBytesPerSecond: number | null
    uploadBytesPerSecond: number | null
  }[]
  battery: {
    present: boolean | null
    charging: boolean | null
    percent: number | null
    timeRemainingMinutes: number | null
  }
  startupApplications: StartupMetrics
  sentinel: {
    appVersion: string
    settingsVersion: number
    uiPreferences: UiSettings
    pollingIntervalMs: number
  }
  historySummary: {
    databaseSizeBytes: number | null
    snapshotCount: number
    oldestSnapshotTimestamp: string | null
    newestSnapshotTimestamp: string | null
  }
}

export interface SystemReportExport {
  filename: string
  mimeType: 'application/json' | 'text/plain'
  content: string
}

export interface DiagnosticBundleExport {
  filename: string
  mimeType: 'application/zip'
  content: ArrayBuffer
}

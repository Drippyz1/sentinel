import type { UiSettings } from './settings'

export type SystemReportFormat = 'json' | 'txt'

export interface SystemReport {
  generatedAt: string
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
    usagePercent: number
    temperatureCelsius: number | null
  }
  memory: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
    usagePercent: number
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
    freeBytes: number
  }[]
  network: {
    name: string
    localIpAddress: string | null
    active: boolean
    downloadBytesPerSecond: number
    uploadBytesPerSecond: number
  }[]
  battery: {
    present: boolean
    charging: boolean
    percent: number | null
    timeRemainingMinutes: number | null
  }
  startupApplications: {
    enabled: {
      name: string
      type: string
      description: string
    }[]
    disabled: {
      name: string
      type: string
      description: string
    }[]
  }
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

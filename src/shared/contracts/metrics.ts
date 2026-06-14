export interface CpuMetrics {
  manufacturer: string
  brand: string
  speedGHz: number
  cores: number
  usagePercent: number
  perCoreUsage: number[]
  temperature: number | null
}

export interface MemoryMetrics {
  totalBytes: number
  usedBytes: number
  freeBytes: number
  activeBytes: number
  inactiveBytes: number
  cachedBytes: number
  swapTotalBytes: number
  swapUsedBytes: number
  usagePercent: number
  swapUsagePercent: number
}

export interface DiskMetrics {
  drives: DiskDrive[]
  io: DiskIO
}

export interface DiskDrive {
  name: string
  mount: string
  type: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usagePercent: number
}

export interface DiskIO {
  readBytesPerSec: number
  writeBytesPerSec: number
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[]
  totalDownloadBytesPerSec: number
  totalUploadBytesPerSec: number
}

export interface NetworkInterface {
  name: string
  downloadBytesPerSec: number
  uploadBytesPerSec: number
  totalDownloaded: number
  totalUploaded: number
  ipAddress: string
  isActive: boolean
}

export interface GpuController {
  name: string
  vendor: string
  vramBytes: number
  vramUsedBytes: number
  vramFreeBytes: number
  vramUsagePercent: number
  utilizationPercent: number
  temperatureCelsius: number | null
  powerDrawWatts: number | null
  powerLimitWatts: number | null
}

export interface GpuMetrics {
  controllers: GpuController[]
  hasGpu: boolean
}

export interface BatteryMetrics {
  hasBattery: boolean
  chargePercent: number
  isCharging: boolean
  isPluggedIn: boolean
  timeRemainingMins: number | null
  voltage: number | null
  capacityWh: number | null
  designCapacityWh: number | null
  healthPercent: number | null
  cycleCount: number | null
  manufacturer: string | null
  model: string | null
}

export interface ProcessInfo {
  pid: number
  name: string
  cpuPercent: number
  memoryBytes: number
  memoryPercent: number
  status: string
  started: string
}

export interface ProcessDetails extends ProcessInfo {
  parentPid: number | null
  threads: number | null
  user: string | null
  path: string | null
  commandLine: string | null
  uptimeSeconds: number | null
  architecture: string
  platform: string
}

export interface ProcessMetrics {
  list: ProcessInfo[]
  total: number
}

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface Anomaly {
  metric: string
  currentValue: number
  meanValue: number
  stdDev: number
  zScore: number
  severity: AnomalySeverity
  message: string
  timestamp: number
}

export interface AnomalyReport {
  anomalies: Anomaly[]
  hasAnomalies: boolean
  samplesCount: number
  isWarmedUp: boolean
}

export interface MetricsSnapshot {
  timestamp: number
  cpu: CpuMetrics
  memory: MemoryMetrics
  disk: DiskMetrics
  network: NetworkMetrics
  gpu: GpuMetrics
  battery: BatteryMetrics
  processes: ProcessMetrics
  anomalyReport: AnomalyReport
}

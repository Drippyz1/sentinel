export interface CpuMetrics {
  manufacturer: string
  brand: string
  speedGHz: number
  cores: number
  usagePercent: number
  perCoreUsage: Array<number | null>
  /** Degrees Celsius; null when the OS does not provide a reading. */
  temperature: number | null
}

export interface MemoryMetrics {
  totalBytes: number
  usedBytes: number
  freeBytes: number
  activeBytes: number
  inactiveBytes: number | null
  cachedBytes: number | null
  swapTotalBytes: number | null
  swapUsedBytes: number | null
  usagePercent: number
  swapUsagePercent: number | null
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
  availableBytes: number
  freeBytes: number
  purgeableBytes: number | null
  availableIncludesPurgeable: boolean
  usagePercent: number
  isPrimary: boolean
}

export interface DiskIO {
  readBytesPerSec: number | null
  writeBytesPerSec: number | null
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[]
  totalDownloadBytesPerSec: number | null
  totalUploadBytesPerSec: number | null
}

export interface NetworkInterface {
  name: string
  downloadBytesPerSec: number | null
  uploadBytesPerSec: number | null
  totalDownloaded: number | null
  totalUploaded: number | null
  ipAddress: string
  isActive: boolean
}

export interface GpuController {
  name: string
  vendor: string
  vramBytes: number | null
  vramUsedBytes: number | null
  vramFreeBytes: number | null
  vramUsagePercent: number | null
  utilizationPercent: number | null
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

export interface ProcessIdentity {
  pid: number
  name: string
  started: string
}

export interface ProcessInfo extends ProcessIdentity {
  cpuPercent: number | null
  memoryBytes: number | null
  memoryPercent: number | null
  status: string
}

export interface ProcessDetails extends ProcessInfo {
  parentPid: number | null
  threads: number | null
  user: string | null
  path: string | null
  commandLine: string | null
  uptimeSeconds: number | null
  architecture: string | null
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

export const METRIC_GROUPS = [
  'cpu',
  'cpuTemperature',
  'memory',
  'diskCapacity',
  'diskIo',
  'network',
  'gpu',
  'battery',
  'processes'
] as const

export type MetricGroup = (typeof METRIC_GROUPS)[number]

export interface MetricGroupValues {
  cpu: Omit<CpuMetrics, 'temperature'>
  cpuTemperature: number
  memory: MemoryMetrics
  diskCapacity: DiskDrive[]
  diskIo: DiskIO
  network: NetworkMetrics
  gpu: GpuMetrics
  battery: BatteryMetrics
  processes: ProcessMetrics
}

export type MetricUnavailableReason = 'not-supported' | 'not-detected' | 'no-data' | 'warming-up'
export type MetricCapability = 'unknown' | 'supported' | 'not-supported' | 'not-detected'
export type MetricCollectionResult<T> =
  | { state: 'ok'; value: T }
  | { state: 'unavailable'; reason: MetricUnavailableReason }

export interface MetricStatus {
  state: 'pending' | 'ok' | 'unavailable' | 'error'
  reason: MetricUnavailableReason | 'collection-failed' | 'timed-out' | null
  /** UNIX epoch milliseconds at observation completion; null before the first attempt. */
  sampledAt: number | null
  revision: number
}

export interface DeviceCapabilities {
  platform: string
  architecture: string
  metrics: Record<MetricGroup, MetricCapability>
}

export interface MetricsSnapshot {
  /** UNIX epoch milliseconds when the desktop frame was published. */
  timestamp: number
  sequence: number
  statuses: Record<MetricGroup, MetricStatus>
  capabilities: DeviceCapabilities
  updatedGroups: MetricGroup[]
  cpu: CpuMetrics | null
  cpuTemperature: number | null
  memory: MemoryMetrics | null
  disk: DiskMetrics
  network: NetworkMetrics | null
  gpu: GpuMetrics | null
  battery: BatteryMetrics | null
  processes: ProcessMetrics | null
  anomalyReport: AnomalyReport
}

export type MetricsView = 'dashboard' | 'processes' | 'system' | 'tray' | 'mini' | 'status'

export type LiveMetricsFrame = Pick<
  MetricsSnapshot,
  'timestamp' | 'sequence' | 'statuses' | 'capabilities'
> &
  Partial<
    Pick<
      MetricsSnapshot,
      | 'cpu'
      | 'cpuTemperature'
      | 'memory'
      | 'disk'
      | 'network'
      | 'gpu'
      | 'battery'
      | 'processes'
      | 'anomalyReport'
    >
  > & { view: MetricsView }

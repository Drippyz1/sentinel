import { BrowserWindow } from 'electron'
import { getCpuMetrics } from '../collectors/cpu'
import { getMemoryMetrics } from '../collectors/memory'
import { getDiskMetrics } from '../collectors/disk'
import { getNetworkMetrics } from '../collectors/network'
import { getGpuMetrics } from '../collectors/gpu'
import { getBatteryMetrics } from '../collectors/battery'
import { getProcessMetrics } from '../collectors/processes'
import { checkForAnomalies } from '../analysis/anomalyDetector'
import type {
  BatteryMetrics,
  CpuMetrics,
  DiskMetrics,
  GpuMetrics,
  MemoryMetrics,
  MetricsSnapshot,
  NetworkMetrics,
  ProcessMetrics
} from '../../shared/contracts'
import { normalizeDiskMetrics } from '../../shared/utils/disk'

const FALLBACK_CPU: CpuMetrics = {
  manufacturer: 'Unknown',
  brand: 'Unavailable',
  speedGHz: 0,
  cores: 0,
  usagePercent: 0,
  perCoreUsage: [],
  temperature: null
}

const FALLBACK_MEMORY: MemoryMetrics = {
  totalBytes: 0,
  usedBytes: 0,
  freeBytes: 0,
  activeBytes: 0,
  inactiveBytes: 0,
  cachedBytes: 0,
  swapTotalBytes: 0,
  swapUsedBytes: 0,
  usagePercent: 0,
  swapUsagePercent: 0
}

const FALLBACK_DISK: DiskMetrics = {
  drives: [],
  io: { readBytesPerSec: 0, writeBytesPerSec: 0 }
}

const FALLBACK_NETWORK: NetworkMetrics = {
  interfaces: [],
  totalDownloadBytesPerSec: 0,
  totalUploadBytesPerSec: 0
}

const FALLBACK_GPU: GpuMetrics = {
  controllers: [],
  hasGpu: false
}

const FALLBACK_BATTERY: BatteryMetrics = {
  hasBattery: false,
  chargePercent: 0,
  isCharging: false,
  isPluggedIn: false,
  timeRemainingMins: null,
  voltage: null,
  capacityWh: null,
  designCapacityWh: null,
  healthPercent: null,
  cycleCount: null,
  manufacturer: null,
  model: null
}

const FALLBACK_PROCESSES: ProcessMetrics = {
  list: [],
  total: 0
}

interface MetricsServiceOptions {
  getIntervalMs: () => number
  shouldBroadcast: () => boolean
  onCollected: (snapshot: MetricsSnapshot) => void
}

export class MetricsService {
  private latestSnapshot: MetricsSnapshot | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private activeCollection: Promise<MetricsSnapshot> | null = null
  private generation = 0
  private running = false

  constructor(private readonly options: MetricsServiceOptions) {}

  start(): void {
    if (this.running) return
    this.running = true
    const generation = ++this.generation
    void this.runCycle(generation)
  }

  async restart(): Promise<void> {
    if (!this.running) {
      this.start()
      return
    }

    const generation = ++this.generation
    this.clearTimer()
    if (this.activeCollection) await this.activeCollection
    if (this.running && generation === this.generation) {
      void this.runCycle(generation)
    }
  }

  async stop(): Promise<void> {
    this.running = false
    this.generation += 1
    this.clearTimer()
    if (this.activeCollection) await this.activeCollection
  }

  async getLatestSnapshot(): Promise<MetricsSnapshot> {
    if (this.latestSnapshot) return this.latestSnapshot
    return this.collectOnce()
  }

  broadcastLatest(force = false): void {
    if (!this.latestSnapshot || (!force && !this.options.shouldBroadcast())) return

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('metrics-updated', this.latestSnapshot)
      }
    }
  }

  private async runCycle(generation: number): Promise<void> {
    if (!this.running || generation !== this.generation) return

    try {
      await this.collectOnce()
    } catch (error) {
      console.error('Metrics collection failed:', error)
    }

    if (!this.running || generation !== this.generation) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.runCycle(generation)
    }, this.options.getIntervalMs())
  }

  private collectOnce(): Promise<MetricsSnapshot> {
    if (this.activeCollection) return this.activeCollection

    this.activeCollection = this.collectSnapshot()
      .then((snapshot) => {
        this.latestSnapshot = snapshot

        try {
          this.options.onCollected(snapshot)
        } catch (error) {
          console.error('Metrics snapshot processing failed:', error)
        }

        this.broadcastLatest()
        return snapshot
      })
      .finally(() => {
        this.activeCollection = null
      })

    return this.activeCollection
  }

  private async collectSnapshot(): Promise<MetricsSnapshot> {
    const previous = this.latestSnapshot
    const [cpu, memory, disk, network, gpu, battery, processes] = await Promise.all([
      this.collectMetric('CPU', getCpuMetrics, () => previous?.cpu ?? FALLBACK_CPU),
      this.collectMetric('Memory', getMemoryMetrics, () => previous?.memory ?? FALLBACK_MEMORY),
      this.collectMetric('Disk', getDiskMetrics, () => previous?.disk ?? FALLBACK_DISK),
      this.collectMetric('Network', getNetworkMetrics, () => previous?.network ?? FALLBACK_NETWORK),
      this.collectMetric('GPU', getGpuMetrics, () => previous?.gpu ?? FALLBACK_GPU),
      this.collectMetric('Battery', getBatteryMetrics, () => previous?.battery ?? FALLBACK_BATTERY),
      this.collectMetric(
        'Process',
        getProcessMetrics,
        () => previous?.processes ?? FALLBACK_PROCESSES
      )
    ])
    const normalizedDisk = normalizeDiskMetrics(disk)
    const timestamp = Date.now()
    const anomalyReport = checkForAnomalies({
      cpu: cpu.usagePercent,
      memory: memory.usagePercent,
      diskRead: normalizedDisk.io.readBytesPerSec,
      diskWrite: normalizedDisk.io.writeBytesPerSec,
      netDown: network.totalDownloadBytesPerSec,
      netUp: network.totalUploadBytesPerSec,
      gpu: gpu.controllers[0]?.utilizationPercent ?? null
    })

    return {
      timestamp,
      cpu,
      memory,
      disk: normalizedDisk,
      network,
      gpu,
      battery,
      processes,
      anomalyReport
    }
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private async collectMetric<T>(
    name: string,
    collector: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    try {
      return await collector()
    } catch (error) {
      console.error(`${name} metrics collection failed:`, error)
      return fallback()
    }
  }
}

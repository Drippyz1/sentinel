import { BrowserWindow } from 'electron'
import { getCpuMetrics, CpuMetrics } from '../collectors/cpu'
import { getMemoryMetrics, MemoryMetrics } from '../collectors/memory'
import { getDiskMetrics, DiskMetrics } from '../collectors/disk'
import { getNetworkMetrics, NetworkMetrics } from '../collectors/network'
import { getGpuMetrics, GpuMetrics } from '../collectors/gpu'
import { getBatteryMetrics, BatteryMetrics } from '../collectors/battery'
import { getProcessMetrics, ProcessMetrics } from '../collectors/processes'
import { checkForAnomalies, AnomalyReport } from '../analysis/anomalyDetector'

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
    const processesPromise = getProcessMetrics().catch((error) => {
      console.error('Process metrics collection failed:', error)
      return this.latestSnapshot?.processes ?? { list: [], total: 0 }
    })
    const [cpu, memory, disk, network, gpu, battery, processes] = await Promise.all([
      getCpuMetrics(),
      getMemoryMetrics(),
      getDiskMetrics(),
      getNetworkMetrics(),
      getGpuMetrics(),
      getBatteryMetrics(),
      processesPromise
    ])
    const timestamp = Date.now()
    const anomalyReport = checkForAnomalies({
      cpu: cpu.usagePercent,
      memory: memory.usagePercent,
      diskRead: disk.io.readBytesPerSec,
      diskWrite: disk.io.writeBytesPerSec,
      netDown: network.totalDownloadBytesPerSec,
      netUp: network.totalUploadBytesPerSec,
      gpu: gpu.controllers[0]?.utilizationPercent ?? null
    })

    return {
      timestamp,
      cpu,
      memory,
      disk,
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
}

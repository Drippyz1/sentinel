import {
  METRIC_GROUPS,
  type MetricGroup,
  type MetricGroupValues,
  type MetricsSnapshot
} from '../../shared/contracts'
import { MetricPoller, type CollectionIntervals } from '../../monitoring/MetricPoller'
import { checkForAnomalies } from '../analysis/anomalyDetector'

interface MetricsServiceOptions {
  intervalMs: number
  shouldBroadcast: () => boolean
  onCollected: (snapshot: MetricsSnapshot) => void
  onBroadcast: (snapshot: MetricsSnapshot) => void
}

export class MetricsService {
  private latest: MetricsSnapshot
  private timer: ReturnType<typeof setTimeout> | undefined
  private running = false
  private intervalMs: number
  private warmupUntil = 0
  private pausedStartup: Promise<void> | undefined
  private finishPausedStartup: (() => void) | undefined

  constructor(
    private readonly poller: MetricPoller<MetricGroupValues>,
    private readonly options: MetricsServiceOptions
  ) {
    this.intervalMs = options.intervalMs
    this.latest = this.projectSnapshot()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.warmupUntil = performance.now() + 1000
    this.poller.start()
    this.schedule(100)
  }

  setPolicy(intervalMs: number, intervals: CollectionIntervals<MetricGroupValues>): void {
    this.poller.setIntervals(intervals)
    if (intervalMs !== this.intervalMs) {
      this.intervalMs = intervalMs
      if (this.running) this.schedule(intervalMs)
    }
  }

  stop(): Promise<void> {
    this.running = false
    clearTimeout(this.timer)
    this.finishPausedStartup?.()
    return this.poller.stop()
  }

  getLatestSnapshot(): MetricsSnapshot {
    return this.latest
  }

  async getPausedSnapshot(): Promise<MetricsSnapshot> {
    if (!this.isWarm() && this.running) {
      this.pausedStartup ??= new Promise<void>((resolve) => {
        const timeout = setTimeout(() => this.finishPausedStartup?.(), 3500)
        this.finishPausedStartup = () => {
          clearTimeout(timeout)
          this.finishPausedStartup = undefined
          resolve()
        }
      })
      await this.pausedStartup
    }
    return this.latest
  }

  private isWarm(): boolean {
    const { cpu, memory, diskCapacity } = this.latest.statuses
    return (
      cpu.state !== 'pending' &&
      cpu.reason !== 'warming-up' &&
      memory.state !== 'pending' &&
      diskCapacity.state !== 'pending'
    )
  }

  broadcastLatest(): void {
    if (this.running && this.options.shouldBroadcast()) this.options.onBroadcast(this.latest)
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      try {
        if (this.poller.sequence !== this.latest.sequence) {
          this.latest = this.projectSnapshot(this.latest)
          if (this.finishPausedStartup && this.isWarm()) this.finishPausedStartup()
          try {
            this.options.onCollected(this.latest)
          } catch (error) {
            console.error('Could not process background snapshot:', error)
          }
          this.broadcastLatest()
        }
      } catch (error) {
        console.error('Metrics snapshot processing failed:', error)
      } finally {
        if (this.running) {
          this.schedule(performance.now() < this.warmupUntil ? 100 : this.intervalMs)
        }
      }
    }, delayMs)
  }

  private projectSnapshot(previous?: MetricsSnapshot): MetricsSnapshot {
    const statuses = {} as MetricsSnapshot['statuses']
    const capability = {} as MetricsSnapshot['capabilities']['metrics']
    const updatedGroups: MetricGroup[] = []
    for (const group of METRIC_GROUPS) {
      const reading = this.poller.get(group)
      statuses[group] = reading.status
      capability[group] = reading.capability
      if (reading.status.revision !== (previous?.statuses[group].revision ?? 0)) {
        updatedGroups.push(group)
      }
    }
    const cpu = this.poller.get('cpu').value
    const cpuTemperature = this.poller.get('cpuTemperature').value
    const memory = this.poller.get('memory').value
    const io = this.poller.get('diskIo').value
    const network = this.poller.get('network').value
    const gpu = this.poller.get('gpu').value
    const fresh = (group: MetricGroup, value: number | null | undefined) =>
      updatedGroups.includes(group) ? (value ?? null) : null

    return {
      timestamp: Date.now(),
      sequence: this.poller.sequence,
      statuses,
      capabilities: { platform: process.platform, architecture: process.arch, metrics: capability },
      updatedGroups,
      cpu: cpu && { ...cpu, temperature: cpuTemperature },
      cpuTemperature,
      memory,
      disk: {
        drives: this.poller.get('diskCapacity').value ?? [],
        io: io ?? { readBytesPerSec: null, writeBytesPerSec: null }
      },
      network,
      gpu,
      battery: this.poller.get('battery').value,
      processes: this.poller.get('processes').value,
      anomalyReport: checkForAnomalies({
        cpu: fresh('cpu', cpu?.usagePercent),
        memory: fresh('memory', memory?.usagePercent),
        diskRead: fresh('diskIo', io?.readBytesPerSec),
        diskWrite: fresh('diskIo', io?.writeBytesPerSec),
        netDown: fresh('network', network?.totalDownloadBytesPerSec),
        netUp: fresh('network', network?.totalUploadBytesPerSec),
        gpu: fresh('gpu', gpu?.controllers[0]?.utilizationPercent)
      })
    }
  }
}

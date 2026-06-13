// How many recent readings to use when calculating "normal"
// 900 readings at 2 seconds each = 30 minutes of history
const WINDOW_SIZE = 900

// Mutable threshold — updated at runtime via setThreshold()
let THRESHOLD = 2.5

export function setThreshold(value: number) {
  THRESHOLD = value
}

// Minimum readings needed before we start flagging anomalies
const MIN_SAMPLES = 60

class CircularBuffer {
  private buffer: number[]
  private size: number
  private head: number = 0
  private count: number = 0

  constructor(size: number) {
    this.size = size
    this.buffer = new Array(size).fill(0)
  }

  push(value: number) {
    this.buffer[this.head] = value
    this.head = (this.head + 1) % this.size
    this.count = Math.min(this.count + 1, this.size)
  }

  getValues(): number[] {
    if (this.count < this.size) return this.buffer.slice(0, this.count)
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)]
  }

  get length(): number {
    return this.count
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stdDev(values: number[], avg: number): number {
  if (values.length === 0) return 0
  return Math.sqrt(mean(values.map((v) => Math.pow(v - avg, 2))))
}

function getSeverity(zScore: number): AnomalySeverity {
  const abs = Math.abs(zScore)
  if (abs >= 3.5) return 'critical'
  if (abs >= 2.5) return 'warning'
  return 'info'
}

class MetricDetector {
  private buffer: CircularBuffer
  private name: string

  // Exposed as a getter so checkForAnomalies can read
  // the sample count without bracket-notation hacks
  get sampleCount(): number {
    return this.buffer.length
  }

  constructor(name: string) {
    this.name = name
    this.buffer = new CircularBuffer(WINDOW_SIZE)
  }

  check(value: number): Anomaly | null {
    // Sanitize — NaN/Infinity poison mean() via reduce forever
    const safe = typeof value === 'number' && isFinite(value) ? value : 0
    this.buffer.push(safe)

    if (this.buffer.length < MIN_SAMPLES) return null

    const values = this.buffer.getValues()
    const avg = mean(values)
    const std = stdDev(values, avg)

    if (std < 0.5) return null

    const zScore = (safe - avg) / std
    if (!isFinite(zScore)) return null
    if (zScore < THRESHOLD) return null

    return {
      metric: this.name,
      currentValue: Math.round(safe * 10) / 10,
      meanValue: Math.round(avg * 10) / 10,
      stdDev: Math.round(std * 10) / 10,
      zScore: Math.round(zScore * 100) / 100,
      severity: getSeverity(zScore),
      message: this.buildMessage(safe, avg),
      timestamp: Date.now()
    }
  }

  private buildMessage(value: number, avg: number): string {
    const pctAbove =
      avg > 0 && isFinite(avg) && isFinite(value) ? Math.round(((value - avg) / avg) * 100) : 0

    const messages: Record<string, string> = {
      cpu: `CPU is ${pctAbove}% above your usual ${Math.round(avg)}% baseline`,
      memory: `Memory usage is ${pctAbove}% above your usual ${Math.round(avg)}% baseline`,
      disk_read: `Disk read speed is unusually high (${pctAbove}% above normal)`,
      disk_write: `Disk write speed is unusually high (${pctAbove}% above normal)`,
      net_down: `Download speed spike detected (${pctAbove}% above normal)`,
      net_up: `Upload spike detected — something may be syncing or uploading`,
      gpu: `GPU usage is ${pctAbove}% above your usual ${Math.round(avg)}% baseline`
    }

    return messages[this.name] ?? `${this.name} is ${pctAbove}% above normal`
  }
}

const detectors: Record<string, MetricDetector> = {
  cpu: new MetricDetector('cpu'),
  memory: new MetricDetector('memory'),
  disk_read: new MetricDetector('disk_read'),
  disk_write: new MetricDetector('disk_write'),
  net_down: new MetricDetector('net_down'),
  net_up: new MetricDetector('net_up'),
  gpu: new MetricDetector('gpu')
}

export function checkForAnomalies(metrics: {
  cpu: number
  memory: number
  diskRead: number
  diskWrite: number
  netDown: number
  netUp: number
  gpu: number | null
}): AnomalyReport {
  const anomalies: Anomaly[] = []

  const checks = [
    { key: 'cpu', value: metrics.cpu },
    { key: 'memory', value: metrics.memory },
    { key: 'disk_read', value: metrics.diskRead },
    { key: 'disk_write', value: metrics.diskWrite },
    { key: 'net_down', value: metrics.netDown },
    { key: 'net_up', value: metrics.netUp },
    { key: 'gpu', value: metrics.gpu ?? 0 }
  ]

  for (const { key, value } of checks) {
    const anomaly = detectors[key].check(value)
    if (anomaly) anomalies.push(anomaly)
  }

  // Use the getter — never bracket-notation on a private field
  const samplesCount = detectors['cpu'].sampleCount
  const isWarmedUp = samplesCount >= MIN_SAMPLES

  return {
    anomalies,
    hasAnomalies: anomalies.length > 0,
    samplesCount,
    isWarmedUp
  }
}
import type { Anomaly, AnomalyReport, AnomalySeverity } from '../../shared/contracts'

// How many recent readings to use when calculating "normal"
// 900 readings at 2 seconds each = 30 minutes of history
const WINDOW_SIZE = 900

// How many standard deviations away counts as an anomaly
// 2.0 = flags ~5% of readings (sensitive)
// 2.5 = flags ~1% of readings (balanced)
// 3.0 = flags ~0.3% of readings (conservative)
let THRESHOLD = 2.5

export function setThreshold(value: number) {
  THRESHOLD = value
}

// Minimum readings needed before we start flagging anomalies
// Prevents false alarms while the detector is still learning
const MIN_SAMPLES = 60

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface Anomaly {
  metric:      string            // e.g. 'cpu', 'memory'
  currentValue: number
  meanValue:   number
  stdDev:      number
  zScore:      number            // how many std devs away from mean
  severity:    AnomalySeverity
  message:     string            // human readable explanation
  timestamp:   number
}

// Circular buffer — stores the last N values efficiently
// When full, new values overwrite the oldest ones
class CircularBuffer {
  private buffer:  number[]
  private size:    number
  private head:    number = 0
  private count:   number = 0

  constructor(size: number) {
    this.size   = size
    this.buffer = new Array(size).fill(0)
  }

  push(value: number) {
    this.buffer[this.head] = value
    this.head  = (this.head + 1) % this.size
    this.count = Math.min(this.count + 1, this.size)
  }

  getValues(): number[] {
    if (this.count < this.size) {
      return this.buffer.slice(0, this.count)
    }
    // Reorder so values are in chronological order
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head)
    ]
  }

  get length(): number { return this.count }
}

// Calculate mean of an array
function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Calculate standard deviation
function stdDev(values: number[], avg: number): number {
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2))
  return Math.sqrt(mean(squaredDiffs))
}

// Determine severity from z-score
function getSeverity(zScore: number): AnomalySeverity {
  const abs = Math.abs(zScore)
  if (abs >= 3.5) return 'critical'
  if (abs >= 2.5) return 'warning'
  return 'info'
}

// One detector instance per metric
class MetricDetector {
  private buffer: CircularBuffer
  private name:   string

  constructor(name: string) {
    this.name   = name
    this.buffer = new CircularBuffer(WINDOW_SIZE)
  }

  // Returns an anomaly if the value is unusual, null if normal
  check(value: number): Anomaly | null {
    // Skip bad values from the system info library so they don't corrupt the buffer
    if (!isFinite(value) || isNaN(value)) return null
    this.buffer.push(value)

    // Not enough data yet
    if (this.buffer.length < MIN_SAMPLES) return null

    const values = this.buffer.getValues()
    const avg    = mean(values)
    const std    = stdDev(values, avg)

    // If std dev is near zero, the metric is very stable
    // Avoid division by zero and don't flag stable metrics
    if (std < 0.5) return null

    const zScore = (value - avg) / std

    // Only flag if above threshold and value is actually high
    // (we care about unusually HIGH usage, not unusually low)
    if (zScore < THRESHOLD) return null

    return {
      metric:       this.name,
      currentValue: Math.round(value * 10) / 10,
      meanValue:    Math.round(avg * 10) / 10,
      stdDev:       Math.round(std * 10) / 10,
      zScore:       Math.round(zScore * 100) / 100,
      severity:     getSeverity(zScore),
      message:      this.buildMessage(value, avg, std),
      timestamp:    Date.now(),
    }
  }

  private buildMessage(value: number, avg: number, _std: number): string {
    const pctAbove = (avg > 0 && isFinite(avg))
      ? Math.round(((value - avg) / avg) * 100)
      : 0

    const messages: Record<string, string> = {
      cpu:     `CPU is ${pctAbove}% above your usual ${Math.round(avg)}% baseline`,
      memory:  `Memory usage is ${pctAbove}% above your usual ${Math.round(avg)}% baseline`,
      disk_read:  `Disk read speed is unusually high (${pctAbove}% above normal)`,
      disk_write: `Disk write speed is unusually high (${pctAbove}% above normal)`,
      net_down:   `Download speed spike detected (${pctAbove}% above normal)`,
      net_up:     `Upload spike detected — something may be syncing or uploading`,
      gpu:     `GPU usage is ${pctAbove}% above your usual ${Math.round(avg)}% baseline`,
    }

    return messages[this.name] ?? `${this.name} is ${pctAbove}% above normal`
  }
}

// One detector per metric — created once and reused
const detectors: Record<string, MetricDetector> = {
  cpu:        new MetricDetector('cpu'),
  memory:     new MetricDetector('memory'),
  disk_read:  new MetricDetector('disk_read'),
  disk_write: new MetricDetector('disk_write'),
  net_down:   new MetricDetector('net_down'),
  net_up:     new MetricDetector('net_up'),
  gpu:        new MetricDetector('gpu'),
}

export interface AnomalyReport {
  anomalies:    Anomaly[]
  hasAnomalies: boolean
  samplesCount: number   // how many samples we've collected so far
  isWarmedUp:   boolean  // false until we have MIN_SAMPLES readings
}

// Feed new metric values in and get back any anomalies detected
export function checkForAnomalies(metrics: {
  cpu:       number
  memory:    number
  diskRead:  number
  diskWrite: number
  netDown:   number
  netUp:     number
  gpu:       number | null
}): AnomalyReport {
  const anomalies: Anomaly[] = []

  const checks = [
    { key: 'cpu',        value: metrics.cpu        },
    { key: 'memory',     value: metrics.memory      },
    { key: 'disk_read',  value: metrics.diskRead    },
    { key: 'disk_write', value: metrics.diskWrite   },
    { key: 'net_down',   value: metrics.netDown     },
    { key: 'net_up',     value: metrics.netUp       },
    { key: 'gpu',        value: metrics.gpu ?? 0    },
  ]

  for (const { key, value } of checks) {
    const anomaly = detectors[key].check(value)
    if (anomaly) anomalies.push(anomaly)
  }

  // Use CPU detector's sample count as a proxy for overall warmup
  const cpuValues     = detectors['cpu']['buffer']
  const samplesCount  = cpuValues.length
  const isWarmedUp    = samplesCount >= MIN_SAMPLES

  return {
    anomalies,
    hasAnomalies: anomalies.length > 0,
    samplesCount,
    isWarmedUp,
  }
}
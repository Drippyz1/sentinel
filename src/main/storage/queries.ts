import { getDatabase } from './database'

export interface SnapshotRow {
  timestamp:    number
  cpu_usage:    number
  memory_usage: number
  memory_used:  number
  disk_usage:   number
  disk_read:    number
  disk_write:   number
  net_down:     number
  net_up:       number
  gpu_usage:    number | null
  battery:      number | null
}

export interface HistoryQuery {
  metric:    string   // which metric to return
  minutes:   number   // how many minutes back to look
}

// Returns raw rows for a time range
export function getSnapshots(minutes: number): SnapshotRow[] {
  const db     = getDatabase()
  const cutoff = Date.now() - (minutes * 60 * 1000)

  return db.prepare(`
    SELECT * FROM metric_snapshots
    WHERE timestamp > ?
    ORDER BY timestamp ASC
  `).all(cutoff) as SnapshotRow[]
}

// Returns summary stats for a time range — useful for dashboards
export function getSummary(minutes: number) {
  const db     = getDatabase()
  const cutoff = Date.now() - (minutes * 60 * 1000)

  return db.prepare(`
    SELECT
      ROUND(AVG(cpu_usage), 1)    as avg_cpu,
      ROUND(MAX(cpu_usage), 1)    as max_cpu,
      ROUND(AVG(memory_usage), 1) as avg_memory,
      ROUND(MAX(memory_usage), 1) as max_memory,
      ROUND(AVG(net_down), 0)     as avg_net_down,
      ROUND(MAX(net_down), 0)     as max_net_down,
      COUNT(*)                    as sample_count
    FROM metric_snapshots
    WHERE timestamp > ?
  `).get(cutoff) as {
    avg_cpu:      number
    max_cpu:      number
    avg_memory:   number
    max_memory:   number
    avg_net_down: number
    max_net_down: number
    sample_count: number
  }
}

// Returns one row per minute, averaged — for longer time ranges
// Showing 10,000 raw data points in a chart is slow and pointless
// This buckets them into 1-minute averages instead
export function getDownsampled(minutes: number): SnapshotRow[] {
  const db          = getDatabase()
  const cutoff      = Date.now() - (minutes * 60 * 1000)
  const bucketMs    = 60 * 1000   // 1 minute buckets

  return db.prepare(`
    SELECT
      (timestamp / ${bucketMs}) * ${bucketMs} as timestamp,
      ROUND(AVG(cpu_usage), 1)    as cpu_usage,
      ROUND(AVG(memory_usage), 1) as memory_usage,
      ROUND(AVG(memory_used), 0)  as memory_used,
      ROUND(AVG(disk_usage), 1)   as disk_usage,
      ROUND(AVG(disk_read), 0)    as disk_read,
      ROUND(AVG(disk_write), 0)   as disk_write,
      ROUND(AVG(net_down), 0)     as net_down,
      ROUND(AVG(net_up), 0)       as net_up,
      ROUND(AVG(gpu_usage), 1)    as gpu_usage,
      ROUND(AVG(battery), 1)      as battery
    FROM metric_snapshots
    WHERE timestamp > ?
    GROUP BY timestamp / ${bucketMs}
    ORDER BY timestamp ASC
  `).all(cutoff) as SnapshotRow[]
}
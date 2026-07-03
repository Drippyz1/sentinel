export interface SnapshotRow {
  timestamp: number
  cpu_usage: number
  memory_usage: number
  memory_used: number
  disk_usage: number
  disk_available: number | null
  disk_free: number | null
  disk_purgeable: number | null
  disk_read: number
  disk_write: number
  net_down: number
  net_up: number
  gpu_usage: number | null
  battery: number | null
  cpu_temperature: number | null
  gpu_temperature: number | null
}

export interface HistorySummary {
  avg_cpu: number
  max_cpu: number
  avg_memory: number
  max_memory: number
  avg_net_down: number
  max_net_down: number
  sample_count: number
}

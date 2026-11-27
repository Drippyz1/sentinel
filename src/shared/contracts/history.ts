export const HISTORY_BUCKET_MS = 60_000

export interface SnapshotRow {
  timestamp: number
  cpu_usage: number | null
  memory_usage: number | null
  memory_used: number | null
  disk_usage: number | null
  disk_available: number | null
  disk_free: number | null
  disk_purgeable: number | null
  disk_read: number | null
  disk_write: number | null
  disk_read_legacy_ops: number | null
  disk_write_legacy_ops: number | null
  net_down: number | null
  net_up: number | null
  gpu_usage: number | null
  battery: number | null
  cpu_temperature: number | null
  gpu_temperature: number | null
}

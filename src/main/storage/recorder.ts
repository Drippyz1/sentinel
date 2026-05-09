import { getDatabase } from './database'
import { CpuMetrics }     from '../collectors/cpu'
import { MemoryMetrics }  from '../collectors/memory'
import { DiskMetrics }    from '../collectors/disk'
import { NetworkMetrics } from '../collectors/network'
import { GpuMetrics }     from '../collectors/gpu'
import { BatteryMetrics } from '../collectors/battery'

// How many days of history to keep
// Older rows get deleted automatically to control file size
const RETENTION_DAYS = 7

interface SnapshotData {
  cpu:     CpuMetrics
  memory:  MemoryMetrics
  disk:    DiskMetrics
  network: NetworkMetrics
  gpu:     GpuMetrics     | null
  battery: BatteryMetrics | null
}

// Prepare the insert statement once and reuse it
// "Prepared statements" are pre-compiled SQL — much faster than
// building the query string every time
let insertStmt: ReturnType<typeof getDatabase>['prepare'] | null = null
let cleanupStmt: ReturnType<typeof getDatabase>['prepare'] | null = null

function getInsertStmt() {
  if (insertStmt) return insertStmt
  const db = getDatabase()
  insertStmt = db.prepare(`
    INSERT INTO metric_snapshots (
      timestamp, cpu_usage, memory_usage, memory_used,
      disk_usage, disk_read, disk_write,
      net_down, net_up, gpu_usage, battery
    ) VALUES (
      @timestamp, @cpu_usage, @memory_usage, @memory_used,
      @disk_usage, @disk_read, @disk_write,
      @net_down, @net_up, @gpu_usage, @battery
    )
  `)
  return insertStmt
}

function getCleanupStmt() {
  if (cleanupStmt) return cleanupStmt
  const db = getDatabase()
  cleanupStmt = db.prepare(`
    DELETE FROM metric_snapshots
    WHERE timestamp < @cutoff
  `)
  return cleanupStmt
}

export function recordSnapshot(data: SnapshotData) {
  try {
    const primaryDrive = data.disk.drives.find(d => d.mount === '/') ?? data.disk.drives[0]

    getInsertStmt().run({
      timestamp:    Date.now(),
      cpu_usage:    data.cpu.usagePercent,
      memory_usage: data.memory.usagePercent,
      memory_used:  data.memory.usedBytes,
      disk_usage:   primaryDrive?.usagePercent ?? 0,
      disk_read:    data.disk.io.readBytesPerSec,
      disk_write:   data.disk.io.writeBytesPerSec,
      net_down:     data.network.totalDownloadBytesPerSec,
      net_up:       data.network.totalUploadBytesPerSec,
      gpu_usage:    data.gpu?.controllers[0]?.utilizationPercent ?? null,
      battery:      data.battery?.hasBattery ? data.battery.chargePercent : null,
    })

  } catch (err) {
    console.error('Failed to record snapshot:', err)
  }
}

// Delete rows older than RETENTION_DAYS
// Call this periodically — we'll run it once per hour
export function cleanOldSnapshots() {
  try {
    const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const result = getCleanupStmt().run({ cutoff })
    if (result.changes > 0) {
      console.log(`Cleaned ${result.changes} old snapshots`)
    }
  } catch (err) {
    console.error('Failed to clean snapshots:', err)
  }
}
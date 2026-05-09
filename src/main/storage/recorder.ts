import { getDatabase } from './database'
import { CpuMetrics }     from '../collectors/cpu'
import { MemoryMetrics }  from '../collectors/memory'
import { DiskMetrics }    from '../collectors/disk'
import { NetworkMetrics } from '../collectors/network'
import { GpuMetrics }     from '../collectors/gpu'
import { BatteryMetrics } from '../collectors/battery'

// How many days of history to keep before auto-deleting old rows
const RETENTION_DAYS = 7

interface SnapshotData {
  cpu:     CpuMetrics
  memory:  MemoryMetrics
  disk:    DiskMetrics
  network: NetworkMetrics
  gpu:     GpuMetrics     | null
  battery: BatteryMetrics | null
}

// Prepared statements are compiled once and reused on every insert
// This is significantly faster than building the SQL string each time
let insertStmt:  ReturnType<typeof getDatabase>['prepare'] | null = null
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

      // ?? 0 on every numeric field so a null or undefined value
      // from the collectors during startup never hits the NOT NULL
      // constraint in the database schema
      cpu_usage:    data.cpu.usagePercent                     ?? 0,
      memory_usage: data.memory.usagePercent                  ?? 0,
      memory_used:  data.memory.usedBytes                     ?? 0,
      disk_usage:   primaryDrive?.usagePercent                ?? 0,
      disk_read:    data.disk.io.readBytesPerSec              ?? 0,
      disk_write:   data.disk.io.writeBytesPerSec             ?? 0,
      net_down:     data.network.totalDownloadBytesPerSec     ?? 0,
      net_up:       data.network.totalUploadBytesPerSec       ?? 0,

      // These two are genuinely nullable — machines without a GPU
      // or battery correctly store null in the database
      gpu_usage:    data.gpu?.controllers[0]?.utilizationPercent ?? null,
      battery:      data.battery?.hasBattery ? data.battery.chargePercent : null,
    })

  } catch (err) {
    console.error('Failed to record snapshot:', err)
  }
}

export function cleanOldSnapshots(retentionDays = RETENTION_DAYS) {
  try {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)
    const result = getCleanupStmt().run({ cutoff })
    if (result.changes > 0) {
      console.log(`Cleaned ${result.changes} old snapshots`)
    }
  } catch (err) {
    console.error('Failed to clean snapshots:', err)
  }
}
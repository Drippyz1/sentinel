import Database from 'better-sqlite3'
import { getDatabase } from './database'
import type {
  BatteryMetrics,
  CpuMetrics,
  DiskMetrics,
  GpuMetrics,
  MemoryMetrics,
  NetworkMetrics
} from '../../shared/contracts'
import { normalizeTemperature } from '../../shared/utils/temperature'

const RETENTION_DAYS = 7

interface SnapshotData {
  timestamp?: number
  cpu: CpuMetrics
  memory: MemoryMetrics
  disk: DiskMetrics
  network: NetworkMetrics
  gpu: GpuMetrics | null
  battery: BatteryMetrics | null
}

// Use better-sqlite3's Statement type directly to avoid the
// ReturnType<prepare> inference issue that triggers TS2322
let insertStmt: Database.Statement | null = null
let cleanupStmt: Database.Statement | null = null

function getInsertStmt(): Database.Statement {
  if (insertStmt) return insertStmt
  insertStmt = getDatabase().prepare(`
    INSERT INTO metric_snapshots (
      timestamp, cpu_usage, memory_usage, memory_used,
      disk_usage, disk_read, disk_write,
      net_down, net_up, gpu_usage, battery,
      cpu_temperature, gpu_temperature
    ) VALUES (
      @timestamp, @cpu_usage, @memory_usage, @memory_used,
      @disk_usage, @disk_read, @disk_write,
      @net_down, @net_up, @gpu_usage, @battery,
      @cpu_temperature, @gpu_temperature
    )
  `)
  return insertStmt
}

function getCleanupStmt(): Database.Statement {
  if (cleanupStmt) return cleanupStmt
  cleanupStmt = getDatabase().prepare(`
    DELETE FROM metric_snapshots WHERE timestamp < @cutoff
  `)
  return cleanupStmt
}

export function recordSnapshot(data: SnapshotData) {
  try {
    const primaryDrive = data.disk.drives.find((d) => d.mount === '/') ?? data.disk.drives[0]

    getInsertStmt().run({
      timestamp: data.timestamp ?? Date.now(),
      cpu_usage: data.cpu.usagePercent ?? 0,
      memory_usage: data.memory.usagePercent ?? 0,
      memory_used: data.memory.usedBytes ?? 0,
      disk_usage: primaryDrive?.usagePercent ?? 0,
      disk_read: data.disk.io.readBytesPerSec ?? 0,
      disk_write: data.disk.io.writeBytesPerSec ?? 0,
      net_down: data.network.totalDownloadBytesPerSec ?? 0,
      net_up: data.network.totalUploadBytesPerSec ?? 0,
      gpu_usage: data.gpu?.controllers[0]?.utilizationPercent ?? null,
      battery: data.battery?.hasBattery ? data.battery.chargePercent : null,
      cpu_temperature: normalizeTemperature(data.cpu.temperature),
      gpu_temperature: normalizeTemperature(data.gpu?.controllers[0]?.temperatureCelsius)
    })
  } catch (err) {
    console.error('Failed to record snapshot:', err)
  }
}

export function cleanOldSnapshots(retentionDays = RETENTION_DAYS) {
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const result = getCleanupStmt().run({ cutoff })
    if (result.changes > 0) {
      console.log(`Cleaned ${result.changes} old snapshots`)
    }
  } catch (err) {
    console.error('Failed to clean snapshots:', err)
  }
}

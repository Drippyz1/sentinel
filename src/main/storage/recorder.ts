import type Database from 'better-sqlite3'
import { canRecordHistory, getDatabase } from './database'
import type { MetricsSnapshot } from '../../shared/contracts'
import { historyValues } from './snapshotRow'

let insertStmt: Database.Statement | null = null
let cleanupStmt: Database.Statement | null = null

function getInsertStmt(): Database.Statement {
  if (insertStmt) return insertStmt
  insertStmt = getDatabase().prepare(`
    INSERT INTO metric_snapshots (
      timestamp, cpu_usage, memory_usage, memory_used,
      disk_usage, disk_available, disk_free, disk_purgeable, disk_read, disk_write, disk_io_in_bytes,
      net_down, net_up, gpu_usage, battery,
      cpu_temperature, gpu_temperature
    ) VALUES (
      @timestamp, @cpu_usage, @memory_usage, @memory_used,
      @disk_usage, @disk_available, @disk_free, @disk_purgeable, @disk_read, @disk_write, 1,
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

export function recordSnapshot(data: MetricsSnapshot) {
  if (!canRecordHistory()) return
  try {
    const metrics = historyValues(data)
    if (Object.values(metrics).some((value) => value !== null)) {
      getInsertStmt().run({ timestamp: data.timestamp, ...metrics })
    }
  } catch (err) {
    console.error('Failed to record snapshot:', err)
  }
}

export function cleanOldSnapshots(retentionDays: number) {
  if (!canRecordHistory()) return
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

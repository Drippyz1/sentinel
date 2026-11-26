import type Database from 'better-sqlite3'
import { getDatabase } from './database'
import type { SnapshotRow } from '../../shared/contracts'
import { normalizeTemperature } from '../../shared/utils/temperature'

interface HistoryMetadata {
  snapshotCount: number
  oldestTimestamp: number | null
  newestTimestamp: number | null
}

export function getHistoryMetadata(): HistoryMetadata {
  return getDatabase()
    .prepare(
      `
    SELECT
      COUNT(*) as snapshotCount,
      MIN(timestamp) as oldestTimestamp,
      MAX(timestamp) as newestTimestamp
    FROM metric_snapshots
  `
    )
    .get() as HistoryMetadata
}

const bucketMs = 60_000
let downsampleStatement: Database.Statement<[number], SnapshotRow> | undefined

export function getDownsampled(minutes: number): SnapshotRow[] {
  const cutoff = Date.now() - minutes * bucketMs

  downsampleStatement ??= getDatabase().prepare<[number], SnapshotRow>(
    `
    SELECT
      (timestamp / ${bucketMs}) * ${bucketMs} as timestamp,
      ROUND(AVG(cpu_usage), 1)    as cpu_usage,
      ROUND(AVG(memory_usage), 1) as memory_usage,
      ROUND(AVG(memory_used), 0)  as memory_used,
      ROUND(AVG(disk_usage), 1)   as disk_usage,
      ROUND(AVG(disk_available), 0) as disk_available,
      ROUND(AVG(disk_free), 0)    as disk_free,
      ROUND(AVG(disk_purgeable), 0) as disk_purgeable,
      ROUND(AVG(CASE WHEN disk_io_in_bytes = 1 THEN disk_read END), 0) as disk_read,
      ROUND(AVG(CASE WHEN disk_io_in_bytes = 1 THEN disk_write END), 0) as disk_write,
      ROUND(AVG(CASE WHEN disk_io_in_bytes IS NULL THEN disk_read END), 1) as disk_read_legacy_ops,
      ROUND(AVG(CASE WHEN disk_io_in_bytes IS NULL THEN disk_write END), 1) as disk_write_legacy_ops,
      ROUND(AVG(net_down), 0)     as net_down,
      ROUND(AVG(net_up), 0)       as net_up,
      ROUND(AVG(gpu_usage), 1)    as gpu_usage,
      ROUND(AVG(battery), 1)      as battery,
      ROUND(AVG(
        CASE WHEN cpu_temperature > 0 AND cpu_temperature < 1.7976931348623157e308
          THEN cpu_temperature
        END
      ), 1) as cpu_temperature,
      ROUND(AVG(
        CASE WHEN gpu_temperature > 0 AND gpu_temperature < 1.7976931348623157e308
          THEN gpu_temperature
        END
      ), 1) as gpu_temperature
    FROM metric_snapshots
    WHERE timestamp > ?
    GROUP BY timestamp / ${bucketMs}
    ORDER BY timestamp ASC
  `
  )
  return downsampleStatement.all(cutoff).map(normalizeSnapshotTemperatures)
}

function normalizeSnapshotTemperatures(snapshot: SnapshotRow): SnapshotRow {
  return {
    ...snapshot,
    cpu_temperature: normalizeTemperature(snapshot.cpu_temperature),
    gpu_temperature: normalizeTemperature(snapshot.gpu_temperature)
  }
}

import type Database from 'better-sqlite3'
import { getDatabase } from './database'
import { HISTORY_BUCKET_MS as bucketMs, type SnapshotRow } from '../../shared/contracts'
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

let downsampleStatement: Database.Statement<[number, number], SnapshotRow> | undefined

function average(
  field: string,
  digits: number,
  maximum = Number.MAX_SAFE_INTEGER,
  condition = '1'
): string {
  return `ROUND(AVG(CASE WHEN ${condition} AND typeof(${field}) IN ('integer','real')
    AND ${field} BETWEEN 0 AND ${maximum} THEN ${field} END), ${digits})`
}

export function getDownsampled(minutes: number): SnapshotRow[] {
  const now = Date.now()
  const cutoff = now - minutes * bucketMs

  downsampleStatement ??= getDatabase().prepare<[number, number], SnapshotRow>(
    `
    SELECT
      (timestamp / ${bucketMs}) * ${bucketMs} as timestamp,
      ${average('cpu_usage', 1, 100)}    as cpu_usage,
      ${average('memory_usage', 1, 100)} as memory_usage,
      ${average('memory_used', 0)}  as memory_used,
      ${average('disk_usage', 1, 100)}   as disk_usage,
      ${average('disk_available', 0)} as disk_available,
      ${average('disk_free', 0)}    as disk_free,
      ${average('disk_purgeable', 0)} as disk_purgeable,
      ${average('disk_read', 0, undefined, 'disk_io_in_bytes = 1')} as disk_read,
      ${average('disk_write', 0, undefined, 'disk_io_in_bytes = 1')} as disk_write,
      ${average('disk_read', 1, undefined, 'disk_io_in_bytes IS NULL')} as disk_read_legacy_ops,
      ${average('disk_write', 1, undefined, 'disk_io_in_bytes IS NULL')} as disk_write_legacy_ops,
      ${average('net_down', 0)}     as net_down,
      ${average('net_up', 0)}       as net_up,
      ${average('gpu_usage', 1, 100)}    as gpu_usage,
      ${average('battery', 1, 100)}      as battery,
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
    WHERE timestamp > ? AND timestamp <= ?
    GROUP BY timestamp / ${bucketMs}
    ORDER BY timestamp ASC
  `
  )
  return downsampleStatement.all(cutoff, now).map(normalizeSnapshotTemperatures)
}

function normalizeSnapshotTemperatures(snapshot: SnapshotRow): SnapshotRow {
  return {
    ...snapshot,
    cpu_temperature: normalizeTemperature(snapshot.cpu_temperature),
    gpu_temperature: normalizeTemperature(snapshot.gpu_temperature)
  }
}

import type { SnapshotRow } from '../contracts'

export const HISTORY_CSV_HEADER = [
  'timestamp',
  'cpu_usage',
  'memory_usage',
  'disk_read',
  'disk_write',
  'net_down',
  'net_up',
  'gpu_usage',
  'cpu_temperature',
  'gpu_temperature',
  'battery'
] as const

export function formatHistoryCsv(data: SnapshotRow[]): string {
  const rows = data.map((snapshot) =>
    [
      new Date(snapshot.timestamp).toISOString(),
      snapshot.cpu_usage,
      snapshot.memory_usage,
      snapshot.disk_read,
      snapshot.disk_write,
      snapshot.net_down,
      snapshot.net_up,
      snapshot.gpu_usage ?? '',
      snapshot.cpu_temperature ?? '',
      snapshot.gpu_temperature ?? '',
      snapshot.battery ?? ''
    ].join(',')
  )

  return `\uFEFF${[HISTORY_CSV_HEADER.join(','), ...rows].join('\r\n')}`
}

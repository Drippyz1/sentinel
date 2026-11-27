import { HISTORY_BUCKET_MS, type MetricGroup, type MetricsSnapshot } from '../../shared/contracts'
import { selectPrimaryDrive } from '../../shared/utils/disk'
import { normalizeTemperature } from '../../shared/utils/temperature'
import { boundedPercent } from '../../shared/utils/visualization'

const bytes = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export function historyValues(data: MetricsSnapshot): Record<string, number | null> {
  const fresh = (group: MetricGroup) =>
    data.updatedGroups.includes(group) && data.statuses[group].state === 'ok'
  const primaryDrive = fresh('diskCapacity') ? selectPrimaryDrive(data.disk.drives) : null
  const cpu = fresh('cpu') ? data.cpu : null
  const memory = fresh('memory') ? data.memory : null
  const io = fresh('diskIo') ? data.disk.io : null
  const network = fresh('network') ? data.network : null
  const gpu = fresh('gpu') ? data.gpu?.controllers[0] : null
  const battery = fresh('battery') ? data.battery : null
  const cpuTemperature = fresh('cpuTemperature') ? normalizeTemperature(data.cpuTemperature) : null

  return {
    cpu_usage: boundedPercent(cpu?.usagePercent),
    memory_usage: boundedPercent(memory?.usagePercent),
    memory_used: bytes(memory?.usedBytes),
    disk_usage: boundedPercent(primaryDrive?.usagePercent),
    disk_available: bytes(primaryDrive?.availableBytes),
    disk_free: bytes(primaryDrive?.freeBytes),
    disk_purgeable: bytes(primaryDrive?.purgeableBytes),
    disk_read: bytes(io?.readBytesPerSec),
    disk_write: bytes(io?.writeBytesPerSec),
    net_down: bytes(network?.totalDownloadBytesPerSec),
    net_up: bytes(network?.totalUploadBytesPerSec),
    gpu_usage: boundedPercent(gpu?.utilizationPercent),
    battery: battery?.hasBattery ? boundedPercent(battery.chargePercent) : null,
    cpu_temperature: cpuTemperature,
    gpu_temperature: normalizeTemperature(gpu?.temperatureCelsius)
  }
}

const FIELD_GROUPS = {
  cpu_usage: 'cpu',
  memory_usage: 'memory',
  memory_used: 'memory',
  disk_usage: 'diskCapacity',
  disk_available: 'diskCapacity',
  disk_free: 'diskCapacity',
  disk_purgeable: 'diskCapacity',
  disk_read: 'diskIo',
  disk_write: 'diskIo',
  net_down: 'network',
  net_up: 'network',
  gpu_usage: 'gpu',
  gpu_temperature: 'gpu',
  battery: 'battery',
  cpu_temperature: 'cpuTemperature'
} as const satisfies Record<string, MetricGroup>
const FIELDS = Object.entries(FIELD_GROUPS)
const EMPTY_FIELDS = Object.fromEntries(FIELDS.map(([name]) => [name, null]))

export function historyRows(data: MetricsSnapshot): Record<string, number | null>[] {
  const observations = historyValues(data)
  const buckets = new Map<number, Record<string, number | null>>()
  for (const [name, group] of FIELDS) {
    const value = observations[name]
    const timestamp = data.statuses[group].sampledAt
    if (
      value === null ||
      timestamp === null ||
      !Number.isSafeInteger(timestamp) ||
      timestamp <= 0 ||
      timestamp > data.timestamp ||
      data.timestamp - timestamp > 45_000
    )
      continue
    // Coalesce only observations that belong to the same historical minute.
    const bucket = Math.floor(timestamp / HISTORY_BUCKET_MS)
    let row = buckets.get(bucket)
    if (!row) {
      row = { ...EMPTY_FIELDS, timestamp }
      buckets.set(bucket, row)
    }
    row.timestamp = Math.max(row.timestamp ?? timestamp, timestamp)
    row[name] = value
  }
  return [...buckets.values()]
}

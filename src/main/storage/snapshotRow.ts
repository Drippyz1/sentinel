import type { MetricGroup, MetricsSnapshot } from '../../shared/contracts'
import { selectPrimaryDrive } from '../../shared/utils/disk'
import { normalizeTemperature } from '../../shared/utils/temperature'

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
    cpu_usage: cpu?.usagePercent ?? null,
    memory_usage: memory?.usagePercent ?? null,
    memory_used: memory?.usedBytes ?? null,
    disk_usage: primaryDrive?.usagePercent ?? null,
    disk_available: primaryDrive?.availableBytes ?? null,
    disk_free: primaryDrive?.freeBytes ?? null,
    disk_purgeable: primaryDrive?.purgeableBytes ?? null,
    disk_read: io?.readBytesPerSec ?? null,
    disk_write: io?.writeBytesPerSec ?? null,
    net_down: network?.totalDownloadBytesPerSec ?? null,
    net_up: network?.totalUploadBytesPerSec ?? null,
    gpu_usage: gpu?.utilizationPercent ?? null,
    battery: battery?.hasBattery ? battery.chargePercent : null,
    cpu_temperature: cpuTemperature,
    gpu_temperature: normalizeTemperature(gpu?.temperatureCelsius)
  }
}

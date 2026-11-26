import si from 'systeminformation'
import { cpus, type CpuInfo } from 'node:os'
import type { MetricCollectionResult, MetricGroupValues } from '../../shared/contracts'
import { normalizeTemperature } from '../../shared/utils/temperature'
import { cachedProbe, observed, unavailable } from '../probe'

export const getCpuInventory = cachedProbe(() => si.cpu())

function counters(cores: CpuInfo[]) {
  return cores.map(({ times }) => ({
    idle: times.idle,
    total: times.user + times.nice + times.sys + times.idle + times.irq
  }))
}

let previous = counters(cpus())

export async function getCpuMetrics(): Promise<MetricCollectionResult<MetricGroupValues['cpu']>> {
  const current = counters(cpus())
  const deltas =
    current.length === previous.length
      ? current.map(({ total, idle }, index) => {
          const elapsed = total - previous[index].total
          const idleDelta = idle - previous[index].idle
          return elapsed > 0 && idleDelta >= 0 && idleDelta <= elapsed
            ? { total: elapsed, busy: elapsed - idleDelta }
            : null
        })
      : []
  previous = current
  if (!current.length) return unavailable('no-data')
  if (!deltas.length || deltas.some((entry) => entry === null)) return unavailable('warming-up')
  const staticInfo = await getCpuInventory()
  let busy = 0
  let elapsed = 0
  for (const entry of deltas) {
    if (!entry) continue
    busy += entry.busy
    elapsed += entry.total
  }

  return observed({
    manufacturer: staticInfo.manufacturer,
    brand: staticInfo.brand,
    speedGHz: staticInfo.speed,
    cores: staticInfo.cores,
    usagePercent: Math.round((busy / elapsed) * 100),
    perCoreUsage: deltas.map((entry) => entry && Math.round((entry.busy / entry.total) * 100))
  })
}

export async function getCpuTemperature(): Promise<MetricCollectionResult<number>> {
  const temperature = normalizeTemperature((await si.cpuTemperature()).main)
  return temperature === null ? unavailable('no-data') : observed(temperature)
}

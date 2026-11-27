import si from 'systeminformation'
import { cpus, loadavg, type CpuInfo } from 'node:os'
import type { MetricCollectionResult, MetricGroupValues } from '../../shared/contracts'
import { normalizeTemperature } from '../../shared/utils/temperature'
import { cachedProbe, observed, unavailable } from '../probe'
import { usableInterval } from '../counterRates'

export const getCpuInventory = cachedProbe(() => si.cpu())

function counters(cores: CpuInfo[]) {
  return cores.map(({ times }) => [times.idle, times.user, times.nice, times.sys, times.irq])
}

let previous = { counters: counters(cpus()), monotonic: performance.now(), wall: Date.now() }

export function clearCpuBaselines(): void {
  previous = { counters: [], monotonic: performance.now(), wall: Date.now() }
}

export async function getCpuMetrics(): Promise<MetricCollectionResult<MetricGroupValues['cpu']>> {
  const current = counters(cpus())
  const monotonic = performance.now()
  const wall = Date.now()
  const deltas =
    current.length === previous.counters.length &&
    usableInterval(monotonic - previous.monotonic, wall - previous.wall)
      ? current.map((values, index) => {
          const change = values.map((value, n) => value - previous.counters[index][n])
          if (change.some((value) => !Number.isFinite(value) || value < 0)) return null
          const total = change.reduce((sum, value) => sum + value, 0)
          return total > 0 ? { total, busy: total - change[0] } : null
        })
      : []
  previous = { counters: current, monotonic, wall }
  if (!current.length) return unavailable('no-data')
  if (!deltas.some(Boolean)) return unavailable('warming-up')
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
    cores: current.length,
    physicalCores: staticInfo.physicalCores > 0 ? staticInfo.physicalCores : null,
    ...(process.platform !== 'win32' && { loadAverage: loadavg() }),
    usagePercent: deltas.every(Boolean) ? Math.round((busy / elapsed) * 100) : null,
    perCoreUsage: deltas.map((entry) => entry && Math.round((entry.busy / entry.total) * 100))
  })
}

export async function getCpuTemperature(): Promise<MetricCollectionResult<number>> {
  const temperature = normalizeTemperature((await si.cpuTemperature()).main)
  return temperature === null ? unavailable('no-data') : observed(temperature)
}
